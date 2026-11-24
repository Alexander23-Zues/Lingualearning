import { uiText, useUiLanguage } from "./i18n";
import { useId } from 'react';

// Illustrations follow the topic, not the current card position or filter order.
const topics = [
  ['animal-friends', 'Animal friends', [['cat','dog','bird','fish'],['cat','dog'],['bird','tree'],['cat','speech','dog']]],
  ['garden-colors', 'Colors in the garden', [['flower','tomato','butterfly','leaf'],['tomato','sun','leaf'],['rabbit','flower'],['flower','butterfly','pencil']]],
  ['kind-words', 'Kind words every day', [['fox','heart','owl'],['rabbit','heart'],['owl','book','fox'],['speech','heart','dog']]],
  ['playground-actions', 'Action words on the playground', [['rabbit','ball','dog'],['rabbit','owl','book'],['pencil','book'],['dog','ball','bird']]],
  ['turtle-position', 'Where is the little turtle', [['turtle','box','tree'],['box','ball','book'],['tree','turtle'],['pencil','book','chair']]],
  ['complete-sentences', 'Complete sentences with Luna', [['owl','pencil','book'],['owl','book'],['speech','question','pencil'],['rabbit','speech','check']]],
  ['describing-animals', 'Describe our animal friends', [['turtle','rabbit','butterfly'],['rabbit','basket'],['dog','heart','fox'],['turtle','leaf','pencil']]],
  ['one-and-many', 'One and many in the library', [['book','owl','books'],['book','books'],['cat','cat','cat'],['owl','books','pencil']]],
  ['story-sequence', 'First, next, and last', [['seed','sprout','flower'],['rabbit','seed'],['watering','sprout','sun'],['flower','book','pencil']]],
  ['past-and-future', 'Yesterday, today, and tomorrow', [['moon','clock','sun'],['clock','book'],['seed','sprout','flower'],['calendar','pencil','sun']]],
  ['garden-reasons', 'Why the garden grew', [['rain','sprout','sun'],['seed','watering'],['flower','sun','butterfly'],['watering','sprout','book']]],
  ['forest-and-reef', 'Compare the forest and the reef', [['tree','turtle','coral','fish'],['tree','bird'],['coral','fish'],['tree','book','coral']]],
  ['main-idea', 'Find the main idea', [['book','tree','leaf'],['books','magnifier'],['tree','leaf','bird'],['book','pencil','check']]],
  ['context-clues', 'Use context clues', [['fox','magnifier','book'],['book','magnifier'],['lantern','footprints','fox'],['pencil','book','check']]],
  ['reading-inference', 'Read between the lines', [['owl','lantern','book'],['magnifier','footprints'],['fox','rain','leaf'],['book','speech','star']]],
  ['fact-and-evidence', 'Fact, opinion, and reliable evidence', [['magnifier','chart','books'],['sun','chart'],['speech','heart','book'],['magnifier','check','chart']]],
  ['claims-and-reasons', 'Build a claim with reasons', [['bridge','books','pencil'],['speech','heart'],['bridge','chart','check'],['pencil','book','speech']]],
  ['figurative-language', 'Figurative language and careful meaning', [['cloud','balloon','book'],['butterfly','flower'],['mountain','sun','cloud'],['speech','star','pencil']]],
];
const greetings = [
  ['fox','balloon','school'], ['owl','pencil','backpack'], ['rabbit','book','tree'],
  ['turtle','clock','school'], ['dog','backpack','map'], ['owl','books','flag'],
];
const palettes = [
  ['#edf6ee','#d6e9d5','#4f8565','#f3c56d'],
  ['#fff3da','#f5dfb5','#b88145','#e89b75'],
  ['#eef1ff','#dce0f6','#7360a8','#b9a4db'],
  ['#e7f5f8','#cae9ef','#4b8d9b','#edba76'],
  ['#fff0eb','#f2d6cf','#b26e75','#e8b183'],
  ['#eff5df','#dce8c2','#7c9253','#e5b562'],
];
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
function hash(value) { let n=0; for (const c of value) n = (Math.imul(n,31)+c.charCodeAt(0)) >>> 0; return n; }

export function lessonIllustration(material, pageIndex, scene) {
  const title = normalize(material.body?.unit_title || material.title).replace(/^grade [1-6] /, '');
  const topic = topics.find(([,name]) => title === normalize(name));
  const grade = Math.max(1,Math.min(6,Number(material.grade_level)||1));
  const greeting = title.includes('hello learning friends');
  const identity = `${material.id || material.title}:${grade}`;
  const seed = hash(identity);
  let key, frames, index;
  if (topic) { key=topic[0]; frames=topic[2]; index=topics.indexOf(topic); }
  else if (greeting) {
    key=`welcome-grade-${grade}`; index=17+grade;
    frames=[greetings[grade-1], [greetings[grade-1][0],'speech','heart'], ['school','book','pencil'], [greetings[grade-1][0],'star','flag']];
  } else {
    key=`lesson-${seed.toString(36)}`; index=seed;
    frames=[['book','pencil','star'], ['books','magnifier'], ['school','speech','book'], ['pencil','check','flower']];
  }
  const page = pageIndex == null ? 0 : Math.max(0,Number(pageIndex)||0);
  const variation = Math.max(0,Math.min(15,Number(scene ?? material.body?.cover_scene)||0));
  return { key, page, variation, mode:(page + Math.floor(variation/6))%4,
    symbols:frames[page%frames.length], index, seed,
    palette:palettes[(index + variation)%palettes.length] };
}

function Animal({ name }) {
  useUiLanguage();
  if (name==='turtle') return <g>
    <ellipse cx="0" cy="23" rx="44" ry="34" fill="#82ac83"/><path d="M-32 39-38 54M4 44 2 57M30 38 36 51" stroke="#568a69" strokeWidth="14" strokeLinecap="round"/>
    <ellipse cx="0" cy="19" rx="35" ry="27" fill="#5b8d70"/><path d="m-17 2 24-6 18 21-13 22-25-2-15-19Z" fill="none" stroke="#a9cba0" strokeWidth="3"/>
    <circle cx="48" cy="11" r="23" fill="#a8c994"/><circle cx="56" cy="5" r="3" fill="#344a42"/><path d="M53 20q8 5 13-2" stroke="#568168" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  </g>;
  if (name==='bird') return <g>
    <ellipse cx="-3" cy="19" rx="29" ry="36" fill="#e9b465"/><path d="M-29 15q-22-23-28-6 2 23 31 27" fill="#b98c61"/><path d="M-4 13q-21 9-11 27 24-2 28-21" fill="#cf9754"/>
    <circle cx="14" cy="-12" r="23" fill="#f0c77d"/><circle cx="22" cy="-16" r="3" fill="#403b42"/><path d="m35-13 17 8-19 6" fill="#cf865d"/><path d="M-9 52v8M8 51v9" stroke="#9c7657" strokeWidth="3"/>
  </g>;
  if (name==='owl') return <g>
    <path d="M-37-38-16-25Q0-36 16-25l21-13v52q-1 44-37 44t-37-44Z" fill="#9c83ba"/>
    <path d="M-31 15q-19 28-8 37l17-23M31 15q19 28 8 37L22 29" fill="#80699c"/>
    <ellipse cx="-15" cy="-2" rx="20" ry="23" fill="#fff4de"/><ellipse cx="15" cy="-2" rx="20" ry="23" fill="#fff4de"/>
    <circle cx="-13" cy="-2" r="5" fill="#463b50"/><circle cx="13" cy="-2" r="5" fill="#463b50"/><path d="m-5 12 5 10 5-10" fill="#e5ae66"/>
    <path d="M-14 55v7M14 55v7" stroke="#b28564" strokeWidth="4" strokeLinecap="round"/>
  </g>;
  const rabbit = name==='rabbit', fox=name==='fox', dog=name==='dog';
  const coat = rabbit?'#e4c6b2':fox?'#d99458':dog?'#caa77f':'#b8a9c9';
  return <g>
    <path d="M25 31q39-20 43 8-11 27-43 10" fill={coat}/><path d="M53 30q24 8 7 20l-13 1" fill="#fff2df"/>
    <ellipse cx="0" cy="31" rx="29" ry="32" fill={coat}/><ellipse cx="2" cy="38" rx="16" ry="21" fill="#fff1e1"/>
    {rabbit ? <><ellipse cx="-18" cy="-52" rx="12" ry="36" fill={coat}/><ellipse cx="13" cy="-54" rx="11" ry="37" fill={coat}/><path d="M-18-76v42M13-79v43" stroke="#d9989e" strokeWidth="7" strokeLinecap="round"/></> : dog ? <><ellipse cx="-30" cy="-16" rx="15" ry="28" fill="#a58167"/><ellipse cx="30" cy="-16" rx="15" ry="28" fill="#a58167"/></> : <><path d="M-31-13-34-55-7-34M7-34 34-55 31-13" fill={coat}/><path d="m-28-30-1-14 12 13M17-31l12-13-1 14" fill="#e9b5a7"/></>}
    <ellipse cy="-11" rx="34" ry="31" fill={coat}/><ellipse cx="-13" cy="2" rx="16" ry="15" fill="#fff1e1"/><ellipse cx="13" cy="2" rx="16" ry="15" fill="#fff1e1"/>
    <circle cx="-13" cy="-15" r="3.3" fill="#453b43"/><circle cx="13" cy="-15" r="3.3" fill="#453b43"/><path d="m-4-3 4 5 4-5" fill="#674a4c"/>
    <path d="M0 2v5m-7 0q7 9 14 0" stroke="#876262" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <ellipse cx="-18" cy="59" rx="13" ry="6" fill={coat}/><ellipse cx="18" cy="59" rx="13" ry="6" fill={coat}/>
  </g>;
}
function Book({ stack=false }) {
  useUiLanguage();
  if(stack) return <g><rect x="-44" y="24" width="88" height="20" rx="5" fill="#88aaa0"/><path d="M-33 34h66" stroke="#e5eee1" strokeWidth="8"/><rect x="-35" y="4" width="88" height="20" rx="5" fill="#a896c4"/><path d="M-24 14h66" stroke="#fff4df" strokeWidth="8"/><rect x="-45" y="-16" width="85" height="20" rx="5" fill="#e0ab75"/><path d="M-34-6h63" stroke="#fff1dc" strokeWidth="8"/></g>;
  return <g><path d="M-53-31q28-12 53 1 25-13 53-1v71q-29-11-53 1-25-12-53-1Z" fill="#a08abc"/><path d="M-47-35q25-8 47 5 23-13 47-5v67q-25-8-47 4-22-12-47-4Z" fill="#fff7e6"/><path d="M0-28v62M-36-18q12-2 25 4M-36-4q12-2 25 4M-36 10q12-2 25 4M11-14q12-6 25-4M11 0q12-6 25-4M11 14q12-6 25-4" stroke="#d2c5cb" strokeWidth="3" strokeLinecap="round"/><path d="M25-30v21l7-5 7 1v-23" fill="#d39e82"/></g>;
}
function Symbol({ name }) {
  useUiLanguage();
  if(['cat','dog','fox','rabbit','owl','turtle','bird'].includes(name)) return <Animal name={name}/>;
  switch(name) {
    case 'book': return <Book/>;
    case 'books': return <Book stack/>;
    case 'fish': return <g><path d="m-31 6-29-25v50l29-19" fill="#d88d75"/><ellipse cy="7" rx="37" ry="26" fill="#e7ac7b"/><path d="M-5-17 12-33 18-15M-2 31l18 15 5-18" fill="#cf8b6a"/><circle cx="22" cy="2" r="3" fill="#4d4447"/><path d="M-12-8q-10 15 1 29" stroke="#f6d1a3" strokeWidth="4" fill="none"/><circle cx="49" cy="-24" r="5" fill="none" stroke="#96c7d1" strokeWidth="3"/></g>;
    case 'tree': return <g><path d="M-11 65-7-18 13-18 17 65" fill="#b58c6b"/><circle cx="-26" cy="-23" r="31" fill="#85ad84"/><circle cx="20" cy="-27" r="36" fill="#a2c398"/><circle cx="-4" cy="-52" r="33" fill="#91b78b"/><path d="M2 31-22 9M4 12l23-22" stroke="#b58c6b" strokeWidth="7" strokeLinecap="round"/></g>;
    case 'flower': return <g><path d="M0 57V-4M0 34q-36 8-31-17 22-2 31 17M0 41q33 1 27-23-22 1-27 23" fill="#88aa78" stroke="#88aa78" strokeWidth="5"/>{[0,60,120,180,240,300].map(a=><ellipse key={a} cy="-27" rx="13" ry="24" transform={`rotate(${a} 0 -7)`} fill="#e6b16a"/>)}<circle cy="-7" r="17" fill="#b78b58"/><circle cx="-4" cy="-12" r="3" fill="#e8c78d"/></g>;
    case 'tomato': return <g><circle cy="16" r="34" fill="#d98d80"/><path d="m0-18-23-15 7 23-18 4 25 5L5-13l22 5-5-17-16 7 3-18" fill="#7e9c72"/><path d="M-18 8q-12 16-1 24" stroke="#f0b3a4" strokeWidth="5" fill="none" strokeLinecap="round"/></g>;
    case 'leaf': return <g><path d="M-30 49Q-65-26 35-52q24 79-65 101" fill="#91b58b"/><path d="M-39 62 20-30M-12 20l-25-5M0 2l22 1M11-15l-16-15" stroke="#5d8c70" strokeWidth="4" fill="none" strokeLinecap="round"/></g>;
    case 'butterfly': return <g><path d="M-4 5q-58-63-57-8 2 22 37 27-41 12-15 33 24 15 37-32M4 5q58-63 57-8-2 22-37 27 41 12 15 33Q15 73 2 25" fill="#c4a2ca"/><path d="M-8 13q-28-23-31-4M8 13q28-23 31-4" stroke="#ead2e5" strokeWidth="9" fill="none" strokeLinecap="round"/><path d="M0 8v33M-1 8-11-5M1 8 11-5" stroke="#796584" strokeWidth="5" strokeLinecap="round"/></g>;
    case 'pencil': return <g transform="rotate(32)"><rect x="-11" y="-49" width="22" height="89" rx="5" fill="#e8ba6d"/><path d="M-11 40 0 65 11 40" fill="#d5b28e"/><path d="m-4 55 4 10 4-10" fill="#5e536c"/><rect x="-11" y="-49" width="22" height="16" rx="4" fill="#d99d9b"/><path d="M-11-29h22M-3-21v56" stroke="#fff0c1" strokeWidth="4"/></g>;
    case 'heart': return <path d="M0 46-42 6C-69-30-15-57 0-22 15-57 69-30 42 6Z" fill="#d994a2"/>;
    case 'speech': return <g><path d="M-44-38h88q12 0 12 12v41q0 12-12 12H3l-26 21 4-21h-25q-12 0-12-12v-41q0-12 12-12" fill="#fff6e7" stroke="#b2a1c7" strokeWidth="4"/>{[-23,0,23].map(x=><circle key={x} cx={x} cy="-3" r="5" fill="#a997be"/>)}</g>;
    case 'ball': return <g><circle cy="12" r="40" fill="#e9b87a"/><path d="M-39 10h78M0-28v80M-29-16q46 22 0 57M29-16q-46 22 0 57" stroke="#b994a4" strokeWidth="4" fill="none"/></g>;
    case 'box': return <g><path d="m-42-15 43 15 43-15v64L0 63l-42-14Z" fill="#d8b48a"/><path d="M0 0v63M-42-15 0-30l44 15L1 0" fill="#edcf9d" stroke="#b79374" strokeWidth="3"/><path d="m-42-15-15-15 42-13L0-30M0-30l18-14 39 15-13 14" fill="#e8c69b"/></g>;
    case 'chair': return <g><rect x="-31" y="-42" width="63" height="48" rx="8" fill="#ab96bc"/><path d="M-27 0v66M29 0v66M-36 27h75" stroke="#8c789c" strokeWidth="8" strokeLinecap="round"/><path d="M-30 28h63" stroke="#c7b3d2" strokeWidth="13" strokeLinecap="round"/></g>;
    case 'basket': return <g><path d="M-40-3h80L30 52h-60Z" fill="#d3ad79"/><path d="M-28-3q0-60 56 0M-17 4l5 41M6 4v41M26 4l-5 41M-34 18h68M-31 34h62" fill="none" stroke="#b58b62" strokeWidth="5"/></g>;
    case 'seed': return <g><ellipse cy="18" rx="48" ry="12" fill="#bfa18a"/><ellipse cy="4" rx="18" ry="28" transform="rotate(25)" fill="#9d785b"/><path d="M-6 22Q1-1 13-14" stroke="#c6a37c" strokeWidth="3" fill="none"/></g>;
    case 'sprout': return <g><path d="M-39 58h78l10-22h-98Z" fill="#c59e81"/><path d="M0 39V-21" stroke="#6e9b77" strokeWidth="5"/><path d="M0 3q-50 1-41-37Q-3-38 0 3M0-9q4-36 41-30 8 36-41 30" fill="#94b482"/></g>;
    case 'watering': return <g><rect x="-40" y="-12" width="56" height="53" rx="10" fill="#84ada7"/><path d="M12 2 46-15l9 13L16 30M-37-4q-29-14-23 16 3 17 22 15" fill="none" stroke="#719a94" strokeWidth="8"/><path d="M50 13v12M63 4v14M73-3v12" stroke="#9fbecb" strokeWidth="4" strokeLinecap="round"/><path d="M-27-11v-12h28v12" stroke="#719a94" strokeWidth="5" fill="none"/></g>;
    case 'sun': return <g><circle r="31" fill="#edc27b"/>{[0,45,90,135,180,225,270,315].map(a=><path key={a} d="M0-42v-11" transform={`rotate(${a})`} stroke="#e2b46b" strokeWidth="5" strokeLinecap="round"/>)}<path d="M-11 6q11 10 22 0" fill="none" stroke="#a98662" strokeWidth="3" strokeLinecap="round"/></g>;
    case 'moon': return <path d="M20-49C-59-48-66 53 12 52q31-4 42-27C-6 38-22-18 20-49Z" fill="#b7b2d1"/>;
    case 'clock': return <g><circle r="49" fill="#a5bdc1"/><circle r="39" fill="#fff4df"/>{[0,90,180,270].map(a=><path key={a} d="M0-29v-5" transform={`rotate(${a})`} stroke="#b4a7b1" strokeWidth="3"/>)}<path d="M0-23V0l21 12" fill="none" stroke="#80708f" strokeWidth="5" strokeLinecap="round"/><circle r="5" fill="#80708f"/></g>;
    case 'calendar': return <g><rect x="-43" y="-41" width="86" height="91" rx="10" fill="#fff6e6" stroke="#d0b5b0" strokeWidth="3"/><path d="M-43-18h86" stroke="#dba2a0" strokeWidth="27"/><path d="M-22-51v20M22-51v20" stroke="#a88e9f" strokeWidth="6" strokeLinecap="round"/>{[-22,0,22].flatMap((x)=>[7,27].map(y=><rect key={`${x}:${y}`} x={x-5} y={y} width="10" height="10" rx="2" fill="#c3b0c9"/>))}</g>;
    case 'rain': return <g><Symbol name="cloud"/>{[-29,0,29].map(x=><path key={x} d={`M${x} 35l-8 17`} stroke="#8ab3c4" strokeWidth="5" strokeLinecap="round"/>)}</g>;
    case 'cloud': return <path d="M-43 21q-25-13-10-35 9-13 25-7 2-38 34-33 29 4 29 30 32-11 39 13 8 27-19 32Z" fill="#fffaf0" stroke="#dddae4" strokeWidth="2"/>;
    case 'coral': return <g><path d="M0 61V-31M0 19q-31 2-31-36M0 37q35-4 35-45M-30 5q-21-5-19-25M35 13q18 0 19-24" fill="none" stroke="#d6a099" strokeWidth="13" strokeLinecap="round"/></g>;
    case 'magnifier': return <g transform="rotate(-32)"><rect x="-9" y="18" width="18" height="54" rx="8" fill="#a894b1"/><circle cy="-16" r="38" fill="#a1bfc5"/><circle cy="-16" r="28" fill="#e5f1ec"/><path d="M-16-25q0-12 15-12" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none"/></g>;
    case 'lantern': return <g><path d="M-15-39q0-30 30 0" fill="none" stroke="#a69074" strokeWidth="5"/><path d="M-29-32h58l-5 75h-48Z" fill="#b8a07d"/><path d="M-21-23h42l-5 57h-32Z" fill="#f3d697"/><path d="M-36 43h72M-34-33h68" stroke="#8e7d6c" strokeWidth="8" strokeLinecap="round"/><path d="M0 28q-17-7 0-34 15 28 0 34" fill="#e7b565"/></g>;
    case 'footprints': return <g fill="#ad9dba">{[-1,1].flatMap((side)=>[0,1].map(n=><g key={`${side}:${n}`} transform={`translate(${side*23} ${n*50-28}) rotate(${side*20})`}><ellipse rx="12" ry="20"/><circle cx="-9" cy="-24" r="4"/><circle cy="-29" r="5"/><circle cx="10" cy="-24" r="4"/></g>))}</g>;
    case 'chart': return <g><rect x="-47" y="-46" width="94" height="103" rx="9" fill="#fff8ec" stroke="#c7b9c8" strokeWidth="3"/><path d="M-29 36V12M-3 36V-5M23 36v-64" stroke="#91b7aa" strokeWidth="14"/><path d="M-30-26h27M-30-15h18" stroke="#d1bfcd" strokeWidth="4" strokeLinecap="round"/></g>;
    case 'bridge': return <g><path d="M-68 44h136M-60 22Q0-35 60 22M-59 5v58M59 5v58M-29 4v40M0-4v48M29 4v40" stroke="#b39576" strokeWidth="8" fill="none" strokeLinecap="round"/><path d="M-60 24Q0-29 60 24" stroke="#dfbf91" strokeWidth="6" fill="none"/></g>;
    case 'mountain': return <g><path d="M-69 56-13-57 54 56" fill="#a6bbac"/><path d="M-13-57-35-12-16-17 0-8 11-17Z" fill="#fff5e6"/><path d="M5 56 46-21 84 56" fill="#8fa69d"/><path d="m46-21-13 25 15-5 10 5Z" fill="#e9eee1"/></g>;
    case 'balloon': return <g><ellipse cy="-20" rx="35" ry="44" fill="#d2a1b7"/><path d="M0 24q-19 17 2 32t-5 31" fill="none" stroke="#ac95ab" strokeWidth="2"/><path d="m0 19-6 11h12" fill="#b786a0"/><path d="M-21-32q1-13 12-17" stroke="#efd1db" strokeWidth="5" fill="none" strokeLinecap="round"/></g>;
    case 'school': return <g><path d="M-55-5h110v65H-55Z" fill="#e8c99c"/><path d="M-66-5 0-49 66-5" fill="#b09ab9"/><rect x="-12" y="24" width="24" height="36" rx="3" fill="#a88b77"/>{[-34,34].map(x=><rect key={x} x={x-10} y="10" width="20" height="24" rx="3" fill="#b6d2d0"/>)}<circle cy="-12" r="11" fill="#fff2dc"/></g>;
    case 'backpack': return <g><path d="M-15-42q0-22 30 0" stroke="#9c828e" strokeWidth="7" fill="none"/><rect x="-36" y="-37" width="72" height="94" rx="21" fill="#b39dbb"/><path d="M-35-9h70" stroke="#d7c3d5" strokeWidth="4"/><rect x="-24" y="13" width="48" height="33" rx="8" fill="#e2bd93"/><path d="M-21 25h42" stroke="#c39e80" strokeWidth="3"/></g>;
    case 'map': return <g><path d="m-60-39 40 12 40-14 40 11v85L20 43-20 56l-40-13Z" fill="#eee2bf"/><path d="M-20-26v81M20-40v82" stroke="#c8bfa2" strokeWidth="2"/><path d="M-46 15q25-53 44-6t42-10" stroke="#b699af" strokeWidth="5" strokeDasharray="7 6" fill="none"/><path d="m30-5 15 13m-15 0 15-13" stroke="#c99184" strokeWidth="5"/></g>;
    case 'flag': return <g><path d="M-25 66V-55" stroke="#b69a7b" strokeWidth="5" strokeLinecap="round"/><path d="M-22-52q35-18 66-1v47q-32-16-66 1" fill="#a5bfb2"/><path d="m4-37 5 10 12 2-9 8 2 12-10-6-11 6 2-12-9-8 12-2Z" fill="#fff1cb"/></g>;
    case 'question': return <g><circle r="46" fill="#efe4f1"/><path d="M-15-17q0-23 24-17 25 10-2 29Q0 0 0 12M0 29v2" stroke="#9f83b2" strokeWidth="7" fill="none" strokeLinecap="round"/></g>;
    case 'check': return <g><circle r="43" fill="#b8d2b5"/><path d="m-22 0 15 17 31-37" stroke="#fff8e7" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>;
    default: return <path d="m0-51 15 32 36 5-26 25 6 36L0 30-31 47l6-36-26-25 36-5Z" fill="#e7bf7a"/>;
  }
}

export function LessonArt({ material, pageIndex, scene }) {
  useUiLanguage();
  const art = lessonIllustration(material, pageIndex, scene);
  const id = `lesson-art-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const [paper, wash, accent] = art.palette;
  const mode = art.mode;
  const layouts = [
    [[100,149,.92],[239,135,1.07],[370,151,.86],[318,79,.52]],
    [[157,139,1.25],[326,143,.97],[244,65,.52],[388,72,.42]],
    [[104,153,.87],[239,139,1.02],[373,153,.87],[338,68,.45]],
    [[126,144,1.03],[265,150,.82],[368,133,.91],[259,68,.45]],
  ];
  return <svg className="lesson-art" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid meet"
    style={{background:paper}} role="img" aria-label={uiText("{0} illustration{1}", [material.title, pageIndex == null ? '' : `, page ${art.page+1}`])}
    data-artwork={`${art.key}:${art.page}:${art.variation}`}>
    <defs>
      <linearGradient id={id} x2="0" y2="1"><stop stopColor={paper}/><stop offset="1" stopColor={wash}/></linearGradient>
    </defs>
    <path d="M0 0h480v270H0Z" fill={`url(#${id})`}/>
    <circle cx={mode%2?110:366} cy="79" r="102" fill="white" opacity=".4"/>
    <path d={mode%2?'M0 228Q140 166 290 225t190-7v52H0Z':'M0 230q116-65 251-3t229-11v54H0Z'} fill={wash}/>
    <path d="M50 217q178 15 379-3" fill="none" stroke={accent} strokeWidth="2" opacity=".14"/>
    {[38,437,64,414].map((x,i)=><circle key={x} cx={x} cy={[86,142,180,55][i]} r={[4,5,3,3][i]} fill={accent} opacity=".22"/>)}
    {mode===2 && <path d="M157 136h28m104 0h27m-134-5 5 5-5 5m129-10 5 5-5 5" fill="none" stroke={accent} strokeWidth="3" opacity=".4" strokeLinecap="round"/>}
    {art.symbols.map((name,i)=>{const [x,y,scale]=layouts[mode][i];return <g key={`${name}:${i}`} transform={`translate(${x} ${y}) scale(${scale})`}><ellipse cy="65" rx="48" ry="7" fill={accent} opacity=".09"/><Symbol name={name}/></g>;})}
    <path d="m407 85 4-9 4 9 9 4-9 4-4 9-4-9-9-4Z" fill={accent} opacity=".32"/>
  </svg>;
}
