import React,{useState} from 'react';
import type {MissionRewards,MissionBadge} from './types';
import './mission-rewards.css';

export function MedalArt({earned=true}:{earned?:boolean}){
 return <svg viewBox="0 0 72 80" width="60" height="68" aria-hidden="true" className={earned?'mission-medal':'mission-medal is-locked'}><path d="M17 40 9 77l20-9 10 10 5-37Z" fill="#00a896"/><path d="m34 42 5 36 13-11 13 4-12-34Z" fill="#237cbe"/><circle cx="36" cy="30" r="27" fill="#f5c95d" stroke="#a86a12" strokeWidth="3"/><circle cx="36" cy="30" r="21" fill="#ffe396" stroke="#e1a536" strokeWidth="2"/><path d="m36 14 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z" fill="#b67517"/></svg>;
}

export function StudentRewards({rewards,language='fil'}:{rewards?:MissionRewards;language?:'en'|'fil'}){
 const [page,setPage]=useState(1),[view,setView]=useState<'badges'|'ranking'>('badges');
 const en=language==='en',say=(fil:string,english:string)=>en?english:fil;
 if(!rewards)return <p role="status">{say('I-refresh ang mapa para makuha ang tala ng medalya.','Refresh the map to load your mission rewards.')}</p>;
 const local=rewards.source==='local_pending_verification',preview=rewards.source==='preview';
 const rows=rewards.leaderboard||[],pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pages);
 return <div className="student-rewards">
  <p className="reward-source">{preview?say('Halimbawa lamang · walang school records na binabago','Design preview only · no school records changed'):local?say('Sa laptop na ito lamang · kailangan pa ng cloud verification','This laptop only · awaiting cloud verification'):say('Beripikadong tala ng paaralan','Verified school records')}</p>
  {rewards.is_demo&&!preview&&<p>{say('Demo class lamang. Hiwalay sa tunay na klase.','Demo class only. Separate from the real classroom.')}</p>}
  <div className="reward-stats"><div><strong>{rewards.earned_count}</strong><span>{say('medalyang nakuha','mission badges earned')}</span></div><div><strong>{rewards.completed_missions}/{rewards.assigned_missions}</strong><span>{say('kasalukuyang missions','current assigned missions')}</span></div><div><strong>{rewards.rank==null?'—':`#${rewards.rank}${rewards.tied?' =':''}`}</strong><span>{say('iyong class rank','your class rank')}</span></div></div>
  {rewards.placement_review_required?<p>{say('Kailangang kumpirmahin muna ng guro ang bagong mission placement bago ang ranking.','Your teacher needs to reconfirm the changed mission placement before ranking.')}</p>:rewards.rank==null&&<p>{say('Tapusin ang isang mission para makasama sa ranking.','Finish one mission to join the ranking.')}</p>}
  <div className="reward-view-switch" role="group" aria-label={say('Tingnan ang mga tagumpay','Achievement view')}><button type="button" aria-pressed={view==='badges'} onClick={()=>setView('badges')}>{say('Mga medalya','My badges')}</button><button type="button" aria-pressed={view==='ranking'} onClick={()=>setView('ranking')}>{say('Ranking ng klase','Class ranking')}</button></div>
  {view==='badges'&&<><h3>{say('Mga medalya sa mission','Mission badges')}</h3>
  {!rewards.mission_badges.length?<p>{say('Naghihintay ang unang medalya mo. Tapusin ang lahat ng gawain sa isang mission!','Your first badge is waiting. Finish every task in a mission!')}</p>:<div className="mission-badge-grid">{rewards.mission_badges.map(badge=><article className="earned-mission-badge" key={`${badge.grade_level}:${badge.id}`}><MedalArt/><h4>{badge.title}</h4><span>{badge.difficulty}</span><small>{badge.verification==='local_pending_verification'?say('Naka-save · kailangan pang beripikahin','Saved · verification pending'):say('Nakuha na','Earned')}</small></article>)}</div>}
  <h3>{say('Mga tagumpay','Achievements')}</h3><div className="mission-milestones">{rewards.milestones.map(item=><article key={item.id} className={item.earned?'is-earned':''}><MedalArt earned={item.earned}/><div><strong>{item.target} {say(item.target===1?'mission na natapos':'missions na natapos',item.target===1?'mission finished':'missions finished')}</strong><span>{item.earned?say('Nakamit na!','Achieved!'):`${item.progress}/${item.target}`}</span><progress aria-label={`${item.target} ${say('missions na natapos','missions finished')}`} value={item.progress} max={item.target}/></div></article>)}</div>
  </>}
  {view==='ranking'&&<><h3>{say('Ranking ng klase','Class ranking')} · Grade {rewards.grade_level}</h3><p>{say('Completed missions muna, saka porsiyento ng assigned missions. Parehong resulta, parehong rank.','Completed missions first, then the percentage of assigned missions. Equal results share a rank.')}</p>
  {!!rows.length&&<><button type="button" className="quest-primary" onClick={()=>{const index=rows.findIndex(row=>row.is_you);if(index>=0)setPage(Math.floor(index/10)+1);}}>{say('Hanapin ang sarili kong row','Find my row')}</button><ol className="student-rankings" start={(current-1)*10+1}>{rows.slice((current-1)*10,current*10).map(row=><li key={row.alias} className={row.is_you?'is-you':''}><span className="ranking-position">{row.rank==null?'—':`#${row.rank}${row.tied?' =':''}`}</span><div><strong>{row.alias}{row.is_you?` · ${say('Ikaw','You')}`:''}</strong><small>{row.completed_missions}/{row.assigned_missions} missions · {row.completion_percent}%{row.placement_review_required?` · ${say('Teacher review muna','Placement review pending')}`:''}</small></div></li>)}</ol><nav className="reward-pagination" aria-label={say('Mga pahina ng ranking','Ranking pages')}><button type="button" disabled={current<=1} onClick={()=>setPage(current-1)}>{say('Nakaraan','Previous')}</button><span>{current}/{pages}</span><button type="button" disabled={current>=pages} onClick={()=>setPage(current+1)}>{say('Susunod','Next')}</button></nav></>}
  </>}
  <p className="reward-note">{say('Hindi quiz grade ang ranking. Isang medalya lang bawat mission; walang dagdag sa pag-ulit. Nananatili ang earned badges kahit baguhin ng guro ang kasalukuyang missions.','Rankings are not quiz grades. Each mission earns one badge; retries do not add another. Earned badges stay in your history when the teacher updates current missions.')}</p>
 </div>;
}

export function MissionCelebration({badges}:{badges:MissionBadge[]}){
 return <div className="mission-celebration" role="status"><MedalArt/><h3>Mission accomplished!</h3><p>Natapos mo ang lahat ng kailangang gawain. Magaling ang pagsisikap mo!</p>{badges.map(badge=><p key={`${badge.grade_level}:${badge.id}`}><strong>{badge.title}</strong>{badge.verification==='local_pending_verification'&&<small> · Naka-save sa laptop; kailangan pang beripikahin online.</small>}</p>)}</div>;
}
