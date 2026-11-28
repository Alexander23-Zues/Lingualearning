"""Test Helsinki-NLP models with diverse sentences."""
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "inference"))

from app.translation_runtime import ModelRuntime


class TranslationRequest:
    """Simple request object for testing."""
    def __init__(self, text: str, source_language: str, target_language: str):
        self.text = text
        self.source_language = source_language
        self.target_language = target_language


def test_translations():
    """Test the Helsinki models with various sentence types."""
    model_path = Path(__file__).parent.parent / "models" / "helsinki-opus-mt"
    
    print("=" * 70)
    print("Helsinki-NLP OPUS-MT Translation Test")
    print("=" * 70)
    print(f"Model: {model_path}")
    print()
    
    # Load the model
    print("Loading model...")
    runtime = ModelRuntime(model_path)
    print(f"✓ Model loaded successfully")
    print(f"  Architecture: {runtime.manifest['architecture']}")
    print(f"  Version: {runtime.manifest['model_version']}")
    print()
    
    # Test cases: (text, source_lang, category)
    test_cases = [
        # School-related sentences (should work well)
        ("Good morning", "en", "School - Greeting"),
        ("The teacher is writing", "en", "School - Activity"),
        ("The teacher is reading", "en", "School - Activity"),
        
        # General conversation (main improvement target)
        ("How are you today?", "en", "Conversation"),
        ("What is your name?", "en", "Conversation"),
        ("I am fine, thank you", "en", "Conversation"),
        
        # Food and daily life
        ("I want to eat pizza", "en", "Food"),
        ("I like to drink coffee", "en", "Food"),
        
        # Sports and hobbies
        ("I like to play basketball", "en", "Sports"),
        ("Do you play soccer?", "en", "Sports"),
        
        # Common phrases
        ("Where is the bathroom?", "en", "Common Phrases"),
        ("How much does this cost?", "en", "Common Phrases"),
        
        # Case sensitivity tests
        ("good morning", "en", "Lowercase Test"),
        ("GOOD MORNING", "en", "Uppercase Test"),
        ("GoOd MoRnInG", "en", "Mixed Case Test"),
    ]
    
    print("-" * 70)
    print("ENGLISH → TAGALOG TRANSLATIONS")
    print("-" * 70)
    
    results = []
    for text, source_lang, category in test_cases:
        try:
            request = TranslationRequest(text, source_lang, "fil")
            translation = runtime.translate(request)
            status = "✓"
            results.append((category, text, translation, True))
        except Exception as e:
            translation = f"ERROR: {e}"
            status = "✗"
            results.append((category, text, translation, False))
        
        print(f"\n{status} [{category}]")
        print(f"  EN: {text}")
        print(f"  TL: {translation}")
    
    # Test Tagalog to English
    fil_test_cases = [
        ("Magandang umaga", "fil", "Greeting"),
        ("Kumusta ka?", "fil", "Conversation"),
        ("Gusto ko ng kape", "fil", "Food"),
    ]
    
    print("\n" + "-" * 70)
    print("TAGALOG → ENGLISH TRANSLATIONS")
    print("-" * 70)
    
    for text, source_lang, category in fil_test_cases:
        try:
            request = TranslationRequest(text, source_lang, "en")
            translation = runtime.translate(request)
            status = "✓"
            results.append((category, text, translation, True))
        except Exception as e:
            translation = f"ERROR: {e}"
            status = "✗"
            results.append((category, text, translation, False))
        
        print(f"\n{status} [{category}]")
        print(f"  TL: {text}")
        print(f"  EN: {translation}")
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    total = len(results)
    successful = sum(1 for r in results if r[3])
    failed = total - successful
    
    print(f"Total tests: {total}")
    print(f"Successful: {successful} ({successful/total*100:.1f}%)")
    print(f"Failed: {failed} ({failed/total*100:.1f}%)")
    
    if failed > 0:
        print("\nFailed translations:")
        for category, text, translation, success in results:
            if not success:
                print(f"  - [{category}] {text}: {translation}")
    
    return successful == total


if __name__ == "__main__":
    try:
        success = test_translations()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
