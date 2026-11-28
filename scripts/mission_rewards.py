"""Durable local mission badges; cloud independently verifies transferred work."""
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import md5


def class_rewards(engine, grade, demo):
    rows = []
    for child in engine.state['children']:
        if not child.get('active') or child.get('adult_id') != engine.profile['id'] or child['grade_level'] != int(grade) or bool(child.get('is_demo')) != demo:
            continue
        state = engine.progress(child)
        assigned = sum(stage['status'] != 'not-assigned' for stage in state['stages'])
        completed = sum(stage['status'] == 'completed' for stage in state['stages'])
        rows.append({'child_id': child['id'], 'alias': 'Explorer ' + md5((child['id'] + engine.profile['id']).encode()).hexdigest()[:8].upper(),
                     'completed_missions': completed, 'assigned_missions': assigned,
                     'completion_percent': round(100 * completed / assigned, 2) if assigned else 0,
                     'placement_review_required': bool((state.get('placement') or {}).get('requires_review'))})
    eligible = [row for row in rows if row['completed_missions'] > 0 and not row['placement_review_required']]
    metric = lambda row: (row['completed_missions'], row['completion_percent'])
    for row in rows:
        row['rank'] = 1 + sum(metric(other) > metric(row) for other in eligible) if row in eligible else None
        row['tied'] = row['rank'] is not None and sum(metric(other) == metric(row) for other in eligible) > 1
    return sorted(rows, key=lambda row: (row['rank'] or float('inf'), row['alias']))


def sync_awards(engine, child, state=None):
    state = state or engine.progress(child)
    awards = engine.data.setdefault('mission_awards', {}).setdefault(child['id'], {})
    for stage in state['stages']:
        if stage['status'] != 'completed' or not stage['total']:
            continue
        key = f"{child['grade_level']}:{stage['id']}"
        if key not in awards:
            # Source is local even when a network is available. Never export a
            # local award as trusted cloud evidence.
            dates = [attempt['completed_at'] for attempt in engine.state['attempts']
                     if attempt['child_id'] == child['id'] and any(step['id'] == attempt.get('adventure_step_id') for step in stage['steps'])]
            awards[key] = {'id': stage['id'], 'grade_level': child['grade_level'], 'title': stage['title'],
                           'difficulty': stage['difficulty'], 'definition_revision': state['revision'],
                           'evidence_step_ids': [step['id'] for step in stage['steps']],
                           'awarded_at': max(dates) if dates else datetime.now(timezone.utc).isoformat(),
                           'verification': 'local_pending_verification'}


def reward_summary(engine, child, board=None, include_board=False):
    sync_awards(engine, child)
    board = board if board is not None else class_rewards(engine, child['grade_level'], bool(child.get('is_demo')))
    own = next(row for row in board if row['child_id'] == child['id'])
    awards = engine.data.get('mission_awards', {}).get(child['id'], {})
    badges = sorted((deepcopy(award) for award in awards.values() if award['grade_level'] == child['grade_level']), key=lambda award: (award['awarded_at'], award['id']))
    for badge in badges:
        badge['verification'] = 'local_pending_verification'
    result = {key: value for key, value in own.items() if key != 'child_id'}
    result.update(grade_level=child['grade_level'], source='local_pending_verification', class_size=len(board),
                  earned_count=len(badges), mission_badges=badges,
                  milestones=[{'id': f'missions-{target}', 'target': target, 'earned': len(badges) >= target, 'progress': min(len(badges), target)} for target in (1, 3, 5, 10)],
                  ranking_basis='completed_missions_then_assigned_percent', is_demo=bool(child.get('is_demo')))
    if include_board:
        result['leaderboard'] = [{**{key: value for key, value in row.items() if key != 'child_id'}, 'is_you': row['child_id'] == child['id']} for row in board]
    return result
