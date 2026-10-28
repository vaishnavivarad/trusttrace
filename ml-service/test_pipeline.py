"""Unit and integration tests for the TrustTrace Siamese CNN dataset pipeline and inference API safeguards."""
import csv
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ML_DIR = Path(__file__).resolve().parent


def make_test_image_bytes(width=224, height=224, color=(120, 140, 160), fmt="PNG"):
    img = Image.new("RGB", (width, height), color=color)
    # Add a small variation block so distinct images have distinct SHA-256 hashes
    for x in range(min(20, width)):
        for y in range(min(20, height)):
            img.putpixel((x, y), ((color[0] + x) % 255, (color[1] + y) % 255, color[2]))
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


class TestDatasetPipelineAndInferenceSafeguards(unittest.TestCase):
    def test_01_empty_template_dataset_rejected_honestly(self):
        """Confirm that running split_by_unit.py on the empty template CSV fails clearly."""
        res = subprocess.run(
            [sys.executable, str(ML_DIR / "scripts" / "split_by_unit.py")],
            cwd=str(ML_DIR),
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("Collect at least 6 distinct physical product units", res.stderr + res.stdout)

    def test_02_split_and_pair_generation_prevents_unit_leakage(self):
        """Verify split_by_unit.py, create_pairs.py, and validate_dataset.py on isolated temp data."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            meta_dir = tmp_path / "metadata"
            meta_dir.mkdir(parents=True, exist_ok=True)
            img_csv = meta_dir / "images.csv"
            split_csv = meta_dir / "split_manifest.csv"
            pairs_csv = meta_dir / "pairs.csv"

            fieldnames = [
                "image_id",
                "relative_path",
                "product_id",
                "unit_id",
                "category",
                "view_type",
                "lighting",
                "label",
                "source_type",
                "source_url_or_capture_note",
                "permission_or_license_note",
                "quality_status",
            ]
            categories = ["food", "cosmetics", "medicines"]
            rows = []
            # Create 9 distinct physical units (3 per category), 2 captures per unit = 18 images
            for u_idx in range(1, 10):
                cat = categories[(u_idx - 1) % 3]
                unit_id = f"UNIT-{u_idx:03d}"
                prod_id = f"PROD-{cat.upper()}-{u_idx:03d}"
                for cap in (1, 2):
                    rel = f"images/genuine/{cat}/{unit_id}_cap{cap}.png"
                    full_img = tmp_path / rel
                    full_img.parent.mkdir(parents=True, exist_ok=True)
                    full_img.write_bytes(
                        make_test_image_bytes(
                            224, 224, color=(50 + u_idx * 15, 80 + cap * 30, 100 + u_idx * 5)
                        )
                    )
                    rows.append(
                        {
                            "image_id": f"IMG-{u_idx:03d}-{cap}",
                            "relative_path": rel,
                            "product_id": prod_id,
                            "unit_id": unit_id,
                            "category": cat,
                            "view_type": "front" if cap == 1 else "angled",
                            "lighting": "daylight",
                            "label": "genuine",
                            "source_type": "team_capture",
                            "source_url_or_capture_note": "unit test",
                            "permission_or_license_note": "owned",
                            "quality_status": "good",
                        }
                    )

            with img_csv.open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(rows)

            # 1. Run split_by_unit.py
            r_split = subprocess.run(
                [
                    sys.executable,
                    str(ML_DIR / "scripts" / "split_by_unit.py"),
                    "--metadata",
                    str(img_csv),
                    "--out",
                    str(split_csv),
                ],
                cwd=str(ML_DIR),
                capture_output=True,
                text=True,
            )
            self.assertEqual(r_split.returncode, 0, r_split.stderr)

            # Verify no unit appears in multiple splits
            with split_csv.open(newline="", encoding="utf-8") as f:
                split_rows = list(csv.DictReader(f))
            self.assertEqual(len(split_rows), 9)
            unit_to_split = {r["unit_id"]: r["split"] for r in split_rows}
            self.assertEqual(set(unit_to_split.values()), {"train", "validation", "test"})

            # 2. Run create_pairs.py
            r_pairs = subprocess.run(
                [
                    sys.executable,
                    str(ML_DIR / "scripts" / "create_pairs.py"),
                    "--images",
                    str(img_csv),
                    "--splits",
                    str(split_csv),
                    "--out",
                    str(pairs_csv),
                ],
                cwd=str(ML_DIR),
                capture_output=True,
                text=True,
            )
            self.assertEqual(r_pairs.returncode, 0, r_pairs.stderr)

            with pairs_csv.open(newline="", encoding="utf-8") as f:
                pair_rows = list(csv.DictReader(f))
            self.assertGreater(len(pair_rows), 0)

            # Confirm both positive (1) and negative (0) pairs exist in every split
            for sp in ("train", "validation", "test"):
                labels = {int(r["label_same_identity"]) for r in pair_rows if r["split"] == sp}
                self.assertEqual(labels, {0, 1}, f"Split {sp} missing positive or negative pairs")

            # 3. Run validate_dataset.py
            r_val = subprocess.run(
                [
                    sys.executable,
                    str(ML_DIR / "scripts" / "validate_dataset.py"),
                    "--root",
                    str(tmp_path),
                    "--images",
                    str(img_csv),
                    "--splits",
                    str(split_csv),
                ],
                cwd=str(ML_DIR),
                capture_output=True,
                text=True,
            )
            self.assertEqual(r_val.returncode, 0, r_val.stdout + r_val.stderr)
            self.assertIn("Validated 18 metadata rows and 18 distinct image files", r_val.stdout)

    def test_03_validate_dataset_detects_duplicates_and_small_images(self):
        """Verify validate_dataset.py flags byte-identical duplicates and <100x100 images."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            img_csv = tmp_path / "images.csv"
            split_csv = tmp_path / "splits.csv"

            # Write two identical images and one tiny 50x50 image
            identical_bytes = make_test_image_bytes(224, 224, color=(100, 100, 100))
            tiny_bytes = make_test_image_bytes(50, 50, color=(120, 120, 120))
            (tmp_path / "img1.png").write_bytes(identical_bytes)
            (tmp_path / "img2.png").write_bytes(identical_bytes)
            (tmp_path / "tiny.png").write_bytes(tiny_bytes)

            with split_csv.open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=["unit_id", "product_id", "split", "split_reason"])
                w.writeheader()
                w.writerow({"unit_id": "U1", "product_id": "P1", "split": "train", "split_reason": "test"})

            fieldnames = [
                "image_id",
                "relative_path",
                "product_id",
                "unit_id",
                "category",
                "label",
                "source_type",
                "quality_status",
            ]
            with img_csv.open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerow({"image_id": "1", "relative_path": "img1.png", "product_id": "P1", "unit_id": "U1", "category": "food", "label": "genuine", "source_type": "own", "quality_status": "good"})
                w.writerow({"image_id": "2", "relative_path": "img2.png", "product_id": "P1", "unit_id": "U1", "category": "food", "label": "genuine", "source_type": "own", "quality_status": "good"})
                w.writerow({"image_id": "3", "relative_path": "tiny.png", "product_id": "P1", "unit_id": "U1", "category": "food", "label": "genuine", "source_type": "own", "quality_status": "good"})

            r_val = subprocess.run(
                [
                    sys.executable,
                    str(ML_DIR / "scripts" / "validate_dataset.py"),
                    "--root",
                    str(tmp_path),
                    "--images",
                    str(img_csv),
                    "--splits",
                    str(split_csv),
                ],
                cwd=str(ML_DIR),
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(r_val.returncode, 0)
            self.assertIn("Duplicate byte-identical images", r_val.stdout)
            self.assertIn("Image resolution too small", r_val.stdout)

    def test_04_inference_app_quality_and_unconfigured_safeguards(self):
        """Verify app.py inspect_image and health/compare behavior when model weights are absent."""
        sys.path.insert(0, str(ML_DIR))
        import app as ml_app

        # 1. Health endpoint must report ready when trained weights exist, and not_configured when absent
        health_res = ml_app.health()
        if ml_app.MODEL_PATH.exists():
            self.assertEqual(health_res["status"], "ready")
            self.assertGreater(float(health_res["threshold"]), 0.0)
        else:
            self.assertEqual(health_res["status"], "not_configured")
            self.assertIn("Trained model file not found", health_res["message"])

        # 2. Small image (<100x100) raises ValueError
        small_bytes = make_test_image_bytes(64, 64, color=(128, 128, 128))
        with self.assertRaisesRegex(ValueError, "Image resolution is too small"):
            ml_app.inspect_image(small_bytes)

        # 3. Pitch-black image (brightness < 10) raises ValueError
        dark_bytes = make_test_image_bytes(224, 224, color=(2, 2, 2))
        with self.assertRaisesRegex(ValueError, "too dark or overexposed"):
            ml_app.inspect_image(dark_bytes)

        # 4. Overexposed white image (brightness > 247) raises ValueError
        bright_bytes = make_test_image_bytes(224, 224, color=(253, 253, 253))
        with self.assertRaisesRegex(ValueError, "too dark or overexposed"):
            ml_app.inspect_image(bright_bytes)

        # 5. Corrupt non-image bytes raise ValueError
        with self.assertRaisesRegex(ValueError, "not a valid readable image"):
            ml_app.inspect_image(b"not-an-image-payload")

    def test_05_grocery_store_dataset_manifest_and_pair_isolation(self):
        """Verify prepare_grocery_dataset.py preserves splits, flags zero leakage, and builds packaged pairs."""
        sys.path.insert(0, str(ML_DIR / "scripts"))
        import prepare_grocery_dataset as pgd

        with tempfile.TemporaryDirectory() as tmp:
            ds_root = Path(tmp) / "dataset"
            ds_root.mkdir(parents=True, exist_ok=True)
            (ds_root / "classes.csv").write_text(
                "Class Name (str),Class ID (int),Coarse Class Name (str),Coarse Class ID (int),Iconic Image Path (str),Product Description Path (str)\n"
                "Arla-Standard-Milk,0,Milk,0,iconic/0.jpg,desc/0.txt\n"
                "Bravo-Orange-Juice,1,Juice,1,iconic/1.jpg,desc/1.txt\n",
                encoding="utf-8",
            )
            for sp_file, prefix in (("train.txt", "train"), ("val.txt", "val"), ("test.txt", "test")):
                lines = []
                for cid in (0, 1):
                    for idx in (1, 2):
                        rel = f"{prefix}/class_{cid}_img_{idx}.png"
                        fp = ds_root / rel
                        fp.parent.mkdir(parents=True, exist_ok=True)
                        fp.write_bytes(make_test_image_bytes(224, 224, color=(40 + cid * 40, 80 + idx * 20, 120)))
                        lines.append(f"{rel}, {cid}, {cid}")
                (ds_root / sp_file).write_text("\n".join(lines) + "\n", encoding="utf-8")

            manifest_out = Path(tmp) / "grocery_manifest.csv"
            report_out = Path(tmp) / "grocery_report.json"
            pairs_out = Path(tmp) / "grocery_pairs.csv"

            manifest_rows = pgd.validate_and_build_manifest(ds_root, manifest_out, report_out)
            self.assertEqual(len(manifest_rows), 12)
            pgd.build_split_isolated_pairs(manifest_rows, pairs_out, packaged_only=True, max_Anchor_per_class=5)
            with pairs_out.open(newline="", encoding="utf-8") as f:
                pairs = list(csv.DictReader(f))
            self.assertGreater(len(pairs), 0)
            for sp in ("train", "validation", "test"):
                labels = {int(r["label_same_identity"]) for r in pairs if r["split"] == sp}
                self.assertEqual(labels, {0, 1})


if __name__ == "__main__":
    unittest.main(verbosity=2)

