"""Restore a full SQLite collection backup into a NEW installation; never overwrite original data."""
import argparse,json,shutil,sqlite3
from contextlib import closing
from pathlib import Path
def restore(backup:Path,prepared:Path,target:Path):
    if target.exists():raise ValueError('Choose a new target folder. Existing collections must never be overwritten.')
    backup=backup.resolve(strict=True);prepared=prepared.resolve(strict=True)
    with closing(sqlite3.connect('file:'+backup.as_posix()+'?mode=ro',uri=True)) as source:
        if source.execute('pragma integrity_check').fetchone()[0]!='ok':raise ValueError('Backup integrity check failed.')
        profile=json.loads(source.execute("select value from settings where key='profile'").fetchone()[0])
        expected=json.loads((prepared/'preparation.json').read_text(encoding='utf-8'))
        if profile['id']!=expected['cloud_account_id']:raise ValueError('Backup belongs to a different prepared educator account.')
        target.mkdir(parents=True);(target/'data').mkdir()
        with closing(sqlite3.connect(target/'data/collection.sqlite3')) as destination:source.backup(destination);destination.execute('delete from sessions');destination.commit()
    for name in ['web','offline_collection_server.py','adventure_learning.py','reading_assessments.py','mission_placement.py','mission_rewards.py','Open Offline Collection.cmd','Open Offline Collection.ps1','Export Collection Backup.cmd','Open Local AI.ps1','private-ai.json','ai-paths.json','preparation.json','Private collection login.txt']:
        p=prepared/name
        if p.is_dir():shutil.copytree(p,target/name)
        elif p.is_file():shutil.copyfile(p,target/name)
    return {'restored':True,'account_id':profile['id'],'target':str(target),'original_untouched':True,'sessions_cleared':True}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--backup',type=Path,required=True);p.add_argument('--prepared',type=Path,required=True);p.add_argument('--target',type=Path,required=True);a=p.parse_args();print(json.dumps(restore(a.backup,a.prepared,a.target),indent=2))
