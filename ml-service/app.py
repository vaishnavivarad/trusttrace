"""TrustTrace Siamese CNN inference service.
The service never reports a match unless a trained model and validated distance threshold exist.
"""
import io, json, os
from pathlib import Path
from typing import Optional
import numpy as np
from PIL import Image, ImageStat, UnidentifiedImageError
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

APP_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv('MODEL_PATH', str(APP_DIR / 'models' / 'siamese_mobilenetv2.keras')))
MODEL_VERSION = os.getenv('MODEL_VERSION', 'not-trained')
THRESHOLD_ENV = os.getenv('SIMILARITY_DISTANCE_THRESHOLD', '').strip()
IMG_SIZE = (224, 224)
_model = None
_threshold: Optional[float] = None
_load_error = None

app = FastAPI(title='TrustTrace Siamese CNN', version='1.0.0')

def ensure_model_file():
    """Optionally fetch the model from MODEL_DOWNLOAD_URL (verified by MODEL_SHA256) so weights stay out of Git."""
    url = os.getenv('MODEL_DOWNLOAD_URL', '').strip()
    if MODEL_PATH.exists() or not url: return
    import hashlib, urllib.request
    expected = os.getenv('MODEL_SHA256', '').strip().lower()
    if not expected: raise RuntimeError('MODEL_SHA256 is required when MODEL_DOWNLOAD_URL is set.')
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = MODEL_PATH.with_suffix('.download')
    with urllib.request.urlopen(url, timeout=120) as resp, open(tmp, 'wb') as out:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk: break
            out.write(chunk)
    digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
    if digest != expected:
        tmp.unlink(missing_ok=True)
        raise RuntimeError('Downloaded model SHA-256 does not match MODEL_SHA256.')
    tmp.replace(MODEL_PATH)

def load_model_once():
    global _model, _threshold, _load_error
    if _model is not None and _threshold is not None: return
    try: ensure_model_file()
    except Exception as exc:
        _load_error = f'Model download failed: {exc}'
        return
    if not MODEL_PATH.exists():
        _load_error = f'Trained model file not found: {MODEL_PATH}'
        return
    threshold = None
    if THRESHOLD_ENV:
        try: threshold = float(THRESHOLD_ENV)
        except ValueError: _load_error = 'SIMILARITY_DISTANCE_THRESHOLD is not a valid number.'; return
    else:
        threshold_path = APP_DIR / 'models' / 'threshold.json'
        if threshold_path.exists():
            try: threshold = float(json.loads(threshold_path.read_text(encoding='utf-8'))['distance_threshold'])
            except Exception: threshold = None
    if threshold is None or not np.isfinite(threshold) or threshold <= 0:
        _load_error = 'Validated threshold is missing. Train/evaluate the model or configure SIMILARITY_DISTANCE_THRESHOLD from validation results.'
        return
    try:
        import tensorflow as tf
        from tensorflow.keras import layers
        @tf.keras.utils.register_keras_serializable(package='TrustTrace')
        class EuclideanDistance(layers.Layer):
            def call(self, inputs):
                a, b = inputs
                return tf.sqrt(tf.reduce_sum(tf.square(a-b), axis=1, keepdims=True) + 1e-8)
        _model = tf.keras.models.load_model(MODEL_PATH, compile=False, custom_objects={'EuclideanDistance': EuclideanDistance})
        _threshold = threshold
        _load_error = None
        global MODEL_VERSION
        if MODEL_VERSION == 'not-trained':
            MODEL_VERSION = 'siamese-mobilenetv2-v1'
    except Exception as exc:
        _load_error = f'Could not load the trained model: {exc}'
        _model = None; _threshold = None

def inspect_image(data: bytes):
    try:
        image = Image.open(io.BytesIO(data)).convert('RGB')
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError('The uploaded file is not a valid readable image.') from exc
    if image.width < 100 or image.height < 100:
        raise ValueError('Image resolution is too small. Please retake a clearer photo.')
    stats = ImageStat.Stat(image.convert('L'))
    brightness = stats.mean[0]
    if brightness < 10 or brightness > 247:
        raise ValueError('The image is too dark or overexposed. Please retake the photo in better light.')
    image = image.resize(IMG_SIZE, Image.Resampling.BILINEAR)
    arr = np.asarray(image, dtype=np.float32)
    try:
        import tensorflow as tf
        arr = tf.keras.applications.mobilenet_v2.preprocess_input(arr)
    except Exception as exc:
        raise RuntimeError('TensorFlow is not installed. Install ml-service/requirements.txt.') from exc
    return np.expand_dims(arr, axis=0)

@app.get('/health')
def health():
    load_model_once()
    if _model is None or _threshold is None:
        return { 'status': 'not_configured', 'modelVersion': MODEL_VERSION, 'message': _load_error or 'Model is not configured.' }
    return { 'status': 'ready', 'modelVersion': MODEL_VERSION, 'threshold': _threshold }

@app.post('/compare')
async def compare(reference_image: UploadFile = File(...), current_image: UploadFile = File(...)):
    if reference_image.content_type not in ('image/jpeg','image/png','image/webp') or current_image.content_type not in ('image/jpeg','image/png','image/webp'):
        return JSONResponse(status_code=422, content={'result':'NEED_RETAKE','code':'INVALID_IMAGE_TYPE','message':'Upload JPEG, PNG or WebP images.','qualityStatus':'INVALID_TYPE'})
    reference_bytes = await reference_image.read(); current_bytes = await current_image.read()
    if not reference_bytes or not current_bytes or len(reference_bytes) > 8*1024*1024 or len(current_bytes) > 8*1024*1024:
        return JSONResponse(status_code=422, content={'result':'NEED_RETAKE','code':'INVALID_IMAGE_SIZE','message':'Each image must be non-empty and no larger than 8 MB.','qualityStatus':'INVALID_SIZE'})
    try:
        ref = inspect_image(reference_bytes); cur = inspect_image(current_bytes)
    except ValueError as exc:
        return JSONResponse(status_code=200, content={'result':'NEED_RETAKE','code':'IMAGE_QUALITY','message':str(exc),'qualityStatus':'NEEDS_RETAKE','modelVersion':MODEL_VERSION})
    except RuntimeError as exc:
        return JSONResponse(status_code=503, content={'result':'MODEL_NOT_CONFIGURED','code':'TENSORFLOW_NOT_READY','message':str(exc),'qualityStatus':'UNKNOWN','modelVersion':MODEL_VERSION})
    load_model_once()
    if _model is None or _threshold is None:
        return JSONResponse(status_code=503, content={'result':'MODEL_NOT_CONFIGURED','code':'MODEL_NOT_CONFIGURED','message':_load_error or 'Siamese CNN model is not configured.','qualityStatus':'ACCEPTABLE','modelVersion':MODEL_VERSION})
    try:
        distance = float(np.asarray(_model.predict([ref, cur], verbose=0)).reshape(-1)[0])
    except Exception as exc:
        return JSONResponse(status_code=503, content={'result':'MODEL_NOT_CONFIGURED','code':'INFERENCE_FAILED','message':f'Model inference failed: {exc}','qualityStatus':'UNKNOWN','modelVersion':MODEL_VERSION})
    if not np.isfinite(distance):
        return JSONResponse(status_code=503, content={'result':'MODEL_NOT_CONFIGURED','code':'INVALID_MODEL_OUTPUT','message':'The model returned an invalid score.','qualityStatus':'UNKNOWN','modelVersion':MODEL_VERSION})
    result = 'MATCH' if distance <= _threshold else 'MISMATCH'
    message = 'The packaging image is within the validated match threshold.' if result == 'MATCH' else 'The packaging image differs from the registered reference beyond the validated threshold.'
    return {'result':result, 'distance':distance, 'threshold':_threshold, 'score':max(0.0, min(1.0, 1.0-distance)), 'modelVersion':MODEL_VERSION, 'qualityStatus':'ACCEPTABLE', 'message':message}
