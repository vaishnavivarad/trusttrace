"""Train TrustTrace Siamese MobileNetV2 on human-reviewed packaging image pairs.
No training can run correctly until the team supplies real images and labelled pairs.
"""
import argparse, json, os, sys
from pathlib import Path
import numpy as np
import pandas as pd
import sklearn
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.metrics import balanced_accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix

IMG_SIZE=(224,224); BATCH=16; EMBED=128

def load_img(path):
    img=tf.keras.utils.load_img(path,target_size=IMG_SIZE,color_mode='rgb')
    arr=tf.keras.utils.img_to_array(img)
    return tf.keras.applications.mobilenet_v2.preprocess_input(arr)

@keras.utils.register_keras_serializable(package='TrustTrace')
class EuclideanDistance(layers.Layer):
    def call(self, inputs):
        a, b = inputs
        return tf.sqrt(tf.reduce_sum(tf.square(a-b), axis=1, keepdims=True) + 1e-8)

def contrastive_loss(margin=1.0):
    def loss(y_true, distance):
        y=tf.cast(tf.reshape(y_true,(-1,)),distance.dtype); d=tf.reshape(distance,(-1,))
        return tf.reduce_mean(y*tf.square(d)+(1-y)*tf.square(tf.maximum(margin-d,0.0)))
    return loss

def build_model():
    base=keras.applications.MobileNetV2(include_top=False,weights='imagenet',input_shape=(*IMG_SIZE,3),name='mobilenetv2_backbone'); base.trainable=False
    inp=keras.Input(shape=(*IMG_SIZE,3),name='packaging_image')
    x=base(inp,training=False); x=layers.GlobalAveragePooling2D()(x); x=layers.Dense(256,activation='relu')(x); x=layers.Dropout(.2)(x); x=layers.Dense(EMBED)(x); out=layers.UnitNormalization(axis=-1)(x)
    encoder=keras.Model(inp,out,name='mobilenetv2_encoder')
    a=keras.Input(shape=(*IMG_SIZE,3),name='image_a'); b=keras.Input(shape=(*IMG_SIZE,3),name='image_b')
    ea=encoder(a); eb=encoder(b)
    distance=EuclideanDistance(name='euclidean_distance')([ea,eb])
    model=keras.Model([a,b],distance,name='trusttrace_siamese_mobilenetv2')
    model.compile(optimizer=keras.optimizers.Adam(1e-3),loss=contrastive_loss(1.0))
    return model, base

def unfreeze_upper_backbone(model, base, unfreeze_last_n=35, lr=1e-4):
    base.trainable = True
    for layer in base.layers[:-unfreeze_last_n]:
        layer.trainable = False
    for layer in base.layers[-unfreeze_last_n:]:
        if isinstance(layer, layers.BatchNormalization):
            layer.trainable = False
    model.compile(optimizer=keras.optimizers.Adam(lr), loss=contrastive_loss(1.0))

def dataset_for(df, root, training=False):
    pa=[str(root/p) for p in df.image_a]; pb=[str(root/p) for p in df.image_b]; labels=df.label_same_identity.astype('float32').to_numpy()
    for p in pa+pb:
        if not Path(p).is_file(): raise FileNotFoundError(f'Image referenced by pairs CSV not found: {p}')
    ds=tf.data.Dataset.from_tensor_slices((pa,pb,labels))
    def mapper(a,b,y):
        ia=tf.io.decode_image(tf.io.read_file(a),channels=3,expand_animations=False); ib=tf.io.decode_image(tf.io.read_file(b),channels=3,expand_animations=False)
        ia=tf.image.resize(tf.cast(ia,tf.float32),IMG_SIZE); ib=tf.image.resize(tf.cast(ib,tf.float32),IMG_SIZE)
        if training:
            # Mild independent capture variation only on training data. Do not flip or heavily crop labels/logos.
            ia=tf.image.random_brightness(ia, max_delta=12.0)
            ib=tf.image.random_brightness(ib, max_delta=12.0)
            ia=tf.image.random_contrast(ia, lower=0.90, upper=1.10)
            ib=tf.image.random_contrast(ib, lower=0.90, upper=1.10)
            ia=tf.clip_by_value(ia,0.0,255.0); ib=tf.clip_by_value(ib,0.0,255.0)
        ia=tf.keras.applications.mobilenet_v2.preprocess_input(ia); ib=tf.keras.applications.mobilenet_v2.preprocess_input(ib)
        return (ia,ib), y
    ds=ds.map(mapper,num_parallel_calls=tf.data.AUTOTUNE)
    if training: ds=ds.shuffle(min(len(df),2048),seed=42,reshuffle_each_iteration=True)
    return ds.batch(BATCH).prefetch(tf.data.AUTOTUNE)

def compute_split_metrics(distances, labels, threshold):
    pred = (distances <= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(labels, pred, labels=[0, 1]).ravel()
    fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    fnr = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0
    try:
        roc_auc = float(roc_auc_score(labels, -distances))
    except ValueError:
        roc_auc = None
    return {
        'threshold': float(threshold),
        'balanced_accuracy': float(balanced_accuracy_score(labels, pred)),
        'precision': float(precision_score(labels, pred, zero_division=0)),
        'recall': float(recall_score(labels, pred, zero_division=0)),
        'f1': float(f1_score(labels, pred, zero_division=0)),
        'false_positive_rate': fpr,
        'false_negative_rate': fnr,
        'roc_auc': roc_auc,
        'confusion_matrix': {'tn': int(tn), 'fp': int(fp), 'fn': int(fn), 'tp': int(tp)}
    }

def choose_threshold(distances, labels, max_fpr=0.10, min_usable_recall=0.55):
    candidates = np.unique(np.quantile(distances, np.linspace(0.02, 0.98, 193)))
    best_unconstrained = None
    best_constrained = None
    for threshold in candidates:
        m = compute_split_metrics(distances, labels, float(threshold))
        if best_unconstrained is None or (m['balanced_accuracy'], -m['false_positive_rate']) > (best_unconstrained['balanced_accuracy'], -best_unconstrained['false_positive_rate']):
            best_unconstrained = m
        if m['false_positive_rate'] <= max_fpr:
            if best_constrained is None or (m['recall'], m['balanced_accuracy']) > (best_constrained['recall'], best_constrained['balanced_accuracy']):
                best_constrained = m
    if best_constrained is not None and best_constrained['recall'] >= min_usable_recall:
        selected = best_constrained
        selection_rule = f'validation_fpr_le_{max_fpr:.2f}_max_recall'
    else:
        selected = best_unconstrained
        selection_rule = 'validation_max_balanced_accuracy_fallback'
    return selected, selection_rule, {'constrained_fpr_le_10pct': best_constrained, 'unconstrained_max_bacc': best_unconstrained}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--pairs',default='dataset/metadata/pairs.csv')
    ap.add_argument('--image-root',default='dataset')
    ap.add_argument('--out-dir',default='models')
    ap.add_argument('--epochs',type=int,default=10)
    ap.add_argument('--fine-tune-epochs',type=int,default=5)
    ap.add_argument('--max-val-fpr',type=float,default=0.10)
    args=ap.parse_args()
    pairs=pd.read_csv(args.pairs)
    required={'image_a','image_b','label_same_identity','split'}
    if not required.issubset(pairs.columns): raise SystemExit(f'pairs CSV is missing columns: {sorted(required-set(pairs.columns))}')
    for split in ('train','validation','test'):
        part=pairs[pairs.split==split]
        if part.empty: raise SystemExit(f'No {split} pairs. Collect more product units and create unit-isolated splits before training.')
        if set(part.label_same_identity.astype(int).unique()) != {0,1}:
            raise SystemExit(f'{split} split must contain both same-identity (1) and different-identity (0) pairs. Collect more independent product units/captures; do not evaluate a one-class split.')
    root=Path(args.image_root); out=Path(args.out_dir); out.mkdir(parents=True,exist_ok=True)
    train=pairs[pairs.split=='train']; val=pairs[pairs.split=='validation']; test=pairs[pairs.split=='test']
    train_ds=dataset_for(train,root,True); val_ds=dataset_for(val,root); val_labels=val.label_same_identity.astype(int).to_numpy()
    model, base = build_model()
    stage1_ckpt = out/'best_stage1_frozen.keras'
    callbacks1=[keras.callbacks.EarlyStopping(monitor='val_loss',patience=3,restore_best_weights=True),keras.callbacks.ModelCheckpoint(stage1_ckpt,monitor='val_loss',save_best_only=True)]
    hist1=model.fit(train_ds,validation_data=val_ds,epochs=args.epochs,callbacks=callbacks1)
    hist_data={'stage1_frozen_backbone':{k:[float(v) for v in vals] for k,vals in hist1.history.items()}}
    stage1_model=keras.models.load_model(stage1_ckpt,custom_objects={'EuclideanDistance': EuclideanDistance},compile=False)
    s1_val_dist=np.asarray(stage1_model.predict(val_ds,verbose=0)).reshape(-1)
    s1_sel, s1_rule, s1_candidates = choose_threshold(s1_val_dist, val_labels, max_fpr=args.max_val_fpr)

    chosen_model = stage1_model
    chosen_stage = 'stage1_frozen_backbone'
    val_dist = s1_val_dist
    val_selected = s1_sel
    selection_rule = s1_rule
    val_candidates = s1_candidates

    if args.fine_tune_epochs > 0:
        unfreeze_upper_backbone(model, base, unfreeze_last_n=35, lr=1e-4)
        stage2_ckpt = out/'best_stage2_finetuned.keras'
        callbacks2=[keras.callbacks.EarlyStopping(monitor='val_loss',patience=3,restore_best_weights=True),keras.callbacks.ModelCheckpoint(stage2_ckpt,monitor='val_loss',save_best_only=True)]
        hist2=model.fit(train_ds,validation_data=val_ds,epochs=args.fine_tune_epochs,callbacks=callbacks2)
        hist_data['stage2_finetuned_upper_mobilenetv2']={k:[float(v) for v in vals] for k,vals in hist2.history.items()}
        stage2_model=keras.models.load_model(stage2_ckpt,custom_objects={'EuclideanDistance': EuclideanDistance},compile=False)
        s2_val_dist=np.asarray(stage2_model.predict(val_ds,verbose=0)).reshape(-1)
        s2_sel, s2_rule, s2_candidates = choose_threshold(s2_val_dist, val_labels, max_fpr=args.max_val_fpr)
        hist_data['validation_stage_comparison'] = {
            'stage1_frozen': {'selected': s1_sel, 'rule': s1_rule},
            'stage2_finetuned': {'selected': s2_sel, 'rule': s2_rule}
        }
        # Select stage strictly on validation metrics (higher validation balanced accuracy at low FPR)
        if (s2_sel['false_positive_rate'] <= args.max_val_fpr and (s2_sel['balanced_accuracy'], s2_sel['roc_auc'] or 0.0) >= (s1_sel['balanced_accuracy'], s1_sel['roc_auc'] or 0.0)):
            chosen_model = stage2_model
            chosen_stage = 'stage2_finetuned_upper_mobilenetv2'
            val_dist = s2_val_dist
            val_selected = s2_sel
            selection_rule = s2_rule
            val_candidates = s2_candidates

    (out/'training_history.json').write_text(json.dumps(hist_data,indent=2),encoding='utf-8')
    threshold = float(val_selected['threshold'])
    test_dist = np.asarray(chosen_model.predict(dataset_for(test,root),verbose=0)).reshape(-1)
    test_labels = test.label_same_identity.astype(int).to_numpy()
    test_metrics = compute_split_metrics(test_dist, test_labels, threshold)

    model_path=out/'siamese_mobilenetv2.keras'; chosen_model.save(model_path)
    (out/'threshold.json').write_text(json.dumps({
        'distance_threshold': threshold,
        'selected_on': 'validation',
        'selection_rule': selection_rule,
        'selected_model_stage': chosen_stage,
        'validation_balanced_accuracy': val_selected['balanced_accuracy'],
        'validation_precision_match': val_selected['precision'],
        'validation_recall_match': val_selected['recall'],
        'validation_false_positive_rate': val_selected['false_positive_rate'],
        'validation_false_negative_rate': val_selected['false_negative_rate'],
        'validation_roc_auc': val_selected['roc_auc'],
        'validation_confusion_matrix': val_selected['confusion_matrix'],
        'validation_threshold_candidates': val_candidates
    },indent=2),encoding='utf-8')
    metadata={'model_file':str(model_path),'architecture':'Siamese MobileNetV2 (shared weights) + EuclideanDistance','selected_model_stage':chosen_stage,'input_dimensions':[IMG_SIZE[0],IMG_SIZE[1],3],'embedding_dim':EMBED,'preprocessing':'tf.keras.applications.mobilenet_v2.preprocess_input','distance_threshold':threshold,'threshold_selected_on':'validation','threshold_selection_rule':selection_rule,'training_command':' '.join(sys.argv),'dependencies':{'python':sys.version.split()[0],'tensorflow':tf.__version__,'numpy':np.__version__,'pandas':pd.__version__,'scikit_learn':sklearn.__version__}}
    (out/'model_metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    report={
        'model_file':str(model_path),
        'selected_model_stage':chosen_stage,
        'threshold':threshold,
        'threshold_selection_rule':selection_rule,
        'validation_balanced_accuracy':val_selected['balanced_accuracy'],
        'validation_precision_match':val_selected['precision'],
        'validation_recall_match':val_selected['recall'],
        'validation_f1_match':val_selected['f1'],
        'validation_false_positive_rate':val_selected['false_positive_rate'],
        'validation_false_negative_rate':val_selected['false_negative_rate'],
        'validation_roc_auc':val_selected['roc_auc'],
        'validation_confusion_matrix':val_selected['confusion_matrix'],
        'validation_threshold_candidates':val_candidates,
        'test_balanced_accuracy':test_metrics['balanced_accuracy'],
        'test_precision_match':test_metrics['precision'],
        'test_recall_match':test_metrics['recall'],
        'test_f1_match':test_metrics['f1'],
        'test_false_positive_rate':test_metrics['false_positive_rate'],
        'test_false_negative_rate':test_metrics['false_negative_rate'],
        'test_roc_auc':test_metrics['roc_auc'],
        'test_confusion_matrix':test_metrics['confusion_matrix'],
        'split_pair_counts':{'train':len(train),'validation':len(val),'test':len(test)},
        'test_pairs':len(test),
        'warning':'Pair identity metrics are not the same as verified real-world counterfeit-detection accuracy.'
    }
    (out/'evaluation_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))
if __name__=='__main__': main()
