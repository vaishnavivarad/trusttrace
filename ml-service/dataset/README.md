# TrustTrace packaging-image dataset

This folder contains metadata templates and scripts, not a claimed real or verified counterfeit image dataset. The uploaded project ZIP did not include actual labelled food, cosmetics or medicine packaging images or trained Siamese model weights.

## Collect images responsibly

1. Begin with a small pilot of real packaged-food, cosmetics/personal-care and medicine SKUs.
2. Prefer photos captured by the team from physical products you can inspect and document. You may use public images only when the source/license permits the intended use; public web images do not prove product authenticity.
3. Give each physical unit a unique `unit_id`. Capture multiple views and lighting conditions of the same unit so positive pairs exist.
4. Use labels `genuine`, `simulated_modified`, `verified_counterfeit`, or `unknown`. Only use `verified_counterfeit` when its status has been independently verified. A digitally modified picture is a simulated alteration, not a real counterfeit.
5. Record source/permission notes in `metadata/image_sources.csv`.
6. Keep every physical unit in only one split: train, validation, or test. Split before generating pairs. The split script requires at least 6 distinct physical units and reserves at least 2 units for each split so positive and negative pairs can be evaluated.

## Expected paths

The `relative_path` in `images.csv` is relative to this `dataset/` directory, e.g. `images/genuine/food/unit001_front.jpg`.

## Prepare data

### A. GroceryStoreDataset Feature-Learning Pipeline (Klasson et al., WACV 2019)

Repository: `https://github.com/marcusklasson/GroceryStoreDataset`

Citation:
> Marcus Klasson, Cheng Zhang, Hedvig Kjellström. *"A Hierarchical Grocery Store Image Dataset with Visual and Semantic Labels."* IEEE Winter Conference on Applications of Computer Vision (WACV), 2019.

From `ml-service/`:

```bash
python scripts/prepare_grocery_dataset.py --target-dir dataset/external/GroceryStoreDataset --manifest-out dataset/metadata/grocery_manifest.csv --report-out dataset/metadata/grocery_validation_report.json --pairs-out dataset/metadata/grocery_pairs.csv
python scripts/train_siamese.py --pairs dataset/metadata/grocery_pairs.csv --image-root dataset/external/GroceryStoreDataset/dataset --out-dir models --epochs 8
```

*Scope & Honesty Note:* `GroceryStoreDataset` provides ~5,125 natural grocery images across 81 fine-grained classes (including packaged carton items such as juice, milk, yoghurt, oat milk, and soy milk) with official `train.txt`, `val.txt`, and `test.txt` splits. It is used to train and evaluate the MobileNetV2 Siamese feature encoder on fine-grained packaged grocery similarity without cross-split leakage. It is **not** a dataset of genuine vs. counterfeit versions of the same SKU, and does not cover cosmetics or medicine packaging.

### B. TrustTrace Physical-Unit Packaging Dataset Workflow (Food, Cosmetics, Medicine)

From `ml-service/`:

```bash
python scripts/split_by_unit.py --metadata dataset/metadata/images.csv --out dataset/metadata/split_manifest.csv
python scripts/create_pairs.py --images dataset/metadata/images.csv --splits dataset/metadata/split_manifest.csv --out dataset/metadata/pairs.csv
python scripts/validate_dataset.py --root dataset --images dataset/metadata/images.csv --splits dataset/metadata/split_manifest.csv
python scripts/train_siamese.py --pairs dataset/metadata/pairs.csv --image-root dataset --out-dir models --epochs 12
```

Do not train or report model accuracy until each split contains sufficient independent physical units and image pairs. If model weights/threshold are absent, the inference API intentionally returns `MODEL_NOT_CONFIGURED`, not a fake match.
