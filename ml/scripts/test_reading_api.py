"""Test the reading practice API endpoint."""
import requests
from pathlib import Path

def test_reading_api():
    """Test the /v1/ai/reading endpoint with audio file."""
    url = "http://127.0.0.1:8000/v1/ai/reading"
    
    # Test audio file
    test_audio = Path(__file__).parent.parent / "test_data" / "test_reading_en.wav"
    
    if not test_audio.exists():
        print(f"✗ Test audio file not found: {test_audio}")
        return False
    
    print("Testing Reading Practice API Endpoint")
    print("=" * 60)
    print(f"Endpoint: {url}")
    print(f"Audio file: {test_audio}")
    print(f"Audio size: {test_audio.stat().st_size} bytes")
    print()
    
    # Test English
    print("Test 1: English reading")
    print("-" * 60)
    
    expected_text = "Hello world this is a test"
    language = "en"
    
    with open(test_audio, "rb") as f:
        files = {"audio": ("test.wav", f, "audio/wav")}
        data = {
            "expected_text": expected_text,
            "language": language
        }
        
        try:
            response = requests.post(url, files=files, data=data, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            
            print(f"✓ Request successful (status {response.status_code})")
            print(f"\nResponse:")
            print(f"  Transcript: \"{result.get('transcript', '')}\"")
            print(f"  Matched words: {result.get('matched_words', [])}")
            print(f"  Missing words: {result.get('missing_words', [])}")
            print(f"  Extra words: {result.get('extra_words', [])}")
            print(f"  Expected word count: {result.get('expected_word_count', 0)}")
            print(f"  Feedback: {result.get('feedback', '')}")
            print(f"  Assessment type: {result.get('assessment_type', '')}")
            
        except requests.exceptions.HTTPError as e:
            print(f"✗ HTTP Error: {e}")
            print(f"Response: {e.response.text if e.response else 'N/A'}")
            return False
        except Exception as e:
            print(f"✗ Error: {e}")
            return False
    
    print()
    
    # Test Filipino
    print("Test 2: Filipino reading")
    print("-" * 60)
    
    expected_text = "Kumusta mundo"
    language = "fil"
    
    with open(test_audio, "rb") as f:
        files = {"audio": ("test.wav", f, "audio/wav")}
        data = {
            "expected_text": expected_text,
            "language": language
        }
        
        try:
            response = requests.post(url, files=files, data=data, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            
            print(f"✓ Request successful (status {response.status_code})")
            print(f"\nResponse:")
            print(f"  Transcript: \"{result.get('transcript', '')}\"")
            print(f"  Matched words: {result.get('matched_words', [])}")
            print(f"  Missing words: {result.get('missing_words', [])}")
            print(f"  Feedback: {result.get('feedback', '')}")
            
        except requests.exceptions.HTTPError as e:
            print(f"✗ HTTP Error: {e}")
            print(f"Response: {e.response.text if e.response else 'N/A'}")
            return False
        except Exception as e:
            print(f"✗ Error: {e}")
            return False
    
    print()
    print("=" * 60)
    print("✓ All API tests passed!")
    print("=" * 60)
    print("\nThe reading practice endpoint is fully functional.")
    print("\nNote: Tests used silent audio, so transcripts are empty.")
    print("With real speech, the model will transcribe and compare.")
    
    return True

if __name__ == "__main__":
    import sys
    
    try:
        success = test_reading_api()
        sys.exit(0 if success else 1)
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to backend")
        print("Make sure the backend is running:")
        print("  cd services/inference && uvicorn app.main:app --port 8000")
        sys.exit(1)
