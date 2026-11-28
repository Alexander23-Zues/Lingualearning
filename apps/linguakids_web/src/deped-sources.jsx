import { GradeSelect } from './grade-select';
import { uiText, useUiLanguage } from "./i18n";
import { useState } from 'react';
import { Select } from './ui';
import './deped-sources.css';

// Curated source records only. These links do not create student activities or grades.
export const depedSources = [
  {grade:1,subject:'English',id:16950,title:'Jumpstart Series 1 — Module 1',period:'Beginning reading · Grades 1–3',year:2019,summary:'Phonics practice and a guided approach to starting reading.',format:'PDF'},
  {grade:1,subject:'Filipino',id:11677,title:'Basa Pilipinas — Filipino 1, Yunit 2',period:'Teacher’s guide · Unit 2',year:2016,summary:'Teaching support for speaking, vocabulary, reading, and writing.',format:'PDF'},
  {grade:2,subject:'English',id:20828,title:'English 2 — Modules 1–5',period:'Quarter 1',year:2022,summary:'Sound recognition, nouns, articles, and bilingual vocabulary.',format:'ZIP'},
  {grade:2,subject:'Filipino',id:20851,title:'Filipino 2 — Modules 1–7',period:'Quarter 1',year:2022,summary:'Polite speech, following instructions, word roots, and sentences.',format:'ZIP'},
  {grade:3,subject:'English',id:20835,title:'English 3 — Modules 1–12',period:'Quarter 1',year:2022,summary:'Story discussion, nouns, short vowels, and communication practice.',format:'ZIP'},
  {grade:3,subject:'Filipino',id:20849,title:'Filipino 3 — Modules 1–15',period:'Quarter 1',year:2022,summary:'Story comprehension, spelling, dictionary skills, and retelling.',format:'ZIP'},
  {grade:4,subject:'English',id:20951,title:'English 4 — Modules 1–7',period:'Quarter 1',year:2022,summary:'Paragraph structure, text types, word meanings, and vocabulary.',format:'ZIP'},
  {grade:4,subject:'Filipino',id:21177,title:'Filipino 4 — Modules 1–17',period:'Quarter 1',year:2022,summary:'Nouns, pronouns, story elements, poetry, and expressing reactions.',format:'ZIP'},
  {grade:5,subject:'English',id:20852,title:'English 5 — Modules 1–11',period:'Quarter 1',year:2022,summary:'Forms, context clues, sentence construction, and grammar.',format:'ZIP'},
  {grade:5,subject:'Filipino',id:20912,title:'Filipino 5 — Modules 1–8',period:'Quarter 2',year:2022,summary:'Reading for information, poetry, opinions, forms, and advertisements.',format:'ZIP'},
  {grade:6,subject:'English',id:20875,title:'English 6 — Modules 1–3',period:'Quarter 1',year:2022,summary:'Reality and imagination, visual interpretation, and reading fluency.',format:'ZIP'},
  {grade:6,subject:'Filipino',id:20873,title:'Filipino 6 — Modules 1–15',period:'Quarter 1',year:2022,summary:'Comprehension, idioms, inference, research, and writing practice.',format:'ZIP'},
].map(source=>({...source,url:`https://lrmds.deped.gov.ph/detail/${source.id}`}));

export const matatagSources = {
  curriculum:'https://www.deped.gov.ph/matatagcurriculumk147/',
  exemplars:'https://sites.google.com/deped.gov.ph/projectgrasp/revised-k-to-10-curriculum',
};

export function DepEdSources({defaultGrade=1}) {
  useUiLanguage();
  const [grade,setGrade]=useState(String([1,2,3,4,5,6].includes(Number(defaultGrade))?defaultGrade:1));
  const [subject,setSubject]=useState('');
  const sources=depedSources.filter(source=>source.grade===Number(grade)&&(!subject||source.subject===subject));
  return <details className="deped-sources">
    <summary><span><strong>{uiText("DepEd lesson sources")}</strong><small>{uiText("Official links for Grades 1–6 · English & Filipino")}</small></span><span aria-hidden="true">↗</span></summary>
    <div className="deped-sources-content">
      <p>{uiText("Open a source to view its details and available downloads on the DepEd Learning Portal. A portal account may be needed to download files.")}</p>
      <div className="deped-source-filters">
        <GradeSelect label={uiText("DepEd grade")} value={grade} onChange={event=>setGrade(event.target.value)} values={[1,2,3,4,5,6].map(value=>[value,`Grade ${value}`])}/>
        <Select label={uiText("DepEd subject")} value={subject} onChange={event=>setSubject(event.target.value)} values={[["","English & Filipino"],"English","Filipino"]}/>
      </div>
      <div className="deped-source-cards" aria-live="polite">
        {sources.map(source=><article key={source.id}>
          <small>{uiText("GRADE ")}{source.grade} · {source.subject} · {source.format}</small>
          <h3>{source.title}</h3><p>{source.summary}</p>
          <small>{source.period}{uiText(" · Published ")}{source.year}{uiText(" · K–12 archive")}</small>
          <a className="button secondary" href={source.url} target="_blank" rel="noopener noreferrer">{uiText("Open ")}{source.subject}{uiText(" source")}<span className="sr-only">{uiText(" (new tab)")}</span></a>
        </article>)}
      </div>
      <div className="deped-source-current"><strong>{uiText("Looking for MATATAG resources?")}</strong><p>{uiText("The modules above are archived K–12 resources. Check the school’s current curriculum and teaching schedule before using them.")}</p><div>
        <a href={matatagSources.exemplars} target="_blank" rel="noopener noreferrer">{uiText("MATATAG exemplars & worksheets ↗")}</a>
        <a href={matatagSources.curriculum} target="_blank" rel="noopener noreferrer">{uiText("DepEd Phase 1 curriculum guides ↗")}</a>
        <a href={`https://lrmds.deped.gov.ph/grade/${grade}`} target="_blank" rel="noopener noreferrer">{uiText("All Grade ")}{grade}{uiText(" subjects ↗")}</a>
      </div></div>
      <p className="deped-source-note">{uiText("Source links checked 14 November 2026. These external resources are for teacher reference; opening a link does not record a student result.")}</p>
    </div>
  </details>;
}
