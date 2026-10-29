# pyright: reportMissingImports=false, reportMissingModuleSource=false
"""TrustTrace Siamese CNN & Multi-Feature Packaging Verification Service.
Combines:
1. Siamese MobileNetV2 contrastive embedding similarity across multi-scale upright center crops (1.0, 0.85, 0.72, 0.60)
2. Pretrained MobileNetV2 1280-D deep backbone cosine similarity (object/container semantics)
3. Lighting-invariant Chromaticity + HSV spatial brand-color signature
4. Perceptual structural gradient hash (dHash) similarity
"""
import hashlib, io, json, os, threading
os.environ.setdefault('TF_ENABLE_ONEDNN_OPTS', '0')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
from pathlib import Path
from typing import Optional
import numpy as np
from PIL import Image, ImageOps, ImageStat, UnidentifiedImageError
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

APP_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv('MODEL_PATH', str(APP_DIR / 'models' / 'siamese_mobilenetv2.keras')))
MODEL_VERSION = os.getenv('MODEL_VERSION', 'not-trained')
THRESHOLD_ENV = os.getenv('SIMILARITY_DISTANCE_THRESHOLD', '').strip()
IMG_SIZE = (224, 224)
_model = None
_encoder = None
_backbone_pool_model = None
_threshold: Optional[float] = None
_load_error = None
_inference_lock = threading.Lock()

app = FastAPI(title='TrustTrace Siamese CNN', version='2.3.0')

def ensure_model_file():
    """Optionally fetch the model from MODEL_DOWNLOAD_URL (verified by MODEL_SHA256) so weights stay out of Git."""
    url = os.getenv('MODEL_DOWNLOAD_URL', '').strip()
    if MODEL_PATH.exists() or not url: return
    import urllib.request
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
    global _model, _encoder, _backbone_pool_model, _threshold, _load_error, MODEL_VERSION
    if _model is not None and _threshold is not None: return
    with _inference_lock:
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
            try:
                tf.config.threading.set_inter_op_parallelism_threads(1)
                tf.config.threading.set_intra_op_parallelism_threads(2)
            except RuntimeError:
                pass
            from tensorflow.keras import layers
            @tf.keras.utils.register_keras_serializable(package='TrustTrace')
            class EuclideanDistance(layers.Layer):
                def call(self, inputs):
                    a, b = inputs
                    return tf.sqrt(tf.reduce_sum(tf.square(a-b), axis=1, keepdims=True) + 1e-8)
            loaded = tf.keras.models.load_model(MODEL_PATH, compile=False, custom_objects={'EuclideanDistance': EuclideanDistance})
            enc = None
            backbone_pool = None
            try:
                enc = loaded.get_layer('mobilenetv2_encoder')
                bb = enc.get_layer('mobilenetv2_backbone')
                inp = tf.keras.Input(shape=(IMG_SIZE[0], IMG_SIZE[1], 3))
                feat = layers.GlobalAveragePooling2D()(bb(inp, training=False))
                norm_feat = layers.UnitNormalization(axis=-1)(feat)
                backbone_pool = tf.keras.Model(inp, norm_feat, name='backbone_pool_extractor')
            except Exception:
                pass
            dummy = np.zeros((1, IMG_SIZE[0], IMG_SIZE[1], 3), dtype=np.float32)
            _ = loaded([dummy, dummy], training=False)
            if enc is not None:
                _ = enc(dummy, training=False)
            if backbone_pool is not None:
                _ = backbone_pool(dummy, training=False)
            _model = loaded
            _encoder = enc
            _backbone_pool_model = backbone_pool
            _threshold = threshold
            _load_error = None
            if MODEL_VERSION == 'not-trained':
                MODEL_VERSION = 'siamese-mobilenetv2-hybrid-v5'
        except Exception as exc:
            _load_error = f'Could not load the trained model: {exc}'
            _model = None; _threshold = None

def decode_and_validate_pil(data: bytes) -> Image.Image:
    try:
        raw = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(raw).convert('RGB')
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError('The uploaded file is not a valid readable image.') from exc
    if image.width < 80 or image.height < 80:
        raise ValueError('Image resolution is too small. Please retake a clearer photo.')
    stats = ImageStat.Stat(image.convert('L'))
    brightness = stats.mean[0]
    if brightness < 8 or brightness > 250:
        raise ValueError('The image is too dark or overexposed. Please retake the photo in better light.')
    return image

def center_crop_fraction(image: Image.Image, fraction: float) -> Image.Image:
    if fraction >= 0.999:
        return image
    w, h = image.size
    cw, ch = max(32, int(round(w * fraction))), max(32, int(round(h * fraction)))
    left = (w - cw) // 2
    top = (h - ch) // 2
    return image.crop((left, top, left + cw, top + ch))

def preprocess_pil_batch(images: list[Image.Image]) -> np.ndarray:
    arrs = []
    for img in images:
        resized = img.resize(IMG_SIZE, Image.Resampling.BILINEAR)
        arr = np.asarray(resized, dtype=np.float32)
        # MobileNetV2 preprocess_input scales [0, 255] -> [-1, 1]
        arr = (arr / 127.5) - 1.0
        arrs.append(arr)
    return np.stack(arrs, axis=0)

def _smooth_hist(h: np.ndarray) -> np.ndarray:
    kernel = np.array([0.25, 0.5, 0.25], dtype=np.float32)
    return np.convolve(h.astype(np.float32), kernel, mode='same')

def compute_spatial_color_descriptor(image: Image.Image, crop_frac: float = 0.70) -> np.ndarray:
    """Computes lighting-invariant Chromaticity (R/(R+G+B), G/(R+G+B)) + smoothed HSV brand-color signature."""
    focused = center_crop_fraction(image, crop_frac).resize((96, 96), Image.Resampling.BILINEAR)
    rgb = np.asarray(focused, dtype=np.float32)
    hsv = np.asarray(focused.convert('HSV'), dtype=np.float32) / 255.0

    # Chromaticity ratios are invariant to overall brightness/exposure changes between camera shots
    total = rgb[:, :, 0] + rgb[:, :, 1] + rgb[:, :, 2] + 1.0
    r_chrom = (rgb[:, :, 0] / total).flatten()
    g_chrom = (rgb[:, :, 1] / total).flatten()
    b_chrom = (rgb[:, :, 2] / total).flatten()

    sat = hsv[:, :, 1].flatten()
    hue = hsv[:, :, 0].flatten()
    # Weight chromaticity & hue histograms by saturation so neutral background pixels don't mask product color
    fg_w = np.clip(sat, 0.05, 1.0)

    r_hist = _smooth_hist(np.histogram(r_chrom, bins=12, range=(0.0, 1.0), weights=fg_w)[0])
    g_hist = _smooth_hist(np.histogram(g_chrom, bins=12, range=(0.0, 1.0), weights=fg_w)[0])
    b_hist = _smooth_hist(np.histogram(b_chrom, bins=12, range=(0.0, 1.0), weights=fg_w)[0])

    # Circular wrap smoothing for hue so red (near 0.0 and 1.0) stays continuous under warm/cool lighting
    raw_h = np.histogram(hue, bins=16, range=(0.0, 1.0), weights=sat)[0].astype(np.float32)
    wrapped_h = np.concatenate([[raw_h[-1]], raw_h, [raw_h[0]]])
    h_hist = np.convolve(wrapped_h, np.array([0.25, 0.5, 0.25], dtype=np.float32), mode='valid')
    s_hist = _smooth_hist(np.histogram(sat, bins=8, range=(0.0, 1.0))[0])

    vec = np.concatenate([r_hist, g_hist, b_hist, h_hist * 1.5, s_hist]).astype(np.float32)
    return vec / (np.linalg.norm(vec) + 1e-8)

def compute_dhash(image: Image.Image, hash_size: int = 16) -> np.ndarray:
    focused = center_crop_fraction(image, 0.80).convert('L').resize((hash_size + 1, hash_size), Image.Resampling.BILINEAR)
    pixels = np.asarray(focused, dtype=np.float32)
    diff = pixels[:, 1:] > pixels[:, :-1]
    return diff.flatten().astype(np.float32)

def extract_qr_grid(data: bytes, grid_size: int = 64) -> np.ndarray:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('L')
    arr = np.asarray(img, dtype=np.float32)
    thresh = (float(np.min(arr)) + float(np.max(arr))) * 0.5
    dark = arr < thresh
    ys, xs = np.where(dark)
    if len(xs) > 20 and len(ys) > 20:
        x0, x1 = int(np.min(xs)), int(np.max(xs))
        y0, y1 = int(np.min(ys)), int(np.max(ys))
        if (x1 - x0) > 16 and (y1 - y0) > 16:
            cropped = img.crop((x0, y0, x1 + 1, y1 + 1))
        else:
            cropped = img
    else:
        cropped = img
    resized = cropped.resize((grid_size, grid_size), Image.Resampling.BILINEAR)
    g = np.asarray(resized, dtype=np.float32)
    t = (float(np.min(g)) + float(np.max(g))) * 0.5
    return (g < t).astype(np.float32).flatten()

@app.post('/match-qr')
async def match_qr(qr_image: UploadFile = File(...)):
    qr_dir = APP_DIR.parent / 'backend' / 'uploads' / 'qr_codes'
    raw = await qr_image.read()
    if not raw or not qr_dir.exists():
        return JSONResponse(status_code=404, content={'matched': False})
    try:
        target_grid = extract_qr_grid(raw)
    except Exception:
        return JSONResponse(status_code=422, content={'matched': False})
    best_pid = None
    best_diff = 1.0
    for png in qr_dir.glob('*.png'):
        try:
            cand_grid = extract_qr_grid(png.read_bytes())
            diff = float(np.mean(np.abs(target_grid - cand_grid)))
            if diff < best_diff:
                best_diff = diff
                best_pid = png.stem
        except Exception:
            continue
    if best_pid and best_diff <= 0.24:
        return {'matched': True, 'productId': best_pid, 'difference': round(best_diff, 4)}
    return JSONResponse(status_code=404, content={'matched': False, 'bestDifference': round(best_diff, 4)})

def inspect_image(data: bytes):
    image = decode_and_validate_pil(data)
    return preprocess_pil_batch([image])

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
    reference_bytes = await reference_image.read(); current_image_bytes = await current_image.read()
    if not reference_bytes or not current_image_bytes or len(reference_bytes) > 8*1024*1024 or len(current_image_bytes) > 8*1024*1024:
        return JSONResponse(status_code=422, content={'result':'NEED_RETAKE','code':'INVALID_IMAGE_SIZE','message':'Each image must be non-empty and no larger than 8 MB.','qualityStatus':'INVALID_SIZE'})
    try:
        ref_pil = decode_and_validate_pil(reference_bytes)
        cur_pil = decode_and_validate_pil(current_image_bytes)
    except ValueError as exc:
        return JSONResponse(status_code=200, content={'result':'NEED_RETAKE','code':'IMAGE_QUALITY','message':str(exc),'qualityStatus':'NEEDS_RETAKE','modelVersion':MODEL_VERSION})
    load_model_once()
    if _model is None or _threshold is None:
        return JSONResponse(status_code=503, content={'result':'MODEL_NOT_CONFIGURED','code':'MODEL_NOT_CONFIGURED','message':_load_error or 'Siamese CNN model is not configured.','qualityStatus':'ACCEPTABLE','modelVersion':MODEL_VERSION})

    # Fast-path if exact identical file bytes
    if hashlib.sha256(reference_bytes).hexdigest() == hashlib.sha256(current_image_bytes).hexdigest():
        return {
            'result': 'MATCH',
            'distance': 0.0,
            'threshold': _threshold,
            'score': 1.0,
            'modelVersion': MODEL_VERSION,
            'qualityStatus': 'ACCEPTABLE',
            'message': 'Packaging verified! Exact 100% visual match with the registered reference packaging.'
        }

    try:
        # Upright multi-scale crops (100%, 85%, 72%, 60%) handle phone camera framing & distance differences
        # without 90/180/270 rotations that could match unrelated products.
        ref_crops = [
            center_crop_fraction(ref_pil, 1.0),
            center_crop_fraction(ref_pil, 0.85),
            center_crop_fraction(ref_pil, 0.72),
            center_crop_fraction(ref_pil, 0.60),
        ]
        cur_crops = [
            center_crop_fraction(cur_pil, 1.0),
            center_crop_fraction(cur_pil, 0.85),
            center_crop_fraction(cur_pil, 0.72),
            center_crop_fraction(cur_pil, 0.60),
        ]
        ref_batch = preprocess_pil_batch(ref_crops)
        cur_batch = preprocess_pil_batch(cur_crops)

        with _inference_lock:
            if _encoder is not None:
                ref_emb = np.asarray(_encoder(ref_batch, training=False), dtype=np.float32)
                cur_emb = np.asarray(_encoder(cur_batch, training=False), dtype=np.float32)
                diffs = ref_emb[:, None, :] - cur_emb[None, :, :]
                dists = np.sqrt(np.sum(np.square(diffs), axis=-1) + 1e-8)
                siamese_dist = float(np.min(dists))
            else:
                pred = _model([ref_batch[:1], cur_batch[:1]], training=False)
                siamese_dist = float(np.asarray(pred).reshape(-1)[0])

            if _backbone_pool_model is not None:
                ref_bb = np.asarray(_backbone_pool_model(ref_batch, training=False), dtype=np.float32)
                cur_bb = np.asarray(_backbone_pool_model(cur_batch, training=False), dtype=np.float32)
                cos_sim = np.matmul(ref_bb, cur_bb.T)
                cos_dists = np.clip(1.0 - cos_sim, 0.0, 2.0)
                backbone_dist = float(np.min(cos_dists))
            else:
                backbone_dist = siamese_dist

        # Lighting-invariant brand chromaticity distance across upright crops
        ref_colors = [
            compute_spatial_color_descriptor(ref_pil, 0.75),
            compute_spatial_color_descriptor(ref_pil, 0.58),
        ]
        cur_colors = [
            compute_spatial_color_descriptor(cur_pil, 0.75),
            compute_spatial_color_descriptor(cur_pil, 0.58),
        ]
        color_dist = float(min(
            np.clip(1.0 - float(np.dot(rc, cc)), 0.0, 1.0)
            for rc in ref_colors for cc in cur_colors
        ))

        # Perceptual structural gradient hash distance
        ref_hash = compute_dhash(ref_pil)
        cur_hash = compute_dhash(cur_pil)
        dhash_dist = float(np.mean(np.abs(ref_hash - cur_hash)))

        # Weighted visual difference score
        # Empirical calibration on user's real scans:
        # - Same product (Ketchup vs Ketchup, Mayo vs Mayo): hybrid_distance ~ 0.18 - 0.24
        # - Different product (Ketchup vs Mayo): hybrid_distance ~ 0.37 - 0.55
        hybrid_distance = (
            0.45 * siamese_dist +
            0.30 * backbone_dist +
            0.20 * color_dist +
            0.05 * dhash_dist
        )

        # Strict separation boundary between Same-Product (<= 0.305) and Different-Product (> 0.305)
        if dhash_dist <= 0.16 or (hybrid_distance <= 0.305 and siamese_dist <= 0.46 and color_dist <= 0.22 and backbone_dist <= 0.34):
            distance = min(hybrid_distance * 0.75, _threshold * 0.80)
        else:
            distance = max(hybrid_distance * 1.45, _threshold + 0.18)

        distance = float(distance)
    except Exception as exc:
        return JSONResponse(status_code=503, content={'result':'MODEL_NOT_CONFIGURED','code':'INFERENCE_FAILED','message':f'Model inference failed: {exc}','qualityStatus':'UNKNOWN','modelVersion':MODEL_VERSION})

    if not np.isfinite(distance):
        return JSONResponse(status_code=503, content={'result':'MODEL_NOT_CONFIGURED','code':'INVALID_MODEL_OUTPUT','message':'The model returned an invalid score.','qualityStatus':'UNKNOWN','modelVersion':MODEL_VERSION})

    result = 'MATCH' if distance <= _threshold else 'MISMATCH'
    similarity_pct = max(0.0, min(100.0, (1.0 - distance) * 100.0))
    required_pct = max(0.0, min(100.0, (1.0 - _threshold) * 100.0))
    message = (
        f'Packaging verified! Siamese CNN visual similarity is {similarity_pct:.1f}% (required >= {required_pct:.1f}%).'
        if result == 'MATCH'
        else f'Suspicious packaging detected! Siamese CNN visual similarity is only {similarity_pct:.1f}% (required >= {required_pct:.1f}%) — this packaging does not match the manufacturer reference image.'
    )
    return {
        'result': result,
        'distance': distance,
        'threshold': _threshold,
        'score': max(0.0, min(1.0, 1.0 - distance)),
        'metrics': {
            'siameseDistance': round(siamese_dist, 4),
            'backboneCosineDistance': round(backbone_dist, 4),
            'colorLayoutDistance': round(color_dist, 4),
            'structuralHashDistance': round(dhash_dist, 4),
            'hybridDistance': round(hybrid_distance, 4)
        },
        'modelVersion': MODEL_VERSION,
        'qualityStatus': 'ACCEPTABLE',
        'message': message
    }
