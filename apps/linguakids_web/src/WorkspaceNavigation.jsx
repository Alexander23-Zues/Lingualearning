import { uiText, useUiLanguage } from "./i18n";
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './ui';

const educatorGroups = [
  ['classroom', 'Classroom', 'users', ['home', 'students', 'journey', 'reports']],
  ['teaching', 'Teaching library', 'book', ['lessons', 'stories', 'activities', 'quizzes', 'resources', 'downloads']],
  ['planning','Planning','calendar',['plans','sessions']],
  ['language', 'Language tools', 'translate', ['dictionary', 'translator']],
  ['progress', 'Settings', 'settings', ['settings']],
];
const administratorGroups = [
  ['overview', 'Overview & reports', 'chart', ['overview', 'reports']],
  ['people', 'People & updates', 'users', ['educators', 'announcements']],
  ['content', 'Teaching library', 'book', ['curriculum', 'resources', 'dictionary']],
  ['workspace', 'System & settings', 'settings', ['ai', 'settings', 'audit']],
];
const adminSearchTerms = {
  resources: 'lessons stories activities games quizzes worksheets vocabulary content review',
  ai: 'datasets translation training jobs runs packages models registry evaluations',
  reports: 'classroom insights participation quiz grades gradebook',
};
const shortLabels = {
  lessons: 'Lessons', plans: 'Teaching plans', activities: 'Activities & games',
  quizzes: 'Quizzes & worksheets', students: 'Students', sessions: 'Classroom sessions',
  reports: 'Gradebook', insights: 'Progress insights', reading: 'Reading practice', journey: 'Missions',
};

export function navigationGroups(items, role) {
  const definitions = role === 'administrator' ? administratorGroups : educatorGroups;
  return definitions.map(([id, label, icon, keys]) => ({
    id, label, icon, items: keys.map(key => items.find(item => item[0] === key)).filter(Boolean),
  })).filter(group => group.items.length);
}

export function WorkspaceNavigation({ items, role, section, onNavigate }) {
  useUiLanguage();
  const groups = navigationGroups(items, role);
  const activeGroup = groups.find(group => group.items.some(([key]) => key === section))?.id;
  const [openGroup, setOpenGroup] = useState(activeGroup);
  const [query, setQuery] = useState('');
  const id = useId();
  useEffect(() => { setOpenGroup(activeGroup); setQuery(''); }, [section, activeGroup]);
  const term = query.trim().toLowerCase();
  const matches = groups.map(group => ({ ...group, items: group.items.filter(([key, label]) =>
    !term || `${label} ${uiText(label)} ${shortLabels[key] || ''} ${uiText(shortLabels[key] || '')} ${group.label} ${uiText(group.label)} ${role === 'administrator' ? adminSearchTerms[key] || '' : ''}`.toLowerCase().includes(term))
  })).filter(group => group.items.length);

  const resultCount = matches.reduce((count, group) => count + group.items.length, 0);
  return <>
    <div className="sidebar-search">
      <Icon name="search" size={18} />
      <input type="search" aria-label={uiText("Find a page")} placeholder={uiText("Find a page…")}
        value={query} onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" aria-label={uiText("Clear page search")} onClick={() => setQuery('')}><Icon name="close" size={16} /></button>}
    </div>
    <nav className="grouped-navigation" aria-label={uiText("Workspace navigation")}>
      {term && <p className="navigation-result" role="status">{resultCount} {resultCount === 1 ? uiText('page') : uiText('pages')}{uiText(" found")}</p>}
      {!matches.length && <div className="navigation-empty"><strong>{uiText("No pages found")}</strong><p>{uiText("Try lessons, translator, students, or settings.")}</p></div>}
      {matches.map(group => {
        const primary=role==='educator'&&group.id==='classroom';
        const direct=role==='educator'&&group.items.length===1;
        const expanded = primary || direct || Boolean(term) || openGroup === group.id;
        const current = group.id === activeGroup;
        const panelId = `${id}-${group.id}`;
        return <section className={`navigation-group ${primary?'navigation-primary':''} ${direct?'navigation-direct':''} ${current ? 'has-current-page' : ''}`} key={group.id}>
          {primary?<p className="navigation-section-label">{uiText('Classroom')}</p>:direct?null:<button type="button" className="navigation-group-toggle" aria-expanded={expanded}
            aria-controls={panelId} onClick={() => { if (term) { setQuery(''); setOpenGroup(group.id); } else setOpenGroup(expanded ? null : group.id); }}>
            <Icon name={group.icon} size={19} /><span>{uiText(group.label)}</span>
            <Icon name="arrow" size={15} className="navigation-chevron" />
          </button>}
          <div id={panelId} className="navigation-links" hidden={!expanded}>
            {group.items.map(([key, label, icon]) => <Link key={key} to={`/workspace/${key}`}
              aria-label={uiText(label)} title={uiText(label)} aria-current={section === key ? 'page' : undefined}
              onClick={onNavigate}>
              <Icon name={icon} size={18} /><span>{uiText(shortLabels[key] || label)}</span>
            </Link>)}
          </div>
        </section>;
      })}
    </nav>
  </>;
}
