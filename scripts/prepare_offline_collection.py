"""Run once online. Build a private, durable laptop collection installation."""
import argparse,json,shutil,sys
from pathlib import Path
import httpx

ROOT=Path(__file__).resolve().parents[1]
def prepare(root,target,credentials,admin_credentials):
    from offline_collection_server import Store
    account=json.loads(credentials.read_text(encoding='utf-8-sig'))
    target.mkdir(parents=True,exist_ok=True);database=target/'data/collection.sqlite3'
    if database.exists() and Store(database).setting('profile'):raise RuntimeError('This laptop collection is already prepared. Open it; do not reset or overwrite its collected data.')
    site='https://linguakids-production.up.railway.app'
    with httpx.Client(timeout=60,http2=True,limits=httpx.Limits(max_keepalive_connections=0)) as client:
        config=client.get(site+'/config.json').raise_for_status().json();auth=config['SUPABASE_URL'];public={'apikey':config['SUPABASE_PUBLISHABLE_KEY']}
        def login(value):
            response=client.post(auth+'/auth/v1/token?grant_type=password',headers=public,json={'email':value['email'],'password':value['password']}).raise_for_status().json()
            value['user_id']=response['user']['id']
            return {**public,'Authorization':'Bearer '+response['access_token']}
        teacher=login(account)
        try:
            profile=client.get(auth+'/rest/v1/profiles',headers=teacher,params={'id':'eq.'+account['user_id'],'select':'id,email,name,role,status,grade_levels,school_name,account_kind,teacher_approved_at,registered_grade'}).raise_for_status().json()[0]
            assert profile['role']=='educator' and profile['status']=='active' and profile['grade_levels'] and set(profile['grade_levels'])<=set(range(1,7))
            state=client.post(auth+'/rest/v1/rpc/workspace_snapshot',headers=teacher,json={}).raise_for_status().json()
            keys={} # Cloud quizzes are collected without local marking keys; score after online transfer.
            # Never include answer keys in browser snapshots or public configuration.
            for material in state['materials']:
                for question in material.get('body',{}).get('questions',[]):question.pop('correct_option_id',None)
            state['educators']=[];state['models']=[];state['active_model']=None
            adventure={'paths':{},'progress':{},'checks':{},'placements':{},'started':{}}
            for grade in profile['grade_levels']:
                path=client.post(auth+'/rest/v1/rpc/educator_adventure',headers=teacher,json={'p_grade':grade}).raise_for_status().json()
                adventure['paths'][str(grade)]=path
                learners=client.post(auth+'/rest/v1/rpc/educator_adventure_progress',headers=teacher,json={'p_grade':grade}).raise_for_status().json()
                for learner in learners:
                    cid=learner['child_id'];adventure['progress'][cid]={step['id']:{'passed':step['status']=='completed','status':step['status'] if step['status'] not in ('locked','not-assigned') else 'current','teacher_approved':step.get('teacher_approved',False)} for stage in learner['adventure']['stages'] for step in stage['steps']}
                    status=client.post(auth+'/rest/v1/rpc/educator_placement',headers=teacher,json={'p_child_id':cid}).raise_for_status().json()
                    adventure['started'][cid]=bool(status['has_started'])
                    if status.get('placement'):adventure['placements'][cid]=status['placement']
            state['adventure']=adventure
            Store(database).initialize(profile,account['password'],state,keys)
        finally:
            try:client.post(auth+'/auth/v1/logout?scope=local',headers=teacher)
            except httpx.HTTPError:pass
    web=root/'apps/linguakids_web/dist';assert (web/'index.html').exists(),'Build the frontend first.'
    shutil.copytree(web,target/'web',dirs_exist_ok=True)
    (target/'web/config.json').write_text(json.dumps({'LOCAL_COLLECTION':True,'capture_audio':True,'COLLECTION_ACCOUNT_ID':profile['id']}),encoding='utf-8')
    shutil.copyfile(Path(__file__).with_name('offline_collection_server.py'),target/'offline_collection_server.py')
    shutil.copyfile(Path(__file__).with_name('adventure_learning.py'),target/'adventure_learning.py')
    shutil.copyfile(Path(__file__).with_name('reading_assessments.py'),target/'reading_assessments.py')
    shutil.copyfile(Path(__file__).with_name('mission_placement.py'),target/'mission_placement.py')
    shutil.copyfile(Path(__file__).with_name('mission_rewards.py'),target/'mission_rewards.py')
    for name in ['Open Offline Collection.ps1','Open Offline Collection.cmd','Export Collection Backup.cmd']:
        source=Path(__file__).with_name(name)
        if source.exists():shutil.copyfile(source,target/name)
    (target/'Private collection login.txt').write_text('LinguaKids offline collection — private\nEmail: '+account['email']+'\nPassword: '+account['password']+'\nLocal address: http://localhost:8787/#/login\nThis copy saves data on this laptop, not Railway.\n',encoding='utf-8')
    (target/'preparation.json').write_text(json.dumps({'prepared':True,'cloud_account_id':profile['id'],'grades':profile['grade_levels'],'materials':len(state['materials']),'quiz_keys':len(keys),'offline_quiz_scoring':'pending_online','private_cloud_answer_keys_cached':False,'database':str(database),'cloud_sync':False},indent=2),encoding='utf-8')
    print('Prepared private offline collection:',target)
    print('Materials:',len(state['materials']),'Verified quiz keys:',len(keys),'Grades:',profile['grade_levels'])
    return target
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=ROOT);parser.add_argument('--target',type=Path,required=True);parser.add_argument('--credentials',type=Path,required=True);parser.add_argument('--admin-credentials',type=Path);a=parser.parse_args();prepare(a.root,a.target,a.credentials,a.admin_credentials)
