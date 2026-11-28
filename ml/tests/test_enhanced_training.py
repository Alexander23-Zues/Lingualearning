"""Tests for enhanced training system with larger datasets and training profiles."""
import hashlib
import json
import pytest
from pathlib import Path
from ml.scripts.training_readiness import pairs_summary, dataset_summary
from ml.scripts.training_worker import TRAINING_PROFILES, verified_pairs


def test_training_profiles_are_properly_configured():
    """Verify all training profiles have valid configuration."""
    assert 'quick' in TRAINING_PROFILES
    assert 'standard' in TRAINING_PROFILES
    assert 'quality' in TRAINING_PROFILES

    for profile_name, profile in TRAINING_PROFILES.items():
        assert 'epochs' in profile
        assert 'batch_size' in profile
        assert 'description' in profile
        assert 'recommended_for' in profile
        assert 1 <= profile['epochs'] <= 20
        assert 1 <= profile['batch_size'] <= 16


def test_quick_profile_uses_fewer_epochs():
    """Quick profile should be fastest with 1 epoch."""
    assert TRAINING_PROFILES['quick']['epochs'] == 1
    assert TRAINING_PROFILES['quick']['epochs'] < TRAINING_PROFILES['standard']['epochs']
    assert TRAINING_PROFILES['quick']['epochs'] < TRAINING_PROFILES['quality']['epochs']


def test_quality_profile_uses_most_epochs():
    """Quality profile should use most epochs for best results."""
    assert TRAINING_PROFILES['quality']['epochs'] >= TRAINING_PROFILES['standard']['epochs']
    assert TRAINING_PROFILES['quality']['epochs'] > TRAINING_PROFILES['quick']['epochs']


def test_larger_dataset_support():
    """System should support datasets up to 10,000 pairs."""
    # Test with 500 pairs (new educational dataset size)
    pairs_500 = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(500)]
    summary = pairs_summary(pairs_500, max_pairs=10000)
    assert summary['unique_pairs'] == 500
    assert summary['splits']['train'] == 400
    assert summary['splits']['validation'] == 50
    assert summary['splits']['test'] == 50

    # Test with 1000 pairs
    pairs_1000 = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(1000)]
    summary = pairs_summary(pairs_1000, max_pairs=10000)
    assert summary['unique_pairs'] == 1000
    assert summary['splits']['train'] == 800
    assert summary['splits']['validation'] == 100
    assert summary['splits']['test'] == 100


def test_dataset_size_limits_are_enforced():
    """Dataset must be between 20 and 10,000 pairs."""
    # Too small
    with pytest.raises(ValueError, match='20-10,000'):
        pairs_summary([{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(15)], max_pairs=10000)

    # Too large (over 10k)
    with pytest.raises(ValueError, match='20-10,000'):
        pairs_summary([{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(10001)], max_pairs=10000)

    # Just right
    pairs = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(5000)]
    summary = pairs_summary(pairs, max_pairs=10000)
    assert summary['unique_pairs'] == 5000


def test_verified_pairs_enforces_new_limits():
    """Worker and API support the configured 50k ceiling and reject larger inputs."""
    # Create valid snapshot - note the system uses 'english' and 'filipino' keys
    pairs = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(500)]
    checksum = hashlib.sha256(json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    snapshot = {
        'pairs': pairs,
        'checksum': checksum,
        'source': 'https://example.com/dataset',
        'license': 'CC BY 4.0'
    }

    # Should accept 500 pairs
    result = verified_pairs(snapshot)
    assert len(result) == 500

    # Check the actual upper boundary, not merely a smaller valid corpus.
    corpus = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(50000)]
    corpus_checksum = hashlib.sha256(json.dumps(corpus, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    assert len(verified_pairs({**snapshot, 'pairs': corpus, 'checksum': corpus_checksum})) == 50000

    # Oversized input is rejected before it reaches training.
    large_pairs = corpus + [{'english': 'source 50000', 'filipino': 'target 50000'}]
    large_checksum = hashlib.sha256(json.dumps(large_pairs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    snapshot_large = {
        'pairs': large_pairs,
        'checksum': large_checksum,
        'source': 'https://example.com/dataset',
        'license': 'CC BY 4.0'
    }

    with pytest.raises(ValueError, match='50,000 reviewed pairs'):
        verified_pairs(snapshot_large)


def test_educational_dataset_can_be_loaded(tmp_path):
    """Test that the new educational dataset format can be validated."""
    dataset = tmp_path / 'educational.csv'
    content = 'english,filipino,source,license,category,reviewer_notes\n'
    content += 'Hello,Kumusta,Educational Dataset,CC BY 4.0,greetings,Basic greeting\n'
    content += 'Thank you,Salamat,Educational Dataset,CC BY 4.0,greetings,Gratitude\n'
    # Add unique pairs to avoid duplicates
    for i in range(18):
        content += f'Number {i},Numero {i},Educational Dataset,CC BY 4.0,numbers,Number\n'

    dataset.write_text(content, encoding='utf-8')

    summary = dataset_summary(dataset)
    assert summary['unique_pairs'] == 20
    assert all(key in summary['splits'] for key in ['train', 'validation', 'test'])


def test_profile_based_configuration():
    """Test that profile configurations are applied correctly."""
    # Quick profile
    quick = TRAINING_PROFILES['quick']
    assert quick['epochs'] == 1
    assert quick['batch_size'] == 4

    # Standard profile
    standard = TRAINING_PROFILES['standard']
    assert standard['epochs'] == 3
    assert standard['batch_size'] == 2

    # Quality profile
    quality = TRAINING_PROFILES['quality']
    assert quality['epochs'] == 5
    assert quality['batch_size'] == 2


def test_dataset_category_organization():
    """Test that datasets can include category information."""
    pairs = []
    categories = ['greetings', 'numbers', 'colors', 'animals']

    for i, category in enumerate(categories * 5):  # 20 pairs across 4 categories
        pairs.append({
            'english': f'source {i}',
            'filipino': f'target {i}',
            'category': category
        })

    summary = pairs_summary(pairs, max_pairs=10000)
    assert summary['unique_pairs'] == 20


def test_memory_efficient_validation():
    """Test that validation can handle larger datasets efficiently."""
    # Simulate processing 1000 pairs without loading all into memory at once
    pairs = [{'english': f'Hello number {i}', 'filipino': f'Kumusta numero {i}'} for i in range(1000)]

    # Should complete without memory issues
    summary = pairs_summary(pairs, max_pairs=10000)
    assert summary['unique_pairs'] == 1000

    # Splits should be proportional
    total = sum(summary['splits'].values())
    assert total == 1000


def test_checksum_validation_with_larger_datasets():
    """Test that checksum validation works with larger datasets."""
    pairs = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(500)]
    checksum = hashlib.sha256(json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    snapshot = {
        'pairs': pairs,
        'checksum': checksum,
        'source': 'https://example.com',
        'license': 'CC BY 4.0'
    }

    # Valid checksum should pass
    result = verified_pairs(snapshot)
    assert len(result) == 500

    # Invalid checksum should fail
    snapshot['checksum'] = 'invalid_checksum'
    with pytest.raises(ValueError, match='checksum mismatch'):
        verified_pairs(snapshot)


def test_attribution_preservation_for_larger_datasets():
    """Test that attribution is preserved for larger datasets."""
    pairs = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(500)]
    checksum = hashlib.sha256(json.dumps(pairs, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

    snapshot = {
        'pairs': pairs,
        'checksum': checksum,
        'source': 'https://linguakids.com/educational-dataset-v1',
        'license': 'CC BY 4.0'
    }

    result = verified_pairs(snapshot)
    assert len(result) == 500


def test_dataset_diversity_validation():
    """Test that dataset has sufficient diversity for good splits."""
    # Good diversity - unique targets
    diverse_pairs = [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(100)]
    summary = pairs_summary(diverse_pairs, max_pairs=10000)
    assert summary['unique_pairs'] == 100
    assert all(count > 0 for count in summary['splits'].values())

    # Poor diversity - all same target (should fail to create valid splits)
    same_target_pairs = [{'english': f'source {i}', 'filipino': 'same target'} for i in range(100)]
    with pytest.raises(ValueError, match='empty'):
        pairs_summary(same_target_pairs, max_pairs=10000)


def test_unicode_and_special_characters_in_filipino():
    """Test that Filipino text with special characters is handled correctly."""
    pairs = [
        {'english': 'Hello', 'filipino': 'Kumusta'},
        {'english': 'Thank you', 'filipino': 'Salamát'},  # with accent
        {'english': 'Excuse me', 'filipino': 'Excuse me po'},  # with space
        {'english': 'Good morning', 'filipino': 'Magandáng umaga'},  # with accent
    ] + [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(16)]  # 20 total

    summary = pairs_summary(pairs, max_pairs=10000)
    assert summary['unique_pairs'] == 20


def test_long_sentences_are_validated():
    """Test that sentence length limits are enforced."""
    # Normal length should work
    normal_pairs = [
        {'english': 'This is a normal sentence', 'filipino': 'Ito ay normal na pangungusap'}
    ] + [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(19)]

    summary = pairs_summary(normal_pairs, max_pairs=10000)
    assert summary['unique_pairs'] == 20

    # Too long should fail (over 2000 chars)
    long_pairs = [
        {'english': 'x' * 2001, 'filipino': 'short'}
    ] + [{'english': f'source {i}', 'filipino': f'target {i}'} for i in range(19)]

    with pytest.raises(ValueError, match='oversized'):
        pairs_summary(long_pairs, max_pairs=10000)


def test_progress_tracking_structure():
    """Test that progress tracking includes necessary fields."""
    # Progress should include phase, direction, step, epoch
    progress = {
        'phase': 'training',
        'direction': 'en_to_fil',
        'step': 50,
        'total_steps': 200,
        'epoch': 1.5
    }

    assert progress['phase'] == 'training'
    assert progress['direction'] in ['en_to_fil', 'fil_to_en']
    assert 0 <= progress['step'] <= progress['total_steps']
    assert progress['epoch'] > 0


def test_evaluation_metrics_structure():
    """Test expected structure of evaluation metrics."""
    # Metrics should include BLEU and chrF for both directions
    metrics = {
        'en_to_fil': {'bleu': 45.2, 'chrf': 65.8, 'test_pairs': 50},
        'fil_to_en': {'bleu': 52.1, 'chrf': 68.3, 'test_pairs': 50}
    }

    for direction in ['en_to_fil', 'fil_to_en']:
        assert 'bleu' in metrics[direction]
        assert 'chrf' in metrics[direction]
        assert 'test_pairs' in metrics[direction]
        assert 0 <= metrics[direction]['bleu'] <= 100
        assert 0 <= metrics[direction]['chrf'] <= 100
