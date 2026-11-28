import io,json,sys,zipfile
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'scripts'))
from reading_assessments import validate_baseline
from offline_collection_server import Store,CollectionError
from restore_offline_collection import restore

def baseline():
 return dict(source_key='synthetic:1',source_title='Synthetic assessment',source_row=1,source_notes='',language='fil',assessment_type='BoSY',assessment_date='2026-09-15',letter_sounds=7,rhymes=None,sentences=5,part1_total=22,part1_level='Light Refresher',story_number=1,total_story_words=51,miscues=26,words_read=25,reading_seconds=67,wpm=22,accuracy_percent=49,comprehension_correct=None,comprehension_total=5,experience_rating=None,observation_level=None,reading_profile='High Emerging Reader')

def test_source_keeps_original_duration_label_and_missing_comprehension():
 d=validate_baseline(baseline())
 assert d['quality_flags']==['duration_exceeds_form_one_minute','comprehension_not_recorded']
 assert d['reading_seconds']==67 and d['wpm']==22 and d['comprehension_correct'] is None
 assert d['english_placement_applied'] is False and d['requires_teacher_review'] is True
 assert validate_baseline({**baseline(),'comprehension_correct':0})['comprehension_correct']==0

@pytest.mark.parametrize('change',[{'part1_total':12},{'rhymes':10},{'language':'de'},{'letter_sounds':True},{'student_name':'Private name'},{'story_number':None},{'comprehension_correct':6}])
def test_invalid_or_identifying_fields_are_rejected(change):
 with pytest.raises(ValueError):validate_baseline({**baseline(),**change})

def test_not_administered_is_not_zero():
 d={**baseline(),'letter_sounds':5,'rhymes':5,'sentences':None,'part1_total':10,'part1_level':'Full Refresher','reading_profile':'Low Emerging Reader','story_number':None}
 for key in ['miscues','words_read','reading_seconds','wpm','accuracy_percent','comprehension_correct','experience_rating','observation_level']:d[key]=None
 assert validate_baseline(d)['words_read'] is None
 with pytest.raises(ValueError):validate_baseline({**d,'words_read':0})

def test_saved_baseline_survives_restart_export_and_restore_without_mission_credit(tmp_path):
 prepared=tmp_path/'prepared';prepared.mkdir();store=Store(prepared/'data/collection.sqlite3')
 profile={'id':'owner','email':'owner@school.test','grade_levels':[1],'account_kind':'review'}
 child={'id':'child','adult_id':'owner','grade_level':1,'nickname':'Synthetic learner','active':True,'is_demo':True,'learning_level':'beginner'}
 state={'children':[child,dict(child,id='other',adult_id='other')],'records':[],'materials':[],'attempts':[]}
 store.initialize(profile,'local-test-password',state,{})
 token,_=store.login(profile['email'],'local-test-password');args={'p_child_id':'child','p_data':baseline()}
 key=store.rpc('save_reading_assessment',args,token)
 assert store.rpc('save_reading_assessment',args,token)==key
 with pytest.raises(CollectionError,match='already recorded'):store.rpc('save_reading_assessment',{**args,'p_data':{**baseline(),'comprehension_correct':1}},token)
 with pytest.raises(CollectionError,match='assigned classroom'):store.rpc('save_reading_assessment',{**args,'p_child_id':'other'},token)
 reopened=Store(store.path);assert len(reopened.snapshot()['records'])==1
 assert reopened.snapshot()['attempts']==[] and reopened.snapshot()['children'][0]['learning_level']=='beginner'
 raw,_=reopened.export()
 with zipfile.ZipFile(io.BytesIO(raw)) as z:assert json.loads(z.read('collection.json'))['classroom_records'][0]['data']['comprehension_correct'] is None
 (prepared/'preparation.json').write_text(json.dumps({'cloud_account_id':'owner'}))
 for name in ['adventure_learning.py','reading_assessments.py']:(prepared/name).write_text('# test runtime')
 target=tmp_path/'restored';restore(prepared/'data/backups/latest.sqlite3',prepared,target)
 restored=Store(target/'data/collection.sqlite3');assert restored.snapshot()['records']==reopened.snapshot()['records']
 assert (target/'reading_assessments.py').exists() and (target/'adventure_learning.py').exists()
