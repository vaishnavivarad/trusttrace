"""Validate files, labels, metadata and split isolation before training."""
import argparse,csv,hashlib
from pathlib import Path
from collections import defaultdict
from PIL import Image

def read(path):
    if not Path(path).exists(): raise SystemExit(f'Missing file: {path}')
    with open(path,newline='',encoding='utf-8-sig') as f:return list(csv.DictReader(f))
def main():
    p=argparse.ArgumentParser();p.add_argument('--root',default='dataset');p.add_argument('--images',default='dataset/metadata/images.csv');p.add_argument('--splits',default='dataset/metadata/split_manifest.csv');args=p.parse_args()
    root=Path(args.root); images=read(args.images); splits=read(args.splits)
    required={'image_id','relative_path','product_id','unit_id','category','label','source_type','quality_status'}
    if not images: raise SystemExit('images.csv is empty: no real product images have been indexed yet.')
    if not required.issubset(images[0]): raise SystemExit(f'images.csv missing columns: {sorted(required-set(images[0]))}')
    split_map={r['unit_id']:r['split'] for r in splits}; seen_hash={}; errors=[]; units_by_split=defaultdict(set); categories=defaultdict(int); products=set(); units=set()
    for r in images:
        fp=root/r['relative_path']
        if not fp.exists(): errors.append(f'Missing image: {fp}'); continue
        try:
            with Image.open(fp) as im:
                w,h=im.size
                if w<100 or h<100: errors.append(f'Image resolution too small ({w}x{h} < 100x100): {fp}')
                im.verify()
            raw=fp.read_bytes(); digest=hashlib.sha256(raw).hexdigest()
            if digest in seen_hash: errors.append(f'Duplicate byte-identical images: {fp} and {seen_hash[digest]}')
            seen_hash[digest]=str(fp)
        except Exception as e: errors.append(f'Corrupt image {fp}: {e}')
        if r['label'] not in ('genuine','simulated_modified','verified_counterfeit','unknown'):
            errors.append(f'Invalid authenticity label for {r["image_id"]}: {r["label"]}')
        if r['unit_id'] not in split_map: errors.append(f'No split assignment for unit {r["unit_id"]}')
        else: units_by_split[split_map[r['unit_id']]].add(r['unit_id'])
        if r['label']=='verified_counterfeit' and 'verified' not in (r.get('source_type','').lower()):
            errors.append(f'Counterfeit label requires verified source notes: {r["image_id"]}')
        categories[r.get('category','unknown').strip().lower()]+=1
        if r.get('product_id'): products.add(r['product_id'].strip())
        if r.get('unit_id'): units.add(r['unit_id'].strip())
    # Verify zero cross-split unit leakage
    all_splits=list(units_by_split.keys())
    for i in range(len(all_splits)):
        for j in range(i+1,len(all_splits)):
            overlap=units_by_split[all_splits[i]] & units_by_split[all_splits[j]]
            if overlap: errors.append(f'Cross-split unit leakage between {all_splits[i]} and {all_splits[j]}: {sorted(overlap)}')
    if errors:
        print(f'Dataset validation failed with {len(errors)} issue(s):')
        for item in errors[:80]: print('-',item)
        raise SystemExit(1)
    print(f'Validated {len(images)} metadata rows and {len(seen_hash)} distinct image files.')
    print('Category counts:', dict(categories))
    print(f'Unique products: {len(products)}, Unique physical units: {len(units)}')
    print('Unique unit counts by split:', {k:len(v) for k,v in units_by_split.items()})
    if not all(s in units_by_split for s in ('train','validation','test')): print('WARNING: all train/validation/test splits are not represented yet.')
if __name__=='__main__':main()
