"""Temporary SQLite fixtures; no real learner or hosted record is changed."""
import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import test_adventure_collection as fixtures
from offline_collection_server import Store
from adventure_learning import Adventure
from mission_rewards import class_rewards,reward_summary


@pytest.fixture
def app():
    case=fixtures.AdventureCollectionTests(methodName='runTest');case.setUp()
    yield case
    case.tearDown()


def complete(case):
    case.get_to_story();case.pass_story()
    return case.finish(answers={f'q{i}':'a' for i in range(5)},submission='reward-completion')


def test_badge_is_awarded_only_after_all_mission_tasks_and_passing_quiz(app):
    assert app.state()['rewards']['earned_count']==0
    app.get_to_story();app.pass_story()
    assert app.state()['rewards']['earned_count']==0
    app.finish(answers={f'q{i}':'b' for i in range(5)})
    assert app.state()['rewards']['earned_count']==0
    app.finish(answers={f'q{i}':'a' for i in range(5)},submission='passed')
    rewards=app.state()['rewards']
    assert rewards['earned_count']==rewards['completed_missions']==1
    assert rewards['completion_percent']==100 and rewards['rank']==1
    assert rewards['mission_badges'][0]['verification']=='local_pending_verification'
    assert rewards['milestones'][0]['earned'] is True
    assert rewards['milestones'][1]['earned'] is False


def test_repeated_submissions_and_restarts_do_not_duplicate_badges_or_results(app):
    complete(app)
    before=deepcopy(app.store.snapshot()['attempts'])
    app.finish('quiz:1:read',{f'q{i}':'a' for i in range(5)},submission='reward-completion')
    app.store=Store(app.path)
    assert app.store.snapshot()['attempts']==before
    assert app.state()['rewards']['earned_count']==1
    assert len(app.store.snapshot()['adventure']['mission_awards'][app.child])==1


def test_cloud_quiz_without_local_keys_does_not_award_a_badge(app):
    app.get_to_story();app.pass_story()
    with app.store.connect() as db:
        db.execute("update settings set value='{}' where key='answer_keys'")
    result=app.finish(answers={f'q{i}':'a' for i in range(5)})
    assert result['assessment_type']=='pending_online_scoring'
    assert app.state()['rewards']['earned_count']==0
    assert app.state()['rewards']['rank'] is None


def test_student_rankings_have_aliases_and_no_peer_ids_or_names(app):
    app.adult,_=app.store.login(app.profile['email'],'Fixture password 1!')
    peer=app.store.rpc('save_child_profile',{'p_data':{'nickname':'PRIVATE PEER NAME','grade_level':1}},app.adult)
    rewards=app.state()['rewards']
    assert rewards['class_size']==2
    text=json.dumps(rewards['leaderboard'])
    assert peer not in text and app.child not in text and 'PRIVATE PEER NAME' not in text
    assert all(set(row).issubset({'alias','rank','tied','completed_missions','assigned_missions','completion_percent','placement_review_required','is_you'}) for row in rewards['leaderboard'])
    assert sum(row['is_you'] for row in rewards['leaderboard'])==1
    assert all(row['rank'] is None for row in rewards['leaderboard'])


def test_teacher_progress_and_student_summary_use_the_same_rewards(app):
    complete(app)
    student=app.state()['rewards']
    app.adult,_=app.store.login(app.profile['email'],'Fixture password 1!')
    teacher=app.store.rpc('educator_adventure_progress',{'p_grade':1},app.adult)[0]['rewards']
    for key in ('rank','completed_missions','completion_percent','earned_count','mission_badges'):
        assert teacher[key]==student[key]
    assert 'leaderboard' not in teacher


def test_badge_keeps_original_title_after_teacher_sequence_update(app):
    complete(app)
    original=app.state()['rewards']['mission_badges'][0]
    app.adult,_=app.store.login(app.profile['email'],'Fixture password 1!')
    path=app.store.rpc('educator_adventure',{'p_grade':1},app.adult)
    path['stages'][0]['title']='Updated mission title'
    app.store.rpc('save_adventure',{'p_grade':1,'p_revision':path['revision'],'p_stages':path['stages']},app.adult)
    assert app.state()['rewards']['mission_badges']==[original]


def test_local_badge_verification_can_never_be_reported_as_cloud_verified(app):
    complete(app)
    state=app.store.snapshot()
    for award in state['adventure']['mission_awards'][app.child].values():award['verification']='verified'
    engine=Adventure(state,app.profile,lambda ok,*args:None if ok else (_ for _ in ()).throw(ValueError(args)))
    child=next(child for child in state['children'] if child['id']==app.child)
    result=reward_summary(engine,child)
    assert result['source']=='local_pending_verification'
    assert result['mission_badges'][0]['verification']=='local_pending_verification'


def test_class_filters_and_percentage_ties_use_the_confirmed_policy():
    children=[{'id':key,'adult_id':owner,'grade_level':grade,'active':active,'is_demo':demo}
              for key,owner,grade,active,demo in [('one','owner',1,True,False),('two','owner',1,True,False),('three','owner',1,True,False),('demo','owner',1,True,True),('foreign','other',1,True,False),('grade2','owner',2,True,False),('inactive','owner',1,False,False)]]
    states={'one':['completed','active'],'two':['completed','active'],'three':['not-assigned','completed']}
    class Engine:
        state={'children':children};profile={'id':'owner'}
        def progress(self,child):return {'stages':[{'status':status} for status in states[child['id']]],'placement':None}
    board=class_rewards(Engine(),1,False)
    assert len(board)==3
    by_id={row['child_id']:row for row in board}
    assert by_id['three']['rank']==1 and by_id['three']['completion_percent']==100
    assert by_id['one']['rank']==by_id['two']['rank']==2
    assert by_id['one']['tied'] and by_id['two']['tied']
