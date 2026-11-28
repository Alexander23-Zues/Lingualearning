from app.tagalog_text import normalize_tagalog


def test_normalizes_taglish_description_before_model_inference():
    original = (
        "babaeng simple at masyadong approchable yang babae nayan ay napaka bait "
        "at masiyahin pero nakakatakot pag nagalit"
    )
    assert normalize_tagalog(original) == (
        "Ang babaeng iyan ay simple, napakadaling lapitan, napakabait, at masayahin, "
        "pero nakakatakot siya kapag nagagalit."
    )


def test_keeps_unrelated_intensifiers_names_and_tense():
    assert normalize_tagalog("Masyadong mainit ang kape ni Ana.") == "Masyadong mainit ang kape ni Ana."
    assert normalize_tagalog("Umalis si Ana nang siya ay nagalit.") == "Umalis si Ana nang siya ay nagalit."
    assert normalize_tagalog("Sobrang approachable si Ana.") == "napakadaling lapitan si Ana."


def test_expands_omitted_items_in_parallel_counts():
    assert normalize_tagalog("Tatlo ang aklat ni Maya at dalawa kay Luis.") == (
        "May tatlong aklat si Maya at may dalawang aklat si Luis."
    )
    assert normalize_tagalog("Anim ang lapis ni Maya at siyam kay Luis.") == (
        "May anim na lapis si Maya at may siyam na lapis si Luis."
    )
    assert normalize_tagalog("Dalawa kay Luis at isa pa sa silid.") == "Dalawa kay Luis at isa pa sa silid."


def test_combines_traits_only_for_matching_subjects():
    assert normalize_tagalog(
        "Babaeng simple at madaling lapitan ang lalaking iyan ay napakabait at masayahin."
    ) == "Babaeng simple at madaling lapitan ang lalaking iyan ay napakabait at masayahin."
