"""Normalize informal Tagalog before passing it to the translation model."""
import re
import unicodedata


_REPLACEMENTS = (
    (r"\b(?:masyadong|sobrang|napaka\s*)\s*(?:approachable|approchable)\b", "napakadaling lapitan"),
    (r"\b(?:approachable|approchable)\b", "madaling lapitan"),
    (r"\b(?:[’']?yang|iyang)\s+(babae|lalaki|tao)\s+na\s*(?:yan|iyan)\b",
     r"ang \1ng iyan"),
    (r"\b(babae|lalaki|tao)\s+nayan\b", r"\1ng iyan"),
    (r"\bnapaka\s+bait\b", "napakabait"),
    (r"\bmasiyahin\b", "masayahin"),
    (r"\b[’']?(?:pag|kapag)\s+(?=nagalit\b|nagagalit\b)", "kapag "),
)

_REPEATED_SUBJECT = re.compile(
    r"^(?P<first>babaeng|lalaking|taong)\s+"
    r"(?P<trait>simple|mahinhin|tahimik|masayahin) at "
    r"(?P<approach>(?:napakadaling|madaling) lapitan) "
    r"(?P<subject>ang (?P=first) (?:iyan|ito|iyon)) ay "
    r"(?P<kindness>napakabait|mabait) at (?P<last>masayahin|masaya|matulungin)\b",
    re.IGNORECASE,
)

_NUMBER = r"isa|dalawa|tatlo|apat|lima|anim|pito|walo|siyam|sampu"
_COUNTED_ITEMS = re.compile(
    rf"^(?P<first>(?i:{_NUMBER})) ang (?P<item>aklat|libro|lapis|kuwaderno) "
    rf"ni (?P<owner>[^\W\d_]+) at (?P<second>{_NUMBER}) kay (?P<other>[^\W\d_]+)"
    r"(?P<punctuation>[.!?]?)$",
)


def _number_linker(number: str) -> str:
    number = number.lower()
    if number.endswith("m"):
        return f"{number} na"
    return f"{number}ng"


def normalize_tagalog(text: str) -> str:
    text = unicodedata.normalize("NFC", text).strip()
    for pattern, replacement in _REPLACEMENTS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    counted = _COUNTED_ITEMS.fullmatch(text)
    if counted:
        # Spell out the noun that informal Tagalog omits in the second clause.
        return (
            f"May {_number_linker(counted['first'])} {counted['item']} si {counted['owner']} "
            f"at may {_number_linker(counted['second'])} {counted['item']} si {counted['other']}"
            f"{counted['punctuation'] or '.'}"
        )

    def combine_traits(match: re.Match[str]) -> str:
        subject = match["subject"]
        return (
            f"{subject[0].upper()}{subject[1:]} ay {match['trait']}, "
            f"{match['approach']}, {match['kindness']}, at {match['last']}"
        )

    combined = _REPEATED_SUBJECT.sub(combine_traits, text)
    if combined != text:
        # This descriptive construction expresses what someone is like when angry.
        combined = re.sub(
            r"\s*,?\s+(pero|ngunit)\s+nakakatakot(?:\s+siya)?\s+kapag\s+nagalit(?=[.!?]|$)",
            r", \1 nakakatakot siya kapag nagagalit", combined, flags=re.IGNORECASE,
        )
        if combined and combined[-1].isalpha():
            combined += "."
    return combined
