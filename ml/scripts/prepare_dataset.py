import argparse
import csv
import hashlib
import json
import random
import re
from collections import defaultdict
from pathlib import Path


REQUIRED_COLUMNS = {"english", "filipino"}


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().casefold())


def group_key(english: str, filipino: str) -> str:
    sides = sorted((normalize(english), normalize(filipino)))
    return hashlib.sha256("\u241f".join(sides).encode("utf-8")).hexdigest()


def assign_related_group_keys(rows: list[dict[str, str]]) -> None:
    parents = list(range(len(rows)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    first_seen: dict[str, int] = {}
    for index, row in enumerate(rows):
        for side in (normalize(row["english"]), normalize(row["filipino"])):
            if side in first_seen:
                union(index, first_seen[side])
            else:
                first_seen[side] = index

    components: dict[int, list[int]] = defaultdict(list)
    for index in range(len(rows)):
        components[find(index)].append(index)
    for indices in components.values():
        material = sorted(
            f"{normalize(rows[index]['english'])}\u241f{normalize(rows[index]['filipino'])}"
            for index in indices
        )
        related_key = hashlib.sha256("\u241e".join(material).encode("utf-8")).hexdigest()
        for index in indices:
            rows[index]["group_key"] = related_key


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not REQUIRED_COLUMNS.issubset(reader.fieldnames):
            raise ValueError("CSV requires english and filipino columns.")
        rows = []
        seen = set()
        for line_number, raw in enumerate(reader, start=2):
            english = raw.get("english", "").strip()
            filipino = raw.get("filipino", "").strip()
            if not english or not filipino:
                raise ValueError(f"Row {line_number} has an empty required value.")
            exact_key = (normalize(english), normalize(filipino))
            if exact_key in seen:
                continue
            seen.add(exact_key)
            rows.append({**raw, "english": english, "filipino": filipino})
    if not rows:
        raise ValueError("The approved snapshot contains no usable pairs.")
    assign_related_group_keys(rows)
    return rows


def assign_splits(rows: list[dict[str, str]], seed: int, ratios: tuple[float, float, float]) -> dict[str, list[dict[str, str]]]:
    if abs(sum(ratios) - 1.0) > 1e-9:
        raise ValueError("Split ratios must total 1.0.")
    groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        groups[row["group_key"]].append(row)
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    train_end = round(len(keys) * ratios[0])
    validation_end = train_end + round(len(keys) * ratios[1])
    assignments = {
        "train": keys[:train_end],
        "validation": keys[train_end:validation_end],
        "test": keys[validation_end:],
    }
    return {name: [row for key in split_keys for row in groups[key]] for name, split_keys in assignments.items()}


def expand_directions(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    examples = []
    for row in rows:
        examples.extend([
            {
                "input": f"translate English to Filipino: {row['english']}",
                "target": row["filipino"],
                "direction": "en_to_fil",
                "group_key": row["group_key"],
            },
            {
                "input": f"translate Filipino to English: {row['filipino']}",
                "target": row["english"],
                "direction": "fil_to_en",
                "group_key": row["group_key"],
            },
        ])
    return examples


def write_jsonl(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-ratio", type=float, default=0.8)
    parser.add_argument("--validation-ratio", type=float, default=0.1)
    parser.add_argument("--test-ratio", type=float, default=0.1)
    args = parser.parse_args()

    rows = load_rows(args.input)
    splits = assign_splits(rows, args.seed, (args.train_ratio, args.validation_ratio, args.test_ratio))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"seed": args.seed, "source_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(), "counts": {}}
    for name, split_rows in splits.items():
        expanded = expand_directions(split_rows)
        write_jsonl(args.output_dir / f"{name}.jsonl", expanded)
        manifest["counts"][name] = {"pairs": len(split_rows), "examples": len(expanded)}
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
