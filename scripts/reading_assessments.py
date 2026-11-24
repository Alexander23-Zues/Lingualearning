"""Private source baselines; these never grade a quiz or unlock a mission."""
import re
from datetime import date

LIMITS={'source_row':2000,'letter_sounds':10,'rhymes':10,'sentences':10,'part1_total':30,'story_number':2,
        'total_story_words':10000,'miscues':10000,'words_read':10000,'reading_seconds':3600,'wpm':10000,
        'accuracy_percent':100,'comprehension_correct':5,'comprehension_total':5,'experience_rating':5,'observation_level':4}
FIELDS=set(LIMITS)|{'source_key','source_title','source_notes','language','assessment_type','assessment_date','reading_profile','part1_level'}
PROFILES={'Low Emerging Reader','High Emerging Reader','Developing Reader','Transitioning Reader','Reading At Grade Level'}

def validate_baseline(data):
    def require(condition,message):
        if not condition:raise ValueError(message)
    require(isinstance(data,dict) and set(data)<=FIELDS,'Only reading baseline fields are accepted; do not include names or LRNs.')
    require(isinstance(data.get('source_key'),str) and re.fullmatch(r'[a-zA-Z0-9:_-]{1,100}',data['source_key']),'Enter a source key.')
    for key,limit in [('source_title',180),('assessment_type',40)]:
        require(isinstance(data.get(key),str) and 0<len(data[key].strip())<=limit,'Enter the assessment source and type.')
    require(isinstance(data.get('source_notes',''),str) and len(data.get('source_notes',''))<=1000,'Source notes are too long.')
    require(isinstance(data.get('assessment_date'),str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',data['assessment_date']),'Enter an assessment date.')
    date.fromisoformat(data['assessment_date'])
    require(data.get('language') in ('en','fil'),'Choose the assessment language.')
    require(data.get('reading_profile') in PROFILES and data.get('part1_level') in ('Full Refresher','Moderate Refresher','Light Refresher','Grade Ready'),'Keep the source reading categories.')
    for key,limit in LIMITS.items():
        value=data.get(key)
        require(value is None or type(value) is int and 0<=value<=limit,'Assessment counts must be bounded whole numbers: '+key)
    require((data.get('source_row') or 0)>0 and data.get('letter_sounds') is not None and data.get('part1_total') is not None and (data.get('total_story_words') or 0)>0 and data.get('comprehension_total')==5,'Enter the required assessment totals.')
    if data['letter_sounds']<=6:
        require(data.get('rhymes') is not None and data.get('sentences') is None and data['part1_total']==data['letter_sounds']+data['rhymes'],'Check the rhyme route.')
    else:
        require(data.get('sentences') is not None and data.get('rhymes') is None and data['part1_total']==data['letter_sounds']+10+data['sentences'],'Check the sentence route and automatic rhyme credit.')
    flags=[]
    if data.get('story_number') is not None:
        require(data['story_number'] in (1,2) and all(data.get(key) is not None for key in ('miscues','words_read','reading_seconds','wpm','accuracy_percent')) and data['reading_seconds']>0 and data['words_read']<=data['total_story_words'],'Enter the recorded story counts and time.')
        if data['reading_seconds']>60:flags.append('duration_exceeds_form_one_minute')
        if data.get('comprehension_correct') is None:flags.append('comprehension_not_recorded')
    else:
        require(all(data.get(key) is None for key in ('miscues','words_read','reading_seconds','wpm','accuracy_percent','comprehension_correct','experience_rating','observation_level')),'Not-administered reading fields must stay blank.')
    return {**data,'schema_version':1,'requires_teacher_review':True,'quality_flags':flags,'english_placement_applied':False}
