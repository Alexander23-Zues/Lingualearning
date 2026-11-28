from app.guided_transfer import same_mission_sequence
def path():return {'revision':3,'stages':[{'id':'mission-1','steps':[{'id':'lesson:1:read','material_id':'lesson','material_version':1,'kind':'lesson'}]}]}
def test_requires_the_same_revision_order_material_and_mode():
 assert same_mission_sequence(path(),path())
 changed=path();changed['revision']=4;assert not same_mission_sequence(path(),changed)
 changed=path();changed['stages'][0]['steps'][0]['material_version']=2;assert not same_mission_sequence(path(),changed)
 changed=path();changed['stages'][0]['steps'][0]['mode']='matching';assert not same_mission_sequence(path(),changed)
 assert not same_mission_sequence(None,path())
 assert not same_mission_sequence({'revision':3,'stages':['invalid']},path())
