"""Split product photos by physical unit to avoid train/test leakage.
Input CSV needs image_id, relative_path, product_id, unit_id, category.
This script assigns each entire unit to exactly one split.
"""
import argparse, csv, random
from pathlib import Path

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--metadata', default='dataset/metadata/images.csv')
    p.add_argument('--out', default='dataset/metadata/split_manifest.csv')
    p.add_argument('--seed', type=int, default=42)
    args=p.parse_args(); random.seed(args.seed)
    path=Path(args.metadata)
    if not path.exists(): raise SystemExit(f'Metadata not found: {path}')
    with path.open(newline='',encoding='utf-8-sig') as f: rows=list(csv.DictReader(f))
    units=sorted({r.get('unit_id','').strip() for r in rows if r.get('unit_id','').strip()})
    if len(units)<6: raise SystemExit('Collect at least 6 distinct physical product units. This script reserves at least 2 units for train, validation and test so each split can form positive and negative identity pairs.')
    random.shuffle(units)
    n=len(units)
    n_train=max(2, round(n*0.60)); n_val=max(2, round(n*0.20))
    # Keep at least two units in validation and test; training receives the remainder.
    if n_train+n_val>n-2:
        n_train=n-4; n_val=2
    n_test=n-n_train-n_val
    if n_train<2 or n_val<2 or n_test<2: raise SystemExit('Not enough physical units for independent train/validation/test pairs.')
    assign={u:('train' if i<n_train else 'validation' if i<n_train+n_val else 'test') for i,u in enumerate(units)}
    out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=['unit_id','product_id','split','split_reason']); w.writeheader()
        seen=set()
        for r in rows:
            unit=r.get('unit_id','').strip()
            if not unit or unit in seen: continue
            seen.add(unit); w.writerow({'unit_id':unit,'product_id':r.get('product_id',''),'split':assign[unit],'split_reason':'grouped by physical unit to prevent leakage'})
    print(f'Wrote {len(seen)} unit assignments to {out}. Counts: train={sum(v=="train" for v in assign.values())}, validation={sum(v=="validation" for v in assign.values())}, test={sum(v=="test" for v in assign.values())}')
if __name__=='__main__': main()
