import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { LessonArt, lessonIllustration } from './lesson-art';
import { MaterialReader } from './reader';

const titles = [
  'Animal friends', 'Colors in the garden', 'Kind words every day',
  'Action words on the playground', 'Where is the little turtle?', 'Complete sentences with Luna',
  'Describe our animal friends', 'One and many in the library', 'First, next, and last',
  'Yesterday, today, and tomorrow', 'Why the garden grew', 'Compare the forest and the reef',
  'Find the main idea', 'Use context clues', 'Read between the lines',
  'Fact, opinion, and reliable evidence', 'Build a claim with reasons', 'Figurative language and careful meaning',
];
const lessons = [
  ...titles.map((title, i) => ({ id:`unit-${i}`, kind:'lesson', title:`Grade ${Math.floor(i/3)+1}: ${title}`, grade_level:Math.floor(i/3)+1, body:{} })),
  ...Array.from({length:6}, (_,i)=>({id:`welcome-${i}`,kind:'lesson',title:'Hello, learning friends!',grade_level:i+1,body:{}})),
];
const drawing = (lesson, pageIndex) => renderToStaticMarkup(<LessonArt material={lesson} pageIndex={pageIndex}/>).replace(/ (aria-label|data-artwork)="[^"]*"/g,'');

it('gives all 24 existing lesson topics visibly different covers, including each grade welcome', () => {
  expect(new Set(lessons.map(lesson=>drawing(lesson))).size).toBe(24);
  expect(lessonIllustration(lessons[0]).symbols).toEqual(['cat','dog','bird','fish']);
  expect(lessonIllustration(lessons[1]).symbols).toContain('tomato');
});
it('keeps each cover stable after a grade filter or search changes card order', () => {
  const before = new Map(lessons.map(lesson=>[lesson.id,drawing(lesson)]));
  for(const lesson of [...lessons].reverse().filter(lesson=>lesson.grade_level===3)) {
    expect(drawing(lesson)).toBe(before.get(lesson.id));
  }
});
it('provides four different page illustrations and honors the selected illustration variation', () => {
  for(const lesson of lessons) expect(new Set([0,1,2,3].map(page=>drawing(lesson,page))).size).toBe(4);
  expect(lessonIllustration(lessons[0],0,1).palette).not.toEqual(lessonIllustration(lessons[0],0,2).palette);
});
it('changes the actual illustration when the educator advances a lesson page', () => {
  HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close = function(){this.removeAttribute('open');};
  const material = {...lessons[0],body:{pages:[{english:'Name our animal friends.',filipino:'Pangalanan ang mga hayop.',scene:0},{english:'A cat has whiskers.',filipino:'May bigote ang pusa.',scene:0}]}};
  render(<MaterialReader material={material} onClose={()=>{}}/>);
  const first = screen.getByRole('img',{name:`${material.title} illustration, page 1`}).getAttribute('data-artwork');
  fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));
  expect(screen.getByRole('img',{name:`${material.title} illustration, page 2`}).getAttribute('data-artwork')).not.toBe(first);
  expect(screen.getByText('A cat has whiskers.')).not.toBe(null);
});
