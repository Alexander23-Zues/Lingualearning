import React, {useEffect,useLayoutEffect,useRef,useState} from 'react';
import '@fontsource-variable/nunito';
import {LazyMotion,domAnimation,m,useReducedMotion} from 'framer-motion';
import {Landscape,Mascot} from './Landscape';
import {Modal} from '../ui';
import {ListenButton} from '../listen-button';
import type {AdventureState,AdventureStep,ConnectionStatus,MapStage,StudentProfile} from './types';
import './adventure.css';

interface Props {
  student:StudentProfile;
  adventure:AdventureState;
  stars:number;
  badges?:string[];
  connection:ConnectionStatus;
  reducedMotion?:boolean;
  onStart:(step:AdventureStep)=>void;
  onTeacher:()=>void;
  onChooseStart?:(stageId:string)=>Promise<void>;
  onRefresh?:()=>void;
  busy?:boolean;
  error?:string;
  preview?:boolean;
  previewControls?:React.ReactNode;
}
const kindNames:Record<string,string>={lesson:'Aralin',dictionary:'Mga salita',vocabulary:'Mga salita',game:'Laro',story:'Kuwento at pagbasa',quiz:'Pagsusulit'};
const stepName=(step:AdventureStep)=>step.mode==='word-builder'?'Word Garden':step.mode==='matching'?'Pagpares ng salita':kindNames[step.kind];
const connectionLabels:Record<ConnectionStatus,string>={online:'Online · tala sa paaralan','offline-collection':'Offline-koleksyon aktibo',offline:'Walang koneksyon','awaiting-scoring':'Nai-save · hinihintay ang online score'};

function Glyph({kind}:{kind:string}){
  const paths:Record<string,React.ReactNode>={
    back:<><path d="m10 5-7 7 7 7M3 12h18"/></>,
    book:<><path d="M12 6Q6 2 2 5v15q5-3 10 0 5-3 10 0V5q-4-3-10 1Z" fill="#ffecb4"/><path d="M12 6v14M5 8l4 1M5 12l4 1M15 9l4-1M15 13l4-1"/></>,
    game:<><path d="M7 7h10q3 0 4 5l1 5q0 4-3 2l-3-3H8l-3 3q-3 2-3-2l1-5q1-5 4-5Z" fill="#b6db79"/><path d="M7 10v5M4.5 12.5h5M16 11h.1M19 14h.1"/></>,
    badge:<><path d="M7 3h10v7q0 6-5 6t-5-6ZM7 5H3v3q0 4 4 4M17 5h4v3q0 4-4 4M12 16v5M7 21h10" fill="#ffc944"/><path d="m12 6 1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 8.3l2-.3Z"/></>,
    lock:<><rect x="5" y="10" width="14" height="12" rx="3" fill="#d8ba78"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v3"/></>,
    database:<><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v13q8 6 16 0V5M4 11q8 6 16 0"/><path d="m9 17 2 2 4-4"/></>,
  };
  return <span className="quest-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]||paths.book}</svg></span>;
}
function Stars({stage}:{stage:MapStage}){
  const count=stage.status==='completed'?3:Math.floor(stage.completed/Math.max(stage.total,1)*3);
  return <span className="quest-stage-stars" aria-label={`${count} of 3 journey stars`}>{[0,1,2].map(i=><span key={i} className={i<count?'is-earned':''}>★</span>)}</span>;
}
function Scene({index}:{index:number}){
  return <div className={`quest-card-scene scene-${index%5}`} aria-hidden="true"><img src="/assets/adventure/storybook-stage-atlas.png" alt="" draggable="false" decoding="async" style={{transform:`translateX(-${(index%5)*20}%)`}}/>{index%5===1&&<div className="quest-letter-tiles"><span>W</span><span>D</span></div>}</div>;
}

export function AdventureMap({student,adventure,stars,badges=[],connection,reducedMotion=false,onStart,onTeacher,onChooseStart,onRefresh,busy=false,error='',preview=false,previewControls}:Props){
  const systemReduced=useReducedMotion();
  const calm=reducedMotion||Boolean(systemReduced);
  const rootRef=useRef<HTMLDivElement>(null),viewportRef=useRef<HTMLDivElement>(null);
  const activeIndex=adventure.stages.findIndex(s=>s.status==='active');
  const [focused,setFocused]=useState(Math.max(0,activeIndex));
  const [size,setSize]=useState({width:300,gap:24,height:480,viewportHeight:typeof window==='undefined'?900:window.innerHeight});
  const [stage,setStage]=useState<MapStage|null>(null),[panel,setPanel]=useState<'badges'|'help'|'start'|null>(null);
  const [startError,setStartError]=useState('');
  const [language,setLanguage]=useState<'fil'|'en'>('fil');
  const [message,setMessage]=useState(''),[shake,setShake]=useState(''),[demoListening,setDemoListening]=useState(false);
  const [backgroundReady,setBackgroundReady]=useState(true);
  const touch=useRef<number|null>(null),suppressClick=useRef(false);
  useLayoutEffect(()=>{
    function measure(){
      const root=rootRef.current,viewport=viewportRef.current;
      if(!root||!viewport)return;
      const width=viewport.clientWidth||window.innerWidth;
      const mobile=width<=680;
      const viewportHeight=Math.max(320,window.innerHeight-Math.max(0,root.getBoundingClientRect().top));
      const cardWidth=Math.round(mobile?Math.min(312,width*.76):Math.min(338,Math.max(230,width*.245)));
      const cardHeight=Math.round(mobile?Math.min(476,Math.max(400,window.innerHeight*.53)):Math.min(590,Math.max(252,viewport.clientHeight-52)));
      const next={width:cardWidth,gap:mobile?18:-18,height:cardHeight,viewportHeight};
      setSize(old=>Object.keys(next).every(key=>old[key as keyof typeof old]===next[key as keyof typeof next])?old:next);
    }
    measure();window.addEventListener('resize',measure);
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    if(viewportRef.current)observer?.observe(viewportRef.current);
    if(rootRef.current?.parentElement)observer?.observe(rootRef.current.parentElement);
    return()=>{window.removeEventListener('resize',measure);observer?.disconnect();};
  },[]);
  useEffect(()=>{setFocused(Math.max(0,activeIndex));},[activeIndex]);
  useEffect(()=>{setFocused(i=>Math.min(i,Math.max(0,adventure.stages.length-1)));},[adventure.stages.length]);
  const activeStage=adventure.stages[activeIndex];
  const currentStage=stage&&adventure.stages.find(s=>s.id===stage.id);
  const next=adventure.stages.flatMap(s=>s.steps).find(s=>s.id===adventure.current_step_id);
  const complete=adventure.stages.filter(s=>s.status==='completed').length;
  const assigned=adventure.stages.filter(stage=>stage.status!=='not-assigned');
  const allDone=assigned.length>0&&complete===assigned.length;
  function focus(index:number){setFocused(Math.max(0,Math.min(adventure.stages.length-1,index)));setMessage('');}
  function open(selected:MapStage,index:number){
    if(suppressClick.current){suppressClick.current=false;return;}
    focus(index);
    if(selected.status==='locked'){setMessage('Tapusin muna ang nakaraang aralin! Kaya mo ’yan.');setShake(selected.id);return;}
    setDemoListening(false);setStage(selected);
  }
  function dock(kind:'story'|'game'){
    if(activeStage){focus(activeIndex);setStage(activeStage);}
    setMessage(`Kasama ang ${kind==='story'?'kuwento':'laro'} sa iyong level. Sundan natin ang mga gawain nang sunod-sunod.`);
  }
  const guide=language==='fil'?'Basahin ang aralin, maglaro, basahin at i-record ang kuwento, at makakuha ng 80% sa bawat quiz. Sunod-sunod tayo!':'Read the lessons, play the games, read and record the story, then earn at least 80% on every quiz. One step at a time!';
  const selectedIntro=language==='fil'?`Sa ${currentStage?.title||'level na ito'}, susundan natin ang aralin, mga laro, pagbasa ng kuwento, at quiz. Isa-isang tapusin ang mga gawain.`:`In ${currentStage?.title||'this level'}, follow the lessons, games, story reading and quizzes. Complete one activity at a time.`;
  function previewListen(){setDemoListening(value=>!value);}
  const listenProps={text:guide,language,onPlay:preview?previewListen:undefined};
  return <LazyMotion features={domAnimation} strict><div ref={rootRef} className="lk-adventure quest-storybook-deck" data-reduced-motion={calm} data-preview={preview} data-testid="adventure-map" style={{'--quest-height':`${size.viewportHeight}px`,'--quest-card-height':`${size.height}px`,'--quest-card-width':`${size.width}px`} as React.CSSProperties}>
    <div className="quest-backdrop" aria-hidden="true">{backgroundReady?<img src="/assets/adventure/tropical-storybook-background.png" alt="" fetchPriority="high" onError={()=>setBackgroundReady(false)}/>:<Landscape/>}<span className="quest-sunbeam"/></div>
    <header className="quest-hud">
      <div className="quest-identity">
        <div className="quest-logo"><span className="quest-logo-animal"><Mascot/></span><strong>Lingua<span>Kids</span></strong></div>
        <div className="quest-player"><span className="quest-avatar" aria-hidden="true">{({owl:'🦉',turtle:'🐢',cat:'🐱',butterfly:'🦋',star:'⭐',tarsier:'🐾'} as Record<string,string>)[student.avatar_key||'tarsier']||'🐾'}</span><div><strong>{student.nickname}</strong><small>Grade {student.grade_level} <span>•</span> Level {activeIndex>=0?activeIndex+1:Math.max(1,adventure.stages.length)}</small></div><span className="quest-star-count" aria-label={`${stars} stars`}>★ {stars}</span></div>
      </div>
      <section className="quest-welcome" aria-label="Your next adventure"><h1>{allDone?'Ang galing mo, explorer!':'Handa na sa bagong tuklas?'}</h1><p>{allDone?'Natapos mo na ang lahat ng level. Ipakita sa guro!':'Sundan ang landas. Isang gawain, isang bagong kaalaman.'}</p><div className="quest-level-count"><span aria-hidden="true">★</span> {complete}/{assigned.length} levels complete</div>{adventure.placement?.can_choose_start&&onChooseStart&&<button type="button" className="quest-start-choice" onClick={()=>{setStartError('');setPanel('start');}}>Choose an earlier start</button>}{adventure.placement?.requires_review&&<p role="status">Patulong sa guro para kumpirmahin ang starting mission.</p>}</section>
      <nav className="quest-action-dock" aria-label="Adventure shortcuts">{[['story','book','Mga Kuwento'],['game','game','Laro'],['badges','badge','Mga Medalya']].map(([key,icon,label])=><m.button type="button" key={key} whileTap={calm?undefined:{scale:.96}} className={`quest-dock-button dock-${icon}`} onClick={()=>key==='badges'?setPanel('badges'):dock(key as 'story'|'game')}><Glyph kind={icon}/><span>{label}</span></m.button>)}<m.button type="button" whileTap={calm?undefined:{scale:.96}} className="quest-dock-button quest-teacher" title="Verify the educator account to return to the teacher workspace" onClick={onTeacher}><Glyph kind="back"/><span>Back to teacher</span></m.button></nav>
    </header>

    <main className="quest-deck-main" aria-label="Learning adventure">
      <div ref={viewportRef} className="quest-deck-viewport" role="region" aria-roledescription="carousel" aria-label="Learning levels" tabIndex={0}
        onKeyDown={event=>{if(event.key==='ArrowLeft'){event.preventDefault();focus(focused-1);}else if(event.key==='ArrowRight'){event.preventDefault();focus(focused+1);}}}
        onTouchStart={event=>{touch.current=event.touches[0]?.clientX??null;suppressClick.current=false;}}
        onTouchEnd={event=>{const end=event.changedTouches[0]?.clientX;if(touch.current!==null&&end!==undefined&&Math.abs(end-touch.current)>45){suppressClick.current=true;focus(focused+(end<touch.current?1:-1));}touch.current=null;}}>
        <m.div className="quest-deck-track" initial={false} animate={{x:-focused*(Math.round(size.width*.78)+size.gap)-size.width/2}} transition={{duration:calm?0:.48,ease:[.22,.8,.22,1]}} style={{gap:0}}>
          {adventure.stages.map((selected,index)=>{
            const isFocus=focused===index;
            const quizScore=selected.steps.filter(s=>s.kind==='quiz'&&s.score).at(-1)?.score;
            const pending=selected.status==='active'&&next?.status==='pending_online_scoring';
            return <m.article key={selected.id} className={`quest-stage quest-stage-${index%5} is-${selected.status}${isFocus?' is-focused':''}`} role="group" aria-roledescription="slide" aria-label={`Level ${index+1} of ${adventure.stages.length}`}
              style={{marginRight:size.gap}}
              animate={{width:isFocus?size.width:Math.round(size.width*.78),scale:isFocus?1.03:.93,y:isFocus?0:10,x:!calm&&shake===selected.id?[0,-7,7,-5,5,0]:0}}
              transition={{width:{duration:calm?0:.48,ease:[.22,.8,.22,1]},scale:{duration:calm?0:.35},y:{duration:calm?0:.35},x:{duration:calm?0:.35}}} onAnimationComplete={()=>{if(shake===selected.id)setShake('');}}>
              <div className="quest-card-frame">
                <Scene index={index}/><span className="quest-card-shade"/>
                <button type="button" className="quest-card-open" aria-label={`Level ${index+1}: ${selected.title}${selected.status==='locked'?' · Locked':''}`} onClick={()=>open(selected,index)}>
                  {index===0?<><span className="quest-start-ribbon">Start</span><span className="quest-card-title quest-title-low">{selected.title}</span></>:<span className="quest-card-title">{selected.title}</span>}
                  {selected.status==='locked'&&<span className="quest-card-lock"><Glyph kind="lock"/></span>}
                  <span className="quest-card-level">Level {index+1}</span>
                </button>
                <div className="quest-card-footer">
                  {selected.status==='not-assigned'?<><Stars stage={selected}/><span className="quest-stage-state">Earlier mission · not completed</span></>:selected.status==='completed'?<><Stars stage={selected}/><span className="quest-stage-state is-done">✓ Tapos na!</span></>:selected.status==='locked'?<><Stars stage={selected}/><span className="quest-locked-description">{selected.subtitle}</span><span className="quest-stage-state">Naka-lock</span></>:<>
                    <div className="quest-card-progress"><span>{selected.completed}/{selected.total} gawain</span><span className="quest-score-pill">{quizScore?`${quizScore.correct}/${quizScore.total}`:'80% sa quiz'}</span></div>
                    <progress value={selected.completed} max={Math.max(1,selected.total)} aria-label={`${selected.title} completed activities`}/>
                    <p className="quest-next-label">{next?.status==='needs_review'?'Patulong muna sa guro':next?.status==='pending_online_scoring'?'Hinihintay ang online score':next?`${stepName(next)}: ${next.title}`:'Tuloy sa iyong adventure!'}</p>
                    <m.button type="button" className="quest-primary quest-continue" whileTap={calm?undefined:{scale:.96}} disabled={busy||pending} onClick={()=>open(selected,index)}>Magpatuloy <span aria-hidden="true">›</span></m.button>
                  </>}
                </div>
              </div>
              {index===0&&<div className="quest-floating-friend friend-tarsier"><span>Handa ka na ba?</span><Mascot animal="tarsier"/></div>}
              {selected.status==='active'&&<div className="quest-floating-friend friend-tamaraw"><Mascot animal="tamaraw"/></div>}
            </m.article>;
          })}
        </m.div>
        <button type="button" className="quest-carousel-arrow arrow-previous" aria-label="Previous level card" disabled={focused===0} onClick={()=>focus(focused-1)}>‹</button><button type="button" className="quest-carousel-arrow arrow-next" aria-label="Next level card" disabled={focused>=adventure.stages.length-1} onClick={()=>focus(focused+1)}>›</button>
      </div>
      <div className="quest-map-notice" aria-live="polite">{(error||message)&&<div className={`quest-message ${error?'is-error':''}`} role={error?'alert':'status'}>{error||message}{error&&onRefresh&&<button type="button" onClick={onRefresh} disabled={busy}>Subukan muli</button>}</div>}{!adventure.stages.length&&<div className="quest-message">Wala pang nakahandang adventure. Patulong muna sa guro.</div>}</div>
    </main>

    {panel==='start'&&<Modal title="Choose your starting mission" onClose={()=>setPanel(null)}><p>Your teacher approved a starting mission. You may choose that mission or an earlier one before you begin. Earlier missions do not count as completed.</p>{startError&&<p role="alert">{startError}</p>}<div className="quest-start-options">{adventure.stages.slice(0,(adventure.placement?.maximum_start_index??0)+1).map((item,index)=><button type="button" className="quest-primary" key={item.id} disabled={busy} onClick={async()=>{try{await onChooseStart?.(item.id);setPanel(null);setStage(null);}catch(error){setStartError(error instanceof Error?error.message:'Ask your teacher for help.');}}}>{index+1}. {item.title}{item.id===adventure.placement?.approved_stage_id?' · Teacher approved':''}</button>)}</div></Modal>}
    <footer className="quest-footer">
      <div className={`quest-connection is-${connection}`} role="status"><Glyph kind="database"/><span>{connectionLabels[connection]}</span></div>
      <div className="quest-pagination-area"><nav className="quest-pagination" aria-label="Adventure level pages">{adventure.stages.map((selected,index)=><button type="button" key={selected.id} className={index===focused?'is-current':''} aria-label={`Focus Level ${index+1}: ${selected.title}`} aria-current={focused===index?'step':undefined} onClick={()=>focus(index)}><span>{index+1}</span>{selected.status==='completed'&&<small aria-label="Completed">✓</small>}</button>)}</nav>{preview&&<details className="quest-preview-options"><summary>Design preview · fictional student</summary><div>{previewControls}</div></details>}</div>
      <button type="button" className="quest-guide-button" onClick={()=>{setDemoListening(false);setPanel('help');}}><span className="quest-guide-book"><Glyph kind="book"/><span className="quest-book-flags" aria-hidden="true">EN · FIL</span></span><span>Gabay sa<br/><strong>Pakikipag<wbr/>sapalaran</strong></span></button>
    </footer>

    {currentStage&&<Modal title={currentStage.title} onClose={()=>setStage(null)}><div className="quest-drawer"><span className="quest-kicker">LEVEL {adventure.stages.findIndex(s=>s.id===currentStage.id)+1} · {currentStage.completed}/{currentStage.total} TAPOS</span><div className="quest-language-toggle" role="group" aria-label="Activity preview language"><button type="button" aria-pressed={language==='fil'} onClick={()=>{setLanguage('fil');setDemoListening(false);}}>Filipino</button><button type="button" aria-pressed={language==='en'} onClick={()=>{setLanguage('en');setDemoListening(false);}}>English</button></div><p lang={language}>{selectedIntro}</p><ListenButton text={selectedIntro} language={language} onPlay={preview?previewListen:undefined}>{preview?'Listen preview':'Pakinggan / Listen'}</ListenButton>{preview&&demoListening&&<div className="quest-audio-preview" role="status"><span aria-hidden="true">▂ ▅ ▃ ▇ ▄ ▆ ▂</span>Demo audio preview · Sa connected app, tunay na boses ang babasa.</div>}<p>Bawat quiz ay kailangan ng 80%; puwedeng umulit.</p><ol className="quest-step-list">{currentStage.steps.map((item,index)=><li key={item.id} className={`is-${item.status}`}><span className="quest-step-mark">{item.status==='completed'?'✓':index+1}</span><div><small>{stepName(item)}</small><strong>{item.title}</strong>{item.kind==='quiz'&&item.score&&<small>{item.score.correct} of {item.score.total} · {Math.round(item.score.correct/Math.max(item.score.total,1)*100)}%</small>}{item.status==='needs_review'&&<small>Reading check: maaaring magpatulong sa guro</small>}{item.status==='pending_online_scoring'&&<small>Nai-save · hinihintay ang online score</small>}</div>{item.id===adventure.current_step_id&&item.status!=='pending_online_scoring'&&<button type="button" className="quest-primary" onClick={()=>{setStage(null);onStart(item);}}>Simulan →</button>}{item.status==='locked'&&<span className="quest-step-lock" aria-label="Locked"><Glyph kind="lock"/></span>}</li>)}</ol>{currentStage.status==='completed'&&<p className="quest-success">★ Natapos mo na ang level na ito. Tuloy tayo sa susunod!</p>}</div></Modal>}
    {panel==='badges'&&<Modal title="Mga medalya at natuklasan" onClose={()=>setPanel(null)}><div className="quest-drawer"><p>{stars} stars · {complete} completed levels</p><div className="quest-medals">{badges.length?badges.map(b=><div key={b}><span aria-hidden="true">🏅</span><strong>{b}</strong></div>):<p>Ang unang medalya mo ay naghihintay. Simulan ang unang gawain!</p>}</div><p>Ang bawat quiz attempt ay naitatala para makita ng iyong guro.</p></div></Modal>}
    {panel==='help'&&<Modal title="Gabay sa pakikipagsapalaran" onClose={()=>setPanel(null)}><div className="quest-drawer"><div className="quest-language-toggle" role="group" aria-label="Guide language"><button type="button" aria-pressed={language==='fil'} onClick={()=>setLanguage('fil')}>Filipino</button><button type="button" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button></div><p lang={language}>{guide}</p><ListenButton {...listenProps}>{preview?'Listen preview':'Pakinggan / Listen'}</ListenButton>{preview&&demoListening&&<div className="quest-audio-preview" role="status"><span aria-hidden="true">▂ ▅ ▃ ▇ ▄ ▆ ▂</span>Demo audio preview</div>}<ol><li>Pindutin ang “Magpatuloy”.</li><li>Tapusin ang kasalukuyang gawain bago ang susunod.</li><li>Sa kuwento, makinig muna at mag-record ng sariling pagbasa.</li><li>Kung nahirapan, puwedeng umulit at magpatulong sa guro.</li></ol><p>Ang reading check ay tumutulong sa pagkilala ng salita. Maaari pa ring magkamali ang AI; ang guro ang tutulong kung hindi sigurado.</p></div></Modal>}
  </div></LazyMotion>;
}
