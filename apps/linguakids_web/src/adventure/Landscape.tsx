import React, { useId } from 'react';

export function Mascot({ animal = 'tarsier' }: { animal?: 'tarsier' | 'tamaraw' | 'butanding' }) {
  return <svg viewBox="0 0 160 150" aria-hidden="true" className="quest-mascot-art">
    {animal === 'tarsier' ? <g stroke="#684126" strokeWidth="3" strokeLinejoin="round">
      <path d="M45 125Q25 151 17 123Q11 106 30 100" fill="none" strokeWidth="7"/>
      <ellipse cx="82" cy="114" rx="31" ry="29" fill="#bd8351"/><ellipse cx="82" cy="118" rx="18" ry="21" fill="#f5d29a"/>
      <ellipse cx="39" cy="46" rx="22" ry="29" fill="#bd8351"/><ellipse cx="123" cy="46" rx="22" ry="29" fill="#bd8351"/>
      <ellipse cx="39" cy="46" rx="13" ry="19" fill="#edb698"/><ellipse cx="123" cy="46" rx="13" ry="19" fill="#edb698"/>
      <path d="M35 70Q26 18 80 23Q136 15 129 73Q121 108 82 109Q40 107 35 70" fill="#cd995b"/>
      {[59,104].map(x=><g key={x}><ellipse cx={x} cy="65" rx="26" ry="29" fill="#fbe3b3"/><ellipse cx={x} cy="65" rx="16" ry="20" fill="#654d2b"/><ellipse cx={x} cy="65" rx="10" ry="15" fill="#231d20"/><ellipse cx={x-4} cy="58" rx="5" ry="7" fill="white" stroke="none"/></g>)}
      <path d="m76 83 7 6 7-6" fill="#88543d"/><path d="M73 95q10 9 20-1" fill="none"/><path d="M54 116 37 105M109 116l16-16" strokeWidth="10" strokeLinecap="round"/>
      <path d="m60 130 48-12 13 20-48 10Z" fill="#00a896"/><path d="m83 125 8 19" stroke="#f5e3bc"/>
    </g> : animal === 'tamaraw' ? <g stroke="#333b34" strokeWidth="3" strokeLinejoin="round">
      <path d="M38 93 32 132M62 96l-1 35M108 94l8 37M125 84l11 43" fill="none" strokeWidth="12" strokeLinecap="round"/>
      <ellipse cx="94" cy="78" rx="48" ry="31" fill="#697566"/><ellipse cx="56" cy="74" rx="30" ry="36" fill="#586351"/>
      <path d="M34 48Q8 32 20 12q3 19 23 17M72 44q30-15 15-35 4 21-19 23" fill="#e5d8a8"/>
      <ellipse cx="52" cy="92" rx="25" ry="17" fill="#b3af88"/><ellipse cx="40" cy="64" rx="7" ry="10" fill="white"/><ellipse cx="66" cy="64" rx="7" ry="10" fill="white"/>
      <circle cx="42" cy="65" r="4"/><circle cx="65" cy="65" r="4"/><path d="M44 94q8 8 17-1" fill="none"/><path d="m78 43 10 39 17-4-11-38" fill="#eebc4c"/>
    </g> : <g stroke="#23697f" strokeWidth="3" strokeLinejoin="round">
      <path d="M117 68q19-27 35-29l-8 29 9 25q-22-3-36-19M64 46l14-30 18 30M70 86l-8 33 32-29" fill="#4f9fae"/>
      <path d="M9 68q18-44 80-30 37 9 43 33-21 30-72 26Q23 93 9 68" fill="#63b4c5"/>
      <path d="M13 74q46 16 102 1-19 23-54 21Q28 92 13 74" fill="#c2e9df" stroke="none"/>
      {[30,45,62,78,94,108].map((x,i)=><g fill="#d3f0df" stroke="none" key={x}><circle cx={x} cy={55+(i%2)*6} r="3"/><circle cx={x+6} cy="72" r="2.5"/></g>)}
      <circle cx="29" cy="66" r="7" fill="#25455b"/><circle cx="27" cy="63" r="2.5" fill="white" stroke="none"/><path d="M14 77q9 8 18 3" fill="none"/>
    </g>}
  </svg>;
}

export function Landscape() {
  const id = useId().replace(/:/g,'');
  return <svg className="quest-landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#bfe7ed"/><stop offset=".72" stopColor="#fff6cf"/></linearGradient>
      <linearGradient id={`${id}-sea`} x2=".2" y2="1"><stop stopColor="#64d1ca"/><stop offset="1" stopColor="#168fa9"/></linearGradient>
      <linearGradient id={`${id}-land`} x2=".4" y2="1"><stop stopColor="#c4d888"/><stop offset="1" stopColor="#78b572"/></linearGradient>
      <linearGradient id={`${id}-volcano`} x2=".5" y2="1"><stop stopColor="#926a70"/><stop offset="1" stopColor="#6d9186"/></linearGradient>
      <pattern id={`${id}-dots`} width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1" fill="#fff" opacity=".12"/></pattern>
      <g id={`${id}-palm`}><path d="M0 135Q20 57-3 0" fill="none" stroke="#967345" strokeWidth="13"/><path d="M-5 9Q-76-42-99 9q51-6 91 12M-4 8Q-67-70-99-40q54 11 91 55M-4 10Q8-72 48-63 23-33 4 11M0 10Q66-56 94-11 43-9 5 21M-4 14Q70-4 78 51 28 21-2 21" fill="#3e8d5b"/><path d="M1 15q-42-21-65-5M3 17q38-31 64-24" stroke="#69ac64" strokeWidth="3" fill="none"/></g>
      <g id={`${id}-hut`}><path d="M-49 23v-76H50v76" fill="#d7a866" stroke="#8a623c" strokeWidth="4"/><path d="M-62-55 0-101 64-55 49-44-45-44Z" fill="#c8924b" stroke="#8a623c" strokeWidth="4"/><path d="M-40-57 0-91 42-57M-25-52 1-88 28-52M-8-49l9-32" stroke="#f0c078" strokeWidth="3" fill="none"/><rect x="-10" y="-28" width="25" height="51" rx="2" fill="#806440"/><path d="M-48 5H49M-40-43v44M-23-43v44M29-43v44" stroke="#b1814d" strokeWidth="3"/><rect x="-37" y="-25" width="20" height="20" fill="#506f65"/><path d="M-39 22v28M39 22v28M-42 51h85" stroke="#87653f" strokeWidth="5"/></g>
      <g id={`${id}-bush`}><ellipse cy="16" rx="60" ry="18" fill="#3b8e60"/><circle cx="-34" r="25" fill="#5ea563"/><circle cy="-13" r="34" fill="#68ae6b"/><circle cx="35" cy="2" r="27" fill="#4c9b60"/></g>
    </defs>
    <rect width="1600" height="900" fill={`url(#${id}-sky)`}/>
    <circle cx="1380" cy="190" r="88" fill="#ffe6a4" opacity=".6"/><circle cx="1380" cy="190" r="54" fill="#fff3bf"/>
    <g className="quest-clouds" fill="#fffdf0" opacity=".88"><path d="M120 180q-18-25 8-40 18-11 34 1 6-44 45-34 29 6 30 36 38-8 43 19 2 20-30 18Z"/><path d="M1000 126q-14-22 11-32 23-7 34 9 6-39 37-29 21 5 23 27 33-7 39 13 4 14-19 14Z"/><path d="M1282 305q-7-19 11-26 15-6 23 5 2-33 30-26 17 5 18 22 24-6 29 9 4 13-16 15Z"/></g>
    <path d="M0 384 156 253 282 360 434 239 588 400 740 306 901 421 1104 263 1300 406 1461 320 1600 401V600H0Z" fill="#a7c9b0"/>
    <path d="m429 354 100-147 107 164 84 87H337Z" fill={`url(#${id}-volcano)`}/><path d="m505 241 24-34 25 37-21-7-14 11Z" fill="#f1d2b0"/><path d="M531 209q-30-40 2-56 18-10 12-29" fill="none" stroke="#f5eedb" strokeWidth="17" strokeLinecap="round" opacity=".8"/>
    <path d="m938 455 164-212 181 226" fill="#70998c"/><path d="m1063 295 39-52 41 54-25-13-17 11-18-10Z" fill="#e9e8d2"/>
    <path d="M0 525q141-113 302-50t293 19q186-142 350-33t289-9q208-96 366 4v444H0Z" fill={`url(#${id}-sea)`}/>
    <path d="M0 415Q160 350 292 431T550 468Q670 382 815 444T1071 477Q1195 430 1293 484q77 42 38 128-30 64-141 70-156-4-244 70-171 137-423 87Q261 803 0 899Z" fill="#f5df9c"/>
    <path d="M0 398Q158 338 292 416t258 38Q669 367 815 429t256 33q124-49 215 13 67 39 30 108-32 63-145 65-164-6-255 72-172 132-402 79Q253 765 0 860Z" fill={`url(#${id}-land)`}/>
    <path d="M138 627C302 710 353 534 497 607S656 710 784 565 947 584 1068 635 1194 566 1260 661" fill="none" stroke="#b78e56" strokeWidth="45" opacity=".27"/>
    <path d="M138 617C302 700 353 524 497 597S656 700 784 555 947 574 1068 625 1194 556 1260 651" fill="none" stroke="#f4e1ac" strokeWidth="38" strokeLinecap="round"/>
    <path d="M138 617C302 700 353 524 497 597S656 700 784 555 947 574 1068 625 1194 556 1260 651" fill="none" stroke="#fff5d5" strokeWidth="11" strokeDasharray="2 25" strokeLinecap="round" className="quest-path-sparkle"/>
    <use href={`#${id}-hut`} transform="translate(103 481) scale(1.1)"/><use href={`#${id}-hut`} transform="translate(217 455) scale(.64)"/>
    <use href={`#${id}-palm`} transform="translate(38 349) scale(1.1)"/><use href={`#${id}-palm`} transform="translate(354 411) scale(.76)"/>
    <g fill="#46865b">{[410,461,495,349,540].map((x,i)=><g key={x} transform={`translate(${x} ${376+(i%2)*30})`}><path d="M-8 104 0-49 10 104" fill="#876540"/><circle cy="-35" r="38"/><circle cx="-30" cy="-8" r="34"/><circle cx="31" cy="-6" r="37"/><circle cy="17" r="40" fill="#5a9a5e"/></g>)}</g>
    <use href={`#${id}-palm`} transform="translate(1186 525) scale(.74)"/>
    <g transform="translate(933 752) rotate(-5)"><path d="M-65-17h116l14 17v39H-68v-40Z" fill="#dc8354" stroke="#7d5847" strokeWidth="4"/><path d="M-42-17v-25h70l18 25" fill="#ead6a4" stroke="#7d5847" strokeWidth="4"/><path d="M-33-35h23v17h-23m33-17h23v17H0M-53 1H8v18h-61M24-2h22v24H24" fill="#a8dcdf" stroke="#7d5847" strokeWidth="3"/><path d="M-66 27H62" stroke="#f6ce71" strokeWidth="7"/><circle cx="-41" cy="37" r="15" fill="#4f5550"/><circle cx="39" cy="37" r="15" fill="#4f5550"/><circle cx="-41" cy="37" r="7" fill="#c4bd9d"/><circle cx="39" cy="37" r="7" fill="#c4bd9d"/></g>
    <g className="quest-boat" transform="translate(1440 643)"><path d="M-95 10Q0 98 95 8L68 35H-65Z" fill="#c88a56" stroke="#7b6550" strokeWidth="4"/><path d="M0-138V26" stroke="#8d7455" strokeWidth="6"/><path d="M-5-125-69-9H-5Z" fill="#fff5ce"/><path d="M6-110 57-7H6Z" fill="#e6a36c"/><path d="M-73 48q72 23 148 0M-60 28l-20 25M61 28l19 25" stroke="#edca91" strokeWidth="6" fill="none"/></g>
    <g fill="none" stroke="#b4eee3" strokeWidth="4" opacity=".6" className="quest-waves"><path d="M1350 490q22 12 44 0m54 22q22 12 44 0M1250 774q22 12 44 0m72 12q22 12 44 0M1450 832q22 12 44 0M1420 388q22 12 44 0"/></g>
    {[87,340,676,1050,1210].map((x,i)=><use key={x} href={`#${id}-bush`} transform={`translate(${x} ${780+(i%2)*60}) scale(${.6+(i%3)*.25})`}/>)}
    <use href={`#${id}-palm`} transform="translate(156 760) scale(1.3)"/><use href={`#${id}-palm`} transform="translate(1050 821) scale(.86)"/>
    <g fill="#f5d677">{[250,310,650,1020,1150].map((x,i)=><g key={x} transform={`translate(${x} ${735+(i%2)*48})`}><path d="M0 8v20" stroke="#52874b" strokeWidth="3"/><circle cy="0" r="8"/><circle cx="-6" cy="8" r="7"/><circle cx="6" cy="8" r="7"/><circle cy="7" r="4" fill="#b48440"/></g>)}</g>
    <rect width="1600" height="900" fill={`url(#${id}-dots)`}/>
  </svg>;
}
