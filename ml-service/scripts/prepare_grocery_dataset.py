"""Download, validate, and index Marcus Klasson's GroceryStoreDataset for TrustTrace feature learning.

Repository: https://github.com/marcusklasson/GroceryStoreDataset
Citation:
  Marcus Klasson, Cheng Zhang, Hedvig Kjellström.
  "A Hierarchical Grocery Store Image Dataset with Visual and Semantic Labels."
  IEEE Winter Conference on Applications of Computer Vision (WACV), 2019.

IMPORTANT SCOPE NOTE:
  GroceryStoreDataset contains ~5,125 natural grocery-item images across 81 fine-grained classes
  (including packaged/carton items such as Juice, Milk, Yoghurt, Oatghurt, Oat-Milk, Sour-Cream,
  Sour-Milk, Soy-Milk, Soyghurt, and natural produce).
  It is used for visual representation/similarity learning within each original split (train/val/test)
  with zero cross-split leakage. It is NOT a dataset of verified counterfeit vs. genuine packaging
  of the same SKU and must not be claimed as proof of real-world counterfeit detection accuracy.
"""
import argparse
import csv
import hashlib
import json
import random
import subprocess
from collections import defaultdict
from pathlib import Path
from PIL import Image

REPO_URL = "https://github.com/marcusklasson/GroceryStoreDataset.git"
PACKAGED_COARSE_KEYWORDS = {
    "juice", "milk", "yoghurt", "oatghurt", "oat-milk", "sour-cream", "sour-milk", "soy-milk", "soyghurt"
}


def ensure_repo(target_dir: Path, skip_download: bool = False) -> Path:
    dataset_root = target_dir / "dataset"
    if (target_dir / ".git").exists():
        subprocess.run(["git", "-C", str(target_dir), "config", "core.longpaths", "true"], capture_output=True)
        subprocess.run(["git", "-C", str(target_dir), "checkout", "-f", "HEAD"], capture_output=True)
    if (dataset_root / "classes.csv").exists() and (dataset_root / "train.txt").exists():
        print(f"GroceryStoreDataset present at {dataset_root}")
        return dataset_root
    if skip_download:
        raise SystemExit(f"GroceryStoreDataset not found at {dataset_root} and --skip-download was set.")
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    print(f"Cloning {REPO_URL} into {target_dir} ...")
    res = subprocess.run(
        ["git", "-c", "core.longpaths=true", "clone", "--depth", "1", REPO_URL, str(target_dir)],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0 and not (dataset_root / "classes.csv").exists():
        raise SystemExit(f"Failed to clone GroceryStoreDataset: {res.stderr or res.stdout}")
    if not (dataset_root / "classes.csv").exists():
        raise SystemExit(f"Clone succeeded, but expected {dataset_root / 'classes.csv'} was not found.")
    return dataset_root


def load_classes(classes_csv: Path) -> dict:
    classes = {}
    with classes_csv.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            cid = int(row["Class ID (int)"].strip())
            cname = row["Class Name (str)"].strip()
            coarse_name = row["Coarse Class Name (str)"].strip()
            coarse_id = int(row["Coarse Class ID (int)"].strip())
            is_packaged = any(k in coarse_name.lower() or k in cname.lower() for k in PACKAGED_COARSE_KEYWORDS)
            classes[cid] = {
                "class_id": cid,
                "class_name": cname,
                "coarse_class_id": coarse_id,
                "coarse_class_name": coarse_name,
                "is_packaged": is_packaged,
            }
    return classes


def parse_split_file(split_txt: Path, split_name: str) -> list:
    items = []
    with split_txt.open(encoding="utf-8-sig") as f:
        for line in f:
            raw = line.strip()
            if not raw:
                continue
            parts = [p.strip() for p in raw.split(",")]
            if len(parts) < 2:
                continue
            rel_path = parts[0]
            class_id = int(parts[1])
            coarse_id = int(parts[2]) if len(parts) > 2 else -1
            items.append({
                "relative_path": rel_path,
                "class_id": class_id,
                "coarse_class_id": coarse_id,
                "split": split_name,
            })
    return items


def validate_and_build_manifest(dataset_root: Path, out_manifest: Path, out_report: Path) -> list:
    classes = load_classes(dataset_root / "classes.csv")
    split_files = [
        ("train", dataset_root / "train.txt"),
        ("validation", dataset_root / "val.txt"),
        ("test", dataset_root / "test.txt"),
    ]
    all_entries = []
    for split_name, sp_file in split_files:
        if not sp_file.exists():
            raise SystemExit(f"Missing official split file: {sp_file}")
        all_entries.extend(parse_split_file(sp_file, split_name))

    manifest_rows = []
    missing_files = []
    corrupt_files = []
    split_counts = defaultdict(int)
    packaged_counts = defaultdict(int)
    paths_by_split = defaultdict(set)

    for idx, item in enumerate(all_entries, start=1):
        rel = item["relative_path"]
        fp = dataset_root / rel
        split = item["split"]
        paths_by_split[split].add(rel)
        cinfo = classes.get(item["class_id"], {
            "class_name": f"class_{item['class_id']}",
            "coarse_class_name": f"coarse_{item['coarse_class_id']}",
            "is_packaged": False,
        })
        if not fp.exists():
            missing_files.append(rel)
            continue
        try:
            with Image.open(fp) as im:
                width, height = im.size
                im.verify()
            digest = hashlib.sha256(fp.read_bytes()).hexdigest()
        except Exception as exc:
            corrupt_files.append({"path": rel, "error": str(exc)})
            continue

        split_counts[split] += 1
        if cinfo["is_packaged"]:
            packaged_counts[split] += 1

        manifest_rows.append({
            "image_id": f"GROCERY-{idx:05d}",
            "relative_path": rel,
            "class_id": item["class_id"],
            "class_name": cinfo["class_name"],
            "coarse_class_id": item["coarse_class_id"],
            "coarse_class_name": cinfo["coarse_class_name"],
            "is_packaged": "true" if cinfo["is_packaged"] else "false",
            "source": "GroceryStoreDataset (Klasson et al., WACV 2019)",
            "split": split,
            "width": width,
            "height": height,
            "sha256": digest,
        })

    # Verify zero path leakage between train, validation, and test splits
    leakage = []
    split_names = list(paths_by_split.keys())
    for i in range(len(split_names)):
        for j in range(i + 1, len(split_names)):
            overlap = paths_by_split[split_names[i]] & paths_by_split[split_names[j]]
            if overlap:
                leakage.append(f"{split_names[i]} vs {split_names[j]}: {len(overlap)} overlapping paths")

    out_manifest.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "image_id", "relative_path", "class_id", "class_name",
        "coarse_class_id", "coarse_class_name", "is_packaged",
        "source", "split", "width", "height", "sha256"
    ]
    with out_manifest.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(manifest_rows)

    report = {
        "dataset": "GroceryStoreDataset",
        "repository": REPO_URL,
        "total_referenced": len(all_entries),
        "total_valid_images": len(manifest_rows),
        "num_classes": len(classes),
        "split_counts": dict(split_counts),
        "packaged_item_counts_by_split": dict(packaged_counts),
        "missing_images_count": len(missing_files),
        "missing_images": missing_files[:50],
        "corrupt_images_count": len(corrupt_files),
        "corrupt_images": corrupt_files[:50],
        "cross_split_path_leakage": leakage,
        "manifest_path": str(out_manifest),
    }
    out_report.parent.mkdir(parents=True, exist_ok=True)
    out_report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if leakage:
        raise SystemExit(f"Cross-split path leakage detected: {leakage}")
    return manifest_rows


def build_split_isolated_pairs(
    manifest_rows: list,
    out_pairs: Path,
    packaged_only: bool = True,
    max_Anchor_per_class: int = 25,
    seed: int = 42,
):
    rng = random.Random(seed)
    filtered = [
        r for r in manifest_rows
        if (not packaged_only or r["is_packaged"] == "true") and int(r["width"]) >= 100 and int(r["height"]) >= 100
    ]
    by_split_class = defaultdict(list)
    for r in filtered:
        by_split_class[(r["split"], int(r["class_id"]))].append(r)

    pair_rows = []
    for split in ("train", "validation", "test"):
        classes_in_split = [cid for (sp, cid), arr in by_split_class.items() if sp == split and len(arr) >= 2]
        for cid in sorted(classes_in_split):
            anchors = list(by_split_class[(split, cid)])
            rng.shuffle(anchors)
            anchors = anchors[:max_Anchor_per_class]
            other_cids = [c for c in classes_in_split if c != cid]
            for a in anchors:
                pos_candidates = [x for x in by_split_class[(split, cid)] if x["relative_path"] != a["relative_path"]]
                if pos_candidates:
                    b_pos = rng.choice(pos_candidates)
                    pair_rows.append({
                        "pair_id": f"GPAIR-{len(pair_rows) + 1:07d}",
                        "image_a": a["relative_path"],
                        "image_b": b_pos["relative_path"],
                        "label_same_identity": 1,
                        "pair_type": "same_fine_grained_product_class",
                        "split": split,
                    })
                if other_cids:
                    neg_cid = rng.choice(other_cids)
                    b_neg = rng.choice(by_split_class[(split, neg_cid)])
                    pair_rows.append({
                        "pair_id": f"GPAIR-{len(pair_rows) + 1:07d}",
                        "image_a": a["relative_path"],
                        "image_b": b_neg["relative_path"],
                        "label_same_identity": 0,
                        "pair_type": "different_fine_grained_product_class",
                        "split": split,
                    })

    out_pairs.parent.mkdir(parents=True, exist_ok=True)
    with out_pairs.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["pair_id", "image_a", "image_b", "label_same_identity", "pair_type", "split"],
        )
        writer.writeheader()
        writer.writerows(pair_rows)

    counts = {sp: sum(1 for r in pair_rows if r["split"] == sp) for sp in ("train", "validation", "test")}
    print(f"Wrote {len(pair_rows)} split-isolated pairs to {out_pairs}: {counts}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target-dir", default="dataset/external/GroceryStoreDataset")
    ap.add_argument("--manifest-out", default="dataset/metadata/grocery_manifest.csv")
    ap.add_argument("--report-out", default="dataset/metadata/grocery_validation_report.json")
    ap.add_argument("--pairs-out", default="dataset/metadata/grocery_pairs.csv")
    ap.add_argument("--all-classes", action="store_true", help="Include natural produce as well as packaged grocery items in pairs")
    ap.add_argument("--max-anchors-per-class", type=int, default=20)
    ap.add_argument("--skip-download", action="store_true")
    args = ap.parse_args()

    dataset_root = ensure_repo(Path(args.target_dir), skip_download=args.skip_download)
    manifest_rows = validate_and_build_manifest(
        dataset_root,
        Path(args.manifest_out),
        Path(args.report_out),
    )
    build_split_isolated_pairs(
        manifest_rows,
        Path(args.pairs_out),
        packaged_only=not args.all_classes,
        max_Anchor_per_class=args.max_anchors_per_class,
    )


if __name__ == "__main__":
    main()

