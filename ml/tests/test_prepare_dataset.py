from scripts.prepare_dataset import assign_related_group_keys, assign_splits, expand_directions


def test_related_pairs_never_cross_splits():
    rows = [
        {"english": "alpha", "filipino": "isa"},
        {"english": "isa", "filipino": "alpha"},
        {"english": "alpha", "filipino": "una"},
        {"english": "beta", "filipino": "dalawa"},
        {"english": "gamma", "filipino": "tatlo"},
    ]
    assign_related_group_keys(rows)
    splits = assign_splits(rows, seed=42, ratios=(0.5, 0.25, 0.25))
    locations = {}
    for split, split_rows in splits.items():
        for row in split_rows:
            locations.setdefault(row["group_key"], set()).add(split)
    assert all(len(split_names) == 1 for split_names in locations.values())


def test_each_pair_expands_to_both_directions():
    row = {"english": "sample", "filipino": "halimbawa", "group_key": "group"}
    examples = expand_directions([row])
    assert {item["direction"] for item in examples} == {"en_to_fil", "fil_to_en"}
    assert all(item["group_key"] == "group" for item in examples)
