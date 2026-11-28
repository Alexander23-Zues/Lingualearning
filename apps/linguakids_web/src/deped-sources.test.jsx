import { expect,it,vi } from 'vitest';
vi.mock('./context',()=>({useApp:()=>({user:{role:'educator',grade_levels:[1,2,3,4,5,6]}})}));
import { fireEvent,render,screen } from '@testing-library/react';
import { DepEdSources,depedSources } from './deped-sources';

it('lets an adviser find the correct grade and subject and open the original DepEd resource',()=>{
  render(<DepEdSources defaultGrade={5}/>);
  fireEvent.click(screen.getByText('DepEd lesson sources'));
  expect(screen.getByRole('combobox',{name:'DepEd grade'}).value).toBe('5');
  expect(screen.getByRole('link',{name:/Open English source/}).getAttribute('href')).toBe('https://lrmds.deped.gov.ph/detail/20852');
  fireEvent.change(screen.getByRole('combobox',{name:'DepEd grade'}),{target:{value:'6'}});
  fireEvent.change(screen.getByRole('combobox',{name:'DepEd subject'}),{target:{value:'Filipino'}});
  expect(screen.queryByRole('link',{name:/Open English source/})).toBe(null);
  const link=screen.getByRole('link',{name:/Open Filipino source/});
  expect(link.getAttribute('href')).toBe('https://lrmds.deped.gov.ph/detail/20873');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.getByText(/K–12 archive/)).toBeTruthy();
  expect(screen.getByRole('link',{name:/All Grade 6 subjects/}).getAttribute('href')).toBe('https://lrmds.deped.gov.ph/grade/6');
});
it('covers both language subjects in every elementary grade with distinct official source records',()=>{
  for(const grade of [1,2,3,4,5,6])expect(depedSources.filter(source=>source.grade===grade).map(source=>source.subject).sort()).toEqual(['English','Filipino']);
  expect(new Set(depedSources.map(source=>source.url)).size).toBe(12);
  expect(depedSources.every(source=>new URL(source.url).hostname==='lrmds.deped.gov.ph')).toBe(true);
});
