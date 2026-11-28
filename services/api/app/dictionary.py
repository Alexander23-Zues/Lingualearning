import re
import unicodedata
from html.parser import HTMLParser
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
BASE = 'https://en.wiktionary.org'
LANGUAGES = {'en': 'en', 'tl': 'fil', 'tgl': 'fil'}


class DefinitionText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain_text(html):
    parser = DefinitionText()
    parser.feed(html)
    return ' '.join(''.join(parser.parts).split())


@router.get('/v1/dictionary', tags=['dictionary'])
async def dictionary_lookup(q: str = Query(min_length=1, max_length=80)):
    term = ' '.join(unicodedata.normalize('NFC', q).split())
    if not re.fullmatch(r"[\w\s'’\-]+", term) or not any(char.isalpha() for char in term):
        raise HTTPException(422, 'Enter a word or short phrase to look up.')
    try:
        async with httpx.AsyncClient(
            base_url=BASE,
            timeout=5,
            headers={'User-Agent': 'LinguaKidsDictionary/1.0 (https://linguakids-production.up.railway.app/)'},
        ) as client:
            for title in dict.fromkeys([term, term.lower()]):
                response = await client.get('/api/rest_v1/page/definition/' + quote(title, safe=''))
                if response.status_code == 404:
                    continue
                response.raise_for_status()
                payload = response.json()
                entries = []
                for code, language in LANGUAGES.items():
                    for group in payload.get(code, [])[:5]:
                        definitions = [plain_text(item['definition'])[:600]
                                       for item in group.get('definitions', [])[:4]]
                        definitions = [text for text in definitions if text]
                        if definitions:
                            entries.append({
                                'language': language, 'part_of_speech': group.get('partOfSpeech', ''),
                                'definitions': definitions,
                            })
                if entries:
                    return {'word': title, 'entries': entries, 'suggestions': []}
            suggestions = await client.get('/w/rest.php/v1/search/title', params={'q': term, 'limit': 5})
            suggestions.raise_for_status()
            titles = [page['title'] for page in suggestions.json()['pages']
                      if page['title'].casefold() != term.casefold()]
            return {'word': term, 'entries': [], 'suggestions': titles}
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, 'The online dictionary is temporarily unavailable. Please try again.')
