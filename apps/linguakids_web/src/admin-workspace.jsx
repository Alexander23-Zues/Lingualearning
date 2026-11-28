import { uiText, useUiLanguage } from "./i18n";
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from './context';
import { grades, latestQuizAttempts, progressSummary } from './domain';
import { Icon, Stats } from './ui';

export function AdminPagination({ page, pageCount, total, pageSize, onChange, onPageSizeChange }) {
  useUiLanguage();
  if (pageCount <= 1 && (!onPageSizeChange || total <= 10)) return null;
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter(number => number >= 1 && number <= pageCount)
    .sort((a, b) => a - b);
  return <nav className="admin-pagination" aria-label={uiText("Material pages")}>
    <span role="status">{uiText("Showing ")}{(page-1)*pageSize+1}–{Math.min(page*pageSize,total)}{uiText(" of ")}{total}{uiText(" · Page ")}{page}{uiText(" of ")}{pageCount}</span>
    {pageCount > 1 && <div className="pagination-buttons">
      <button type="button" className="button secondary" disabled={page === 1} onClick={()=>onChange(page-1)}>{uiText("Previous page")}</button>
      <span className="pagination-numbers">{pages.map((number, index) => <span key={number}>
        {number - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <button type="button" className={number === page ? "button" : "button secondary"}
          aria-current={number === page ? "page" : undefined}
          aria-label={uiText("Go to page {0}", [number])} onClick={() => onChange(number)}>{number}</button>
      </span>)}</span>
      <button type="button" className="button secondary" disabled={page === pageCount} onClick={()=>onChange(page+1)}>{uiText("Next page")}</button>
    </div>}
    {pageCount > 1 && <label>{uiText("Jump to page")}<select value={page} onChange={event=>onChange(Number(event.target.value))}>
      {Array.from({ length: pageCount }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
    </select></label>}
    {onPageSizeChange && <label>{uiText("Items per page")}<select value={pageSize} onChange={event=>onPageSizeChange(Number(event.target.value))}>
      {[10, 20, 40].map(size => <option key={size}>{size}</option>)}
    </select></label>}
  </nav>;
}

export function AdminSectionNav({ label, items, selected, parameter }) {
  useUiLanguage();
  const { pathname } = useLocation();
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});
  }, [selected]);
  return <nav ref={ref} className="admin-section-nav" aria-label={label}>
    {items.map(([key, title]) => <Link key={key} to={`${pathname}?${parameter}=${key}`}
      aria-current={selected === key ? 'page' : undefined}>{uiText(title)}</Link>)}
  </nav>;
}

export function AdminOverview() {
  useUiLanguage();
  const { data } = useApp();
  const educators = data.educators.filter(account => account.role === 'educator');
  const submitted = data.materials.filter(material => material.status === 'submitted').length;
  const published = data.materials.filter(material => material.status === 'published').length;
  const suspended = educators.filter(account => account.status === 'suspended').length;
  return <div className="admin-overview">
    <div className="page-intro"><div><h2>{uiText("Administration at a glance")}</h2><p>{uiText("Review teaching content, manage your community, and keep learning on track.")}</p></div></div>
    <Stats items={[
      ['Educators', educators.length, 'users'], ['For content review', submitted, 'check'],
      ['Published materials', published, 'book'], ['Student profiles', data.children.length, 'users'],
    ]}/>
    <section className="panel admin-review-panel">
      <div className="section-heading"><h2>{uiText("Review & access")}</h2></div>
      <Link className="admin-task-row" to="/workspace/resources?status=submitted">
        <span className="admin-task-icon"><Icon name="check"/></span>
        <span><strong>{uiText("Submitted teaching materials")}</strong><small>{submitted ? uiText('Ready for your content review') : uiText('No materials waiting for review')}</small></span>
        <span className="admin-task-count">{submitted}</span><Icon name="arrow" size={18}/>
      </Link>
      <Link className="admin-task-row" to="/workspace/educators">
        <span className="admin-task-icon"><Icon name="users"/></span>
        <span><strong>{uiText("Educator access")}</strong><small>{educators.length}{uiText(" educator accounts · ")}{suspended}{uiText(" suspended")}</small></span><Icon name="arrow" size={18}/>
      </Link>
    </section>
    <section aria-label={uiText("Administration shortcuts")} className="admin-destination-grid">
      {[
        ['reports', 'Reports & gradebook', 'Quiz results and classroom participation.', 'chart'],
        ['ai', 'AI workspace', 'Datasets, training runs, packages, and model review.', 'spark'],
        ['announcements', 'Announcements', 'Manage updates for your teaching community.', 'bell'],
        ['audit', 'Audit logs', 'Review account and system activity.', 'shield'],
      ].map(([page, title, description, icon]) => <Link className="admin-destination" key={page} to={`/workspace/${page}`}>
        <Icon name={icon}/><span><strong>{title}</strong><small>{description}</small></span><Icon name="arrow" size={17}/>
      </Link>)}
    </section>
  </div>;
}

export function AdminParticipation() {
  useUiLanguage();
  const { data } = useApp();
  const summary = progressSummary(data);
  return <>
    <div className="page-intro"><div><h2>{uiText("Classroom participation")}</h2><p>{uiText("See recorded participation and the latest quiz average for each active student.")}</p></div></div>
    <Stats items={[
      ['Student profiles', summary.students, 'users'], ['Participating students', summary.participants, 'spark'],
      ['Completed activities', summary.completed, 'check'],
    ]}/>
    <section className="panel"><div className="section-heading"><h2>{uiText("Participation by grade")}</h2></div>
      <div className="grade-chart">{grades.map(grade => {
        const children=data.children.filter(child=>child.grade_level===grade);
        const ids=new Set(children.map(child=>child.id));
        const count=new Set(data.attempts.filter(attempt=>ids.has(attempt.child_id)).map(attempt=>attempt.child_id)).size;
        return <div key={grade}><span>{uiText("Grade ")}{grade}</span><div className="bar-track"><div style={{width:children.length?`${count/children.length*100}%`:'0%'}}/></div><strong>{count}/{children.length}</strong></div>;
      })}</div><small>{uiText("Students with at least one recorded activity.")}</small>
    </section>
    <section className="panel"><div className="section-heading"><h2>{uiText("Student participation")}</h2></div>
      <div className="table-wrap"><table><thead><tr><th>{uiText("Student")}</th><th>{uiText("Grade")}</th><th>{uiText("Participation")}</th><th>{uiText("Latest quiz average")}</th></tr></thead><tbody>
        {data.children.filter(child=>child.active).map(child=>{
          const attempts=data.attempts.filter(attempt=>attempt.child_id===child.id);
          const latest=latestQuizAttempts(attempts);
          const total=latest.reduce((count,attempt)=>count+attempt.total_count,0);
          return <tr key={child.id}><td>{child.nickname}</td><td>{child.grade_level}</td><td>{attempts.length?uiText('Started learning'):uiText('No recorded activities yet')}</td><td>{total?`${Math.round(latest.reduce((count,attempt)=>count+attempt.correct_count,0)/total*100)}%`:uiText('No quiz yet')}</td></tr>;
        })}
      </tbody></table></div>
    </section>
  </>;
}
