"""Create Siamese packaging-photo pairs from reviewed metadata.
Positive: two different captures of the same physical unit/registered reference identity.
Negative: different physical unit IDs. This is NOT proof that either product is counterfeit.
"""
import argparse, csv, random
from collections import defaultdict
from pathlib import Path

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--images', default='dataset/metadata/images.csv')
    p.add_argument('--splits', default='dataset/metadata/split_manifest.csv')
    p.add_argument('--out', default='dataset/metadata/pairs.csv')
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--positive-per-image', type=int, default=2)
    p.add_argument('--negative-per-image', type=int, default=2)
    args=p.parse_args(); rng=random.Random(args.seed)
    for name in (args.images,args.splits):
        if not Path(name).exists(): raise SystemExit(f'Missing required file: {name}')
    with open(args.images,newline='',encoding='utf-8-sig') as f: images=list(csv.DictReader(f))
    with open(args.splits,newline='',encoding='utf-8-sig') as f: splits={r['unit_id']:r['split'] for r in csv.DictReader(f)}
    required={'image_id','relative_path','product_id','unit_id','category','quality_status'}
    if not images or not required.issubset(images[0]): raise SystemExit(f'images.csv must contain: {sorted(required)}')
    good=[r for r in images if r.get('relative_path') and r.get('unit_id') in splits and (r.get('quality_status','').lower() in ('good','accepted','ok'))]
    by_split_unit=defaultdict(list)
    for r in good: by_split_unit[(splits[r['unit_id']],r['unit_id'])].append(r)
    rows=[]
    for (split,unit),unit_images in by_split_unit.items():
        others=[(u,arr) for (sp,u),arr in by_split_unit.items() if sp==split and u!=unit and arr]
        for a in unit_images:
            positives=[x for x in unit_images if x['image_id']!=a['image_id']]
            rng.shuffle(positives)
            for b in positives[:args.positive_per_image]: rows.append({'pair_id':f'PAIR-{len(rows)+1:07d}','image_a':a['relative_path'],'image_b':b['relative_path'],'label_same_identity':1,'pair_type':'same_unit_different_capture','split':split})
            rng.shuffle(others)
            for _,arr in others[:args.negative_per_image]:
                b=rng.choice(arr); rows.append({'pair_id':f'PAIR-{len(rows)+1:07d}','image_a':a['relative_path'],'image_b':b['relative_path'],'label_same_identity':0,'pair_type':'different_unit_identity','split':split})
    if not rows: raise SystemExit('No pairs created. Add real image rows, mark quality_status=good, split at least 3 units, and take multiple photos per unit.')
    out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=['pair_id','image_a','image_b','label_same_identity','pair_type','split']);w.writeheader();w.writerows(rows)
    # Leakage safety: each image's unit identity must belong to its assigned split.
    unit_by_path={r['relative_path']:r['unit_id'] for r in good}
    for r in rows:
        if splits[unit_by_path[r['image_a']]]!=r['split'] or splits[unit_by_path[r['image_b']]]!=r['split']:
            raise SystemExit('Split leakage detected; do not train until this is fixed.')
    print(f'Created {len(rows)} labelled pairs at {out}. Counts: { {s:sum(r["split"]==s for r in rows) for s in ("train","validation","test")} }')
    print('Pair labels describe same identity vs different identity; they do not establish genuine/counterfeit status.')
if __name__=='__main__': main()
