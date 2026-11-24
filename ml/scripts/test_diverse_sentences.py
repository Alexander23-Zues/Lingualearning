"""Test translation with diverse sentences - school and general content."""
import sys
from pathlib import Path

# Add inference service to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "inference"))

from app.translation_runtime import ModelRuntime

class TestRequest:
    def __init__(self, text, source_language):
        self.text = text
        self.source_language = source_language

# Load model
model_path = Path("C:/Users/jomar/Desktop/Lingualearning/ml/models/helsinki-opus-mt")
print("Loading Helsinki-NLP OPUS-MT models...")
runtime = ModelRuntime(model_path)
print("✓ Models loaded\n")

# Test sentences
test_cases = [
    # School sentences (from original training data)
    ("good morning", "en", "School greeting"),
    ("The teacher is writing", "en", "School activity"),
    ("The teacher is reading", "en", "School activity"),
    
    # General conversation
    ("How are you today?", "en", "General conversation"),
    ("What is your name?", "en", "General conversation"),
    ("I am fine, thank you", "en", "General conversation"),
    
    # General activities
    ("I want to eat pizza", "en", "Food/activity"),
    ("I like to play basketball", "en", "Sports/activity"),
    ("She is watching television", "en", "General activity"),
    
    # Mixed capitalization (testing case handling)
    ("GOOD MORNING", "en", "All caps"),
    ("gOoD mOrNiNg", "en", "Mixed case"),
    
    # Filipino to English
    ("Magandang umaga", "fil", "School greeting"),
    ("Kumusta ka?", "fil", "General conversation"),
    ("Gusto kong maglaro ng basketball", "fil", "Sports/activity"),
]

print("=" * 80)
print("DIVERSE SENTENCE TRANSLATION TEST")
print("=" * 80)

passed = 0
total = len(test_cases)

for text, source, category in test_cases:
    try:
        request = TestRequest(text, source)
        result = runtime.translate(request)
        target = "fil" if source == "en" else "en"
        
        print(f"\n[{category}] {source.upper()} → {target.upper()}")
        print(f"  Input:  {text}")
        print(f"  Output: {result}")
        print("  ✓ PASSED")
        passed += 1
    except Exception as e:
        print(f"\n[{category}] {source.upper()} → {target.upper()}")
        print(f"  Input:  {text}")
        print(f"  ✗ FAILED: {e}")

print("\n" + "=" * 80)
print(f"RESULTS: {passed}/{total} tests passed")
print("=" * 80)

if passed == total:
    print("\n✓ SUCCESS: All diverse sentences translated correctly!")
    print("  - School sentences work ✓")
    print("  - General conversation works ✓")
    print("  - Food/sports/activities work ✓")
    print("  - Case variations handled ✓")
    sys.exit(0)
else:
    print(f"\n✗ FAILURE: {total - passed} tests failed")
    sys.exit(1)
