import pytest
from app.language_check import assert_source_language


@pytest.mark.parametrize("text,source", [
    ("aso", "en"), ("aklat", "en"), ("babae", "en"),
    ("Ang babae ay mabait.", "en"), ("Good morning.", "fil"),
    ("The book is on the table.", "fil"), ("book", "fil"),
])
def test_wrong_source_language_is_rejected(text, source):
    with pytest.raises(ValueError, match="Switch to"):
        assert_source_language(text, source)


@pytest.mark.parametrize("text,source", [
    ("sun", "en"), ("cat", "en"), ("aklat", "fil"), ("hello", "en"),
    ("The book is on the table.", "en"), ("Magandang umaga.", "fil"),
    ("babaeng simple at masyadong approchable yang babae nayan ay napaka bait at masiyahin pero nakakatakot pag nagalit", "fil"),
])
def test_selected_source_and_informal_tagalog_are_supported(text, source):
    assert_source_language(text, source)
