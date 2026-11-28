import { TeacherAdventure } from './adventure/TeacherAdventure';
import {TeacherRoster} from './adventure/TeacherRoster';
import {ClassBaselines,StudentBaselines} from './reading-baselines';
import {matchesMissionFilter} from './adventure/teacher-analytics';
import {TeacherPlacement} from './adventure/TeacherPlacement';
import {StudentRecordings} from './adventure/StudentRecordings';
import {TeacherProgressProvider,useTeacherProgress} from './adventure/TeacherProgressContext';
import {ProgressLoadNotice,CompactMissionProgress,StudentMissionRecord,QuizDevelopmentTable} from './adventure/TeacherStudentProgress';
import {learnerProgress,mergeRecordedAttempts} from './adventure/teacher-progress';
import {OnlineBackupTransfer} from './backup-transfer';
import { GradeAdmissions } from './grade-admissions';
import { GradeSelect } from './grade-select';
import { DictionaryLookup } from "./dictionary-lookup";
import { uiText, useUiLanguage, setUiLanguage } from "./i18n";
import { LessonArt } from "./lesson-art";
import { DepEdSources } from "./deped-sources";
import { MaterialGuide, MaterialVisibilityHint, materialVisibility } from './material-help';
import { supportsWordGarden } from './word-garden';
import { classroomMaterials, wordGardenCollection } from "./classroom-materials";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useApp } from "./context";
import {
  adminNav,
  adminLegacyDestination,
  avatars,
  canVisit,
  csvText,
  dateText,
  download,
  educatorNav,
  errorText,
  grades,
  gradebookMatrix,
  homeFor,
  latestQuizAttempts,
  materialSections,
  materialKindMatches,
  materialTitle,
  progressSummary,
  recordSections,
  safeWebUrl,
  learningShelf,
  materialAvailableFor,
  materialStatuses,
  quizIdentity,
  recordedQuizAttempts,
  worksheetHtml,
} from "./domain";
import {
  Badge,
  Toolbar,
  MoreActions,
  Brand,
  Button,
  Empty,
  Field,
  Icon,
  Loading,
  Modal,
  Notice,
  Search,
  Select,
  Stats,
  useAction,
} from "./ui";
import { MaterialEditor, RecordEditor, StudentEditor } from "./editors";
import { MaterialReader } from "./reader";
import { AnimalScene, SectionBanner } from "./art";
import { TeacherHome as EducatorHome } from "./adventure/TeacherHome";
import { ListenButton } from "./listen-button";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import { AdminOverview, AdminParticipation, AdminSectionNav, AdminPagination } from "./admin-workspace";
import {
  AIManagement,
  Translator,
  ModelRegistry,
} from "./tools";

export function WorkspaceShell() {
  useUiLanguage();
  const { repository, user, ready, session, authError, locked, child } =
      useApp(),
    { section } = useParams(),
    navigate = useNavigate(),
    [menu, setMenu] = useState(false),
    [compact, setCompact] = useState(() => window.matchMedia?.("(max-width: 1100px)")?.matches ?? false),
    navigationRef = useRef(null),
    menuButtonRef = useRef(null);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 1100px)");
    if (!media) return;
    const update = () => { setCompact(media.matches); if (!media.matches) setMenu(false); };
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    setMenu(false);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [section]);
  useEffect(() => {
    if (!menu || !compact) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => navigationRef.current?.querySelector('button')?.focus());
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); setMenu(false); return; }
      if (event.key !== "Tab") return;
      const controls = [...navigationRef.current.querySelectorAll('button, a[href], input')]
        .filter(element => !element.disabled && element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      menuButtonRef.current?.focus({ preventScroll: true });
    };
  }, [menu, compact]);
  if (!ready) return <Loading />;
  if (locked)
    return <Navigate to={child ? "/student" : "/adult-unlock"} replace />;
  if (!user && session)
    return authError ? (
      <div className="panel">
        <Notice error>{authError}</Notice>
        <Button onClick={() => repository.signOut()}>{uiText("Return to login")}</Button>
      </div>
    ) : (
      <Loading />
    );
  if (!user || user.status !== "active")
    return <Navigate to="/login" replace />;
  const legacyAdminTarget = user.role === "administrator" ? adminLegacyDestination(section) : null;
  if (legacyAdminTarget) return <Navigate to={legacyAdminTarget} replace />;
  if (!canVisit(user, section)) return <Navigate to={homeFor(user)} replace />;
  const items = user.role === "administrator" ? adminNav : educatorNav,
    title = items.find(([key]) => key === section)?.[1];
  return (
    <div className="workspace" data-role={user.role}>
      <aside ref={navigationRef} id="workspace-navigation" className={`sidebar ${menu ? "open" : ""}`}
        role={compact && menu ? "dialog" : undefined} aria-modal={compact && menu ? true : undefined}
        aria-label={compact && menu ? uiText("Workspace menu") : undefined}>
        <div className="sidebar-brand">
          <Link to="/" onClick={() => setMenu(false)}><Brand /></Link>
          <button className="icon-button drawer-close" aria-label={uiText("Close menu")} onClick={() => setMenu(false)}><Icon name="close" /></button>
        </div>
        <span className="sidebar-label workspace-role">
          {user.role === "administrator" ? uiText("Administrator workspace") : uiText("Educator workspace")}
        </span>
        <WorkspaceNavigation items={items} role={user.role} section={section} onNavigate={() => setMenu(false)} />
      </aside>
      {menu && compact && (
        <button
          className="sidebar-scrim"
          aria-label={uiText("Close navigation")}
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace-body" inert={menu && compact ? true : undefined}>
        <header className="workspace-header">
          <div className="header-title">
            <button
              ref={menuButtonRef}
              className="icon-button mobile-menu"
              aria-label={uiText("Open navigation")}
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Icon name="menu" />
            </button>
            <button
              className="icon-button"
              aria-label={uiText("Go back")}
              onClick={() =>
                window.history.length > 1
                  ? navigate(-1)
                  : navigate(homeFor(user))
              }
            >
              <Icon name="back" />
            </button>
            <h1>{uiText(title)}</h1>
          </div>
          <div className="header-actions">
            {user.role === "educator" && (
              <Link
                className="button secondary present-button"
                to="/presentation"
              >
                <Icon name="layers" />{uiText("Present")}</Link>
            )}
            <span className="user-avatar">
              {user.name?.slice(0, 1)?.toUpperCase() || "L"}
            </span>
            <div className="user-label">
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
            <details className="account-menu">
              <summary aria-label={uiText("Account menu")}><span className="mobile-account-letter">{user.name?.slice(0, 1)?.toUpperCase() || "L"}</span><span aria-hidden="true">⌄</span></summary>
              <div className="account-options">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
                {user.role === "educator" && <Link className="mobile-account-action" to="/presentation" onClick={(e) => { e.currentTarget.closest("details").open = false; }}>{uiText("Present to class")}</Link>}
                <button className="mobile-account-action account-signout" onClick={async () => {
                  try { await repository.signOut();
                  navigate(user.role === "administrator" ? "/admin-login" : "/login", { replace: true }); }
                  catch (e) { alert(errorText(e)); }
                }}>{uiText("Sign out of account")}</button>
                <Link
                  to="/workspace/settings"
                  onClick={(e) => {
                    e.currentTarget.closest("details").open = false;
                  }}
                >{uiText("Account & preferences")}</Link>
                {user.role !== "administrator" && (
                <Link
                  to="/admin-login"
                  onClick={(e) => {
                    e.currentTarget.closest("details").open = false;
                  }}
                >{uiText("Administrator access")}</Link>
                )}
                <Link
                  to="/"
                  onClick={(e) => {
                    e.currentTarget.closest("details").open = false;
                  }}
                >{uiText("Landing page")}</Link>
              </div>
            </details>
            <button
              className="icon-button"
              aria-label={uiText("Sign out")}
              onClick={async () => {
                try {
                  await repository.signOut();
                  navigate(user.role === "administrator" ? "/admin-login" : "/login", { replace: true });
                } catch (e) {
                  alert(errorText(e));
                }
              }}
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <main className="workspace-main" data-section={section}>
          {!["home", "overview"].includes(section) && (
            <SectionBanner section={section} />
          )}
          <TeacherProgressProvider><Outlet /></TeacherProgressProvider>
        </main>
        <nav className="mobile-bottom-nav" aria-label={uiText("Quick navigation")}>
          {(user.role === "administrator"
            ? [["overview", "Home", "home"], ["educators", "Educators", "users"], ["resources", "Resources", "book"]]
            : [["home", "Overview", "home"], ["students", "Students", "users"], ["journey", "Missions", "layers"], ["reports", "Gradebook", "chart"]]
          ).map(([key, label, icon]) => (
            <Link key={key} to={`/workspace/${key}`} aria-current={key === section ? "page" : undefined}>
              <Icon name={icon} /><span>{uiText(label)}</span>
            </Link>
          ))}
          <button type="button" aria-label={uiText("More tools")} aria-expanded={menu} aria-controls="workspace-navigation"
            className={!(user.role==='administrator'?["overview","educators","resources"]:["home","students","journey","reports"]).includes(section) ? "active" : ""}
            onClick={() => setMenu(true)}><Icon name="menu" /><span>{uiText("More")}</span></button>
        </nav>
        <div className="workspace-footer">{uiText("A little progress, every day. ")}<span>{uiText("LinguaKids")}</span>
        </div>
      </div>
    </div>
  );
}
export function WorkspacePage() {
  useUiLanguage();
  const { section } = useParams(),
    { data, loading, dataError, refresh, user } = useApp();
  if (!data)
    return dataError ? (
      <>
        <Notice error>{dataError}</Notice>
        <Button onClick={refresh} disabled={loading} icon="refresh">{uiText("Try again")}</Button>
      </>
    ) : (
      <Loading />
    );
  return (
    <>
      {dataError && <div className="workspace-load-error"><Notice error>{dataError}<small>{uiText("Showing your last loaded content. Try again to get the latest updates.")}</small></Notice><Button disabled={loading} onClick={refresh} icon="refresh">{uiText("Try again")}</Button></div>}
      {loading && <div className="refresh-note" role="status">{uiText("Updating…")}</div>}
      {user.role === "administrator" && section === "overview" ? (
        <AdminOverview />
      ) : user.role === "administrator" && section === "resources" ? (
        <AdminMaterialsWorkspace />
      ) : user.role === "administrator" && section === "ai" ? (
        <AdminAIWorkspace />
      ) : user.role === "administrator" && section === "reports" ? (
        <AdminReportsWorkspace />
      ) : user.role === 'educator' && section === 'insights' ? (
        <Navigate to="/workspace/home" replace/>
      ) : section === "journey" ? (
        <TeacherAdventure />
      ) : section === "home" ? (
        <EducatorHome />
      ) : ["overview", "insights"].includes(section) ? (
        <Dashboard insights={section === "insights"} />
      ) : section === "students" ? (
        <Students />
      ) : section === "educators" ? (
        <Educators />
      ) : section === "reports" ? (
        <Reports />
      ) : section === "settings" ? (
        <Settings />
      ) : section === "audit" ? (
        <Audit />
      ) : section === "translator" ? (
        <Translator />
      ) : section === "ai" ? (
        <AIManagement />
      ) : section === "models" ? (
        <ModelRegistry />
      ) : section === "dictionary" ? (
        <Dictionary />
      ) : section === "curriculum" ? (
        <Curriculum />
      ) : recordSections[section] ? (
        <Records key={section} kind={recordSections[section]} />
      ) : (
        <Materials key={section} section={section} />
      )}
    </>
  );
}
function AdminMaterialsWorkspace() {
  useUiLanguage();
  const [params] = useSearchParams();
  const sections = { all: "resources", lesson: "lessons", story: "stories", game: "activities", quiz: "quizzes", dictionary: "dictionary" };
  const selected = Object.hasOwn(sections, params.get("type")) ? params.get("type") : "all";
  return <>
    <AdminSectionNav label={uiText("Material types")} parameter="type" selected={selected} items={[
      ["all", "All materials"], ["lesson", "Lessons"], ["story", "Stories"], ["game", "Activities"], ["quiz", "Quizzes"], ["dictionary", "Vocabulary"],
    ]}/>
    <Materials key={selected} section={sections[selected]}/>
  </>;
}
function AdminAIWorkspace() {
  useUiLanguage();
  const [params] = useSearchParams();
  const views = ["jobs", "datasets", "packages", "models"];
  const selected = views.includes(params.get("tab")) ? params.get("tab") : "jobs";
  return <>
    <AdminSectionNav label={uiText("AI sections")} parameter="tab" selected={selected} items={[
      ["jobs", "Training runs"], ["datasets", "Datasets"], ["packages", "Packages"], ["models", "Models"],
    ]}/>
    {selected === "jobs" ? <AIManagement/> : selected === "models" ? <ModelRegistry/> : <Records key={selected} kind={selected === "datasets" ? "dataset" : "training"}/>}
  </>;
}
function AdminReportsWorkspace() {
  useUiLanguage();
  const [params] = useSearchParams();
  const selected = params.get("view") === "participation" ? "participation" : "gradebook";
  return <>
    <AdminSectionNav label={uiText("Report views")} parameter="view" selected={selected} items={[["gradebook", "Gradebook"], ["participation", "Participation"]]}/>
    {selected === "participation" ? <AdminParticipation/> : <Reports/>}
  </>;
}
export function Dashboard({ insights = false }) {
  useUiLanguage();
  const { data, user } = useApp(),
    summary = progressSummary(data),
    admin = user.role === "administrator";
  return (
    <>
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">
            {insights ? uiText("EVERY STEP COUNTS") : uiText("A GOOD DAY TO GROW")}
          </span>
          <h2>
            {insights
              ? uiText("A window into your classroom")
              : uiText("Hello, {0}!", [user.name?.split(" ")[0] || "educator"])}{" "}
            <span>🌱</span>
          </h2>
          <p>
            {insights
              ? uiText("See participation, celebrate progress, and find the next learning opportunity.")
              : admin
                ? uiText("Your learning community, all in one place.")
                : uiText("A new day. A new discovery. Let’s make it a good one.")}
          </p>
          <Link
            className="button"
            to={admin ? "/workspace/resources" : "/workspace/lessons"}
          >
            {admin ? uiText("Review teaching resources") : uiText("Explore your lessons")}
            <Icon name="arrow" />
          </Link>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <img src="/assets/linguakids-character-journey.png" alt={uiText("")} />
        </div>
      </section>
      <Stats
        items={
          admin
            ? [
                [
                  "Educators",
                  data.educators.filter((e) => e.role === "educator").length,
                  "users",
                ],
                ["Learning materials", data.materials.length, "book"],
                ["Student profiles", summary.students, "users"],
                ["Completed activities", summary.completed, "check"],
              ]
            : [
                ["My students", summary.students, "users"],
                ["Learning together", summary.participants, "spark"],
                ["Activities completed", summary.completed, "check"],
                [
                  "Latest quiz average",
                  summary.score === null ? "—" : `${summary.score}%`,
                  "chart",
                ],
              ]
        }
      />
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{uiText("SMALL WINS, BIG SMILES")}</span>
              <h2>{uiText("Progress by grade")}</h2>
            </div>
            <Icon name="chart" />
          </div>
          <div className="grade-chart">
            {grades.map((g) => {
              const children = data.children.filter((c) => c.grade_level === g),
                ids = new Set(children.map((c) => c.id)),
                participants = new Set(
                  data.attempts
                    .filter((a) => ids.has(a.child_id))
                    .map((a) => a.child_id),
                ).size;
              return (
                <div key={g}>
                  <span>{uiText("Grade ")}{g}</span>
                  <div className="bar-track">
                    <div
                      style={{
                        width: children.length
                          ? `${(participants / children.length) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                  <strong>
                    {participants}/{children.length}
                  </strong>
                </div>
              );
            })}
          </div>
          <small>{uiText("Students with at least one activity · not a measure of mastery.")}</small>
        </section>
        <section className="panel">
          <span className="eyebrow">{uiText("WHAT'S NEXT?")}</span>
          <h2>{uiText("Make room for discovery")}</h2>
          <div className="quick-links">
            {(admin
              ? [
                  ["resources", "Review resources", "book"],
                  ["ai", "Check training jobs", "spark"],
                  ["educators", "Manage educators", "users"],
                ]
              : [
                  ["students", "Welcome a student", "users"],
                  ["plans", "Build a teaching plan", "calendar"],
                  ["reports", "View the gradebook", "chart"],
                ]
            ).map(([key, label, icon]) => (
              <Link key={key} to={`/workspace/${key}`}>
                <span>
                  <Icon name={icon} />
                  {label}
                </span>
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
        </section>
      </div>
      {insights && (
        <section className="panel">
          <h2>{uiText("Students to check in with")}</h2>
          <p>{uiText("Based on recorded participation and latest quiz scores. This is a teaching prompt, not an ability label.")}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{uiText("Student")}</th>
                  <th>{uiText("Grade")}</th>
                  <th>{uiText("Participation")}</th>
                  <th>{uiText("Latest quiz average")}</th>
                </tr>
              </thead>
              <tbody>
                {data.children
                  .filter((c) => c.active)
                  .map((c) => {
                    const latest = latestQuizAttempts(
                        data.attempts.filter((a) => a.child_id === c.id),
                      ),
                      total = latest.reduce((n, a) => n + a.total_count, 0);
                    return (
                      <tr key={c.id}>
                        <td>{c.nickname}</td>
                        <td>{c.grade_level}</td>
                        <td>
                          {data.attempts.some((a) => a.child_id === c.id)
                            ? uiText("Started learning")
                            : uiText("No recorded activities yet")}
                        </td>
                        <td>
                          {total
                            ? `${Math.round((latest.reduce((n, a) => n + a.correct_count, 0) / total) * 100)}%`
                            : uiText("No quiz yet")}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>{uiText("Classroom notes")}</h2>
          {admin && (
            <Link to="/workspace/announcements">{uiText("Manage announcements →")}</Link>
          )}
        </div>
        {data.records.filter(
          (r) => r.kind === "announcement" && r.status === "published",
        ).length ? (
          data.records
            .filter(
              (r) => r.kind === "announcement" && r.status === "published",
            )
            .map((r) => (
              <article className="announcement" key={r.id}>
                <h3>{r.title}</h3>
                <p>{r.data.details}</p>
                <small>{dateText(r.updated_at)}</small>
              </article>
            ))
        ) : (
          <p>{uiText("No new announcements. A fresh day of learning awaits.")}</p>
        )}
      </section>
    </>
  );
}
function materialLanguages(material) {
  const body = material.body || {};
  const text = [body, ...[body.pages, body.entries, body.pairs].filter(Array.isArray).flat()];
  return [
    (material.curriculum?.learning_area === "English" || text.some(part => part?.english || part?.en)) && "English",
    (material.curriculum?.learning_area === "Filipino" || text.some(part => part?.filipino || part?.fil)) && "Filipino",
  ].filter(Boolean);
}

export function Materials({ section = "resources" }) {
  useUiLanguage();
  const [readerMode, setReaderMode] = useState('matching');
  const { repository, data, user, refresh, openStudent } = useApp(),
    navigate = useNavigate(),
    action = useAction();
  const [materialParams, setMaterialParams] = useSearchParams();
  const focusedMaterial = data.materials.find(material => material.id === materialParams.get("focus"));
  const lessonLibrary = user.role === "educator" && section === "lessons";
  const learningMaterials = lessonLibrary && materialParams.get("view") === "materials";
  const materialTypes = ["lesson", "story", "game", "quiz", "dictionary", "vocabulary"];
  const [materialNotice, setMaterialNotice] = useState(focusedMaterial ? uiText('Saved "{0}". Clear the search to browse other materials.', [focusedMaterial.title]) : "");
  const [guide, setGuide] = useState(false), [reviewDecision, setReviewDecision] = useState('');
  const [query, setQuery] = useState(focusedMaterial?.title || ""),
    [grade, setGrade] = useState(() => focusedMaterial ? String(focusedMaterial.grade_level) : user.role === "educator" &&
      ["lessons", "activities", "resources"].includes(section) &&
      user.grade_levels?.length === 1 ? String(user.grade_levels[0]) : ""),
    [status, setStatus] = useState(() => user.role === "administrator" && materialStatuses.includes(materialParams.get("status")) ? materialParams.get("status") : ""),
    [favorites, setFavorites] = useState(false),
    [editor, setEditor] = useState(null),
    [reader, setReader] = useState(null),
    [review, setReview] = useState(null);
  const [area, setArea] = useState(""),
    [language, setLanguage] = useState(""),
    [otherActivityType, setOtherActivityType] = useState(""),
    [quarter, setQuarter] = useState(""),
    [version, setVersion] = useState(""),
    [savedNotice, setSavedNotice] = useState("");
  const admin = user.role === "administrator",
    kind = learningMaterials ? undefined : materialSections[section];
  const activityType = lessonLibrary
    ? (learningMaterials && materialTypes.includes(materialParams.get("type")) ? materialParams.get("type") : "")
    : otherActivityType;
  function setActivityType(value) {
    if (!lessonLibrary) {setOtherActivityType(value);return;}
    setMaterialParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set("type", value);else next.delete("type");
      return next;
    });
  }
  function newMaterial() {setEditor({kind:kind || activityType || "lesson"});}
  async function materialSaved(savedMaterial) {
    await refresh();

    // A new material must remain discoverable even if the previous filters excluded it.
    setQuery(savedMaterial.title);setGrade(String(savedMaterial.grade_level));
    changeStatus("");setFavorites(false);setArea("");setLanguage("");setQuarter("");setVersion("");
    setMaterialPage(1);
    if (admin) {
      const selectedType = materialParams.get("type");
      const target = !selectedType || selectedType === "all" ? "all" : savedMaterial.kind === "vocabulary" ? "dictionary" : savedMaterial.kind;
      navigate(`/workspace/resources?type=${target}&focus=${encodeURIComponent(savedMaterial.id)}`, {replace:true});
    } else if (!lessonLibrary && kind && !materialKindMatches(savedMaterial,kind)) {
      navigate(`/workspace/lessons?view=materials&type=${savedMaterial.kind}&focus=${encodeURIComponent(savedMaterial.id)}`, {replace:true});
    } else setMaterialParams(previous => {
      const next = new URLSearchParams(previous);
      if (lessonLibrary && savedMaterial.kind !== "lesson") next.set("view", "materials");
      if (next.get("type")) next.set("type", savedMaterial.kind);
      return next;
    }, {replace:true});
    setMaterialNotice(uiText('Saved "{0}". Clear the search to browse other materials.', [savedMaterial.title]));
  }
  const urlStatus = admin && materialStatuses.includes(materialParams.get('status')) ? materialParams.get('status') : '';
  useEffect(() => {if(admin)setStatus(urlStatus);}, [admin, urlStatus]);
  function changeStatus(value) {
    setStatus(value);
    if(admin)setMaterialParams(previous => {
      const next=new URLSearchParams(previous);
      if(value)next.set('status',value);else next.delete('status');
      return next;
    }, {replace:true});
  }
  function changeMaterialQuery(value) {
    setQuery(value);
    if(materialParams.has("focus"))setMaterialParams(previous=>{const next=new URLSearchParams(previous);next.delete("focus");return next;},{replace:true});
  }
  function clearFilters() {
    setQuery('');setGrade('');setStatus('');setFavorites(false);setArea('');setQuarter('');setVersion('');setLanguage('');setOtherActivityType('');
    setMaterialParams(previous=>{
      const next=new URLSearchParams(previous);next.delete("focus");
      if(admin)next.delete("status");if(lessonLibrary)next.delete("type");return next;
    },{replace:true});
  }
  const activeFilters = [
    query.trim() && {key:'search',label:`Search: ${query.trim()}`,clear:()=>changeMaterialQuery('')},
    grade && {key:'grade',label:`Grade ${grade}`,clear:()=>setGrade('')},
    status && {key:'status',label:materialVisibility[status]?.label || status,clear:()=>changeStatus('')},
    favorites && {key:'favorites',label:'Favorites',clear:()=>setFavorites(false)},
    area && {key:'area',label:area,clear:()=>setArea('')},
    language && {key:'language',label:language,clear:()=>setLanguage('')},
    activityType && {key:'activity',label:activityType,clear:()=>setActivityType('')},
    quarter && {key:'quarter',label:`Quarter ${quarter}`,clear:()=>setQuarter('')},
    version && {key:'version',label:`Version ${version}`,clear:()=>setVersion('')},
  ].filter(Boolean);
  const storedKey = `linguakids.react.downloads.${user.id}`;
  const [saved, setSaved] = useState(() => {
    try {
      const entries = JSON.parse(localStorage.getItem(storedKey) || "[]");
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  });
  const [materialPage, setMaterialPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const suggestedGrade = Number(grade) || (section === "downloads" ? user.grade_levels?.[0] : undefined);
  const starterResources = !admin && ["resources", "downloads"].includes(section)
    ? classroomMaterials(learningShelf(data.materials), suggestedGrade)
    : [];
  const starterIds = new Set(starterResources.map((material) => material.id));
  const suggestedDownloads = section === "downloads"
    ? starterResources.filter((material) => !saved.some((entry) => entry.id === material.id)).slice(0, 4)
    : [];
  useEffect(() => setMaterialPage(1), [query, grade, status, favorites, area, language, activityType, quarter, version, section, pageSize, learningMaterials]);
  let rows = section === "downloads" ? saved : learningShelf(data.materials);
  rows = rows.filter(
    (m) =>
      materialKindMatches(m, kind) &&
      (!activityType || m.kind === activityType) &&
      (!language || materialLanguages(m).includes(language)) &&
      (!grade || m.grade_level === Number(grade)) &&
      (!status || m.status === status) &&
      (!favorites || data.favorites?.includes(m.id)) &&
      (!area || m.curriculum?.learning_area === area) &&
      (!quarter || Number(m.curriculum?.quarter) === Number(quarter)) &&
      (!version || m.curriculum?.version === version) &&
      (section !== "resources" ||
        admin ||
        m.owner_id === user.id ||
        data.favorites?.includes(m.id) ||
        starterIds.has(m.id)) &&
      `${m.title} ${m.summary} ${m.curriculum?.learning_area || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  if (kind === "quiz")
    rows.sort(
      (a, b) =>
        a.grade_level - b.grade_level ||
        (a.quiz_number || 0) - (b.quiz_number || 0),
    );
  if (kind === "game") {
    rows.sort((a, b) =>
      Number(b.body?.collection === wordGardenCollection) - Number(a.body?.collection === wordGardenCollection) ||
      (a.body?.garden_set || 0) - (b.body?.garden_set || 0),
    );
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(materialPage, pageCount);
  const visibleRows = rows.slice((currentPage-1)*pageSize, currentPage*pageSize);
  const gardenMaterial = kind === 'game' ? rows.find(m => supportsWordGarden(m.body?.pairs)) : null;
  const gardenSets = gardenMaterial?.body?.collection === wordGardenCollection
    ? rows.filter((material) => material.grade_level === gardenMaterial.grade_level &&
        material.body?.collection === wordGardenCollection && supportsWordGarden(material.body.pairs))
    : [];
  const gardenWordCount = gardenSets.reduce((total, material) => total + material.body.pairs.length, 0);
  const [gardenSetId, setGardenSetId] = useState("");
  const activeGardenSet = gardenSets.find((material) => material.id === gardenSetId) || gardenMaterial;
  function changeMaterialPage(page) {
    setMaterialPage(page);
    document.querySelector('.material-grid')?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  }
  async function edit(m) {
    await action.run(async () => {
      const editable = await repository.rpc("learning_material_editor", {
        p_id: m.id,
      });
      setEditor(editable);
    });
  }
  async function favorite(m) {
    await action.run(async () => {
      await repository.rpc("set_material_favorite", {
        p_id: m.id,
        p_saved: !data.favorites?.includes(m.id),
      });
      await refresh();
    });
  }
  function saveDownloads(materials) {
    const copies = materials.map((material) => {
      const clean = structuredClone(material);
      clean.body?.questions?.forEach((question) => delete question.correct_option_id);
      return clean;
    });
    const ids = new Set(copies.map((material) => material.id));
    const next = [...saved.filter((material) => !ids.has(material.id)), ...copies];
    try {
      localStorage.setItem(storedKey, JSON.stringify(next));
      setSaved(next);
      setSavedNotice(copies.length === 1
        ? `${copies[0].title} saved to Downloads.`
        : `${copies.length} materials saved to Downloads.`);
    } catch {
      action.setError("This device could not save the materials. Free up browser storage and try again.");
    }
  }
  function previewMaterial(material) {
    setReaderMode(material.body?.collection === wordGardenCollection ? "word-builder" : "matching");
    setReader(material);
  }
  function downloadMaterial(material) {
    if (material.kind === "quiz") {
      download(`${material.title}-worksheet.html`, worksheetHtml(material), "text/html;charset=utf-8");
      return;
    }
    const pages = material.body?.pages?.length ? material.body.pages : [material.body || {}];
    const text = material.body?.pairs?.length
      ? material.body.pairs.map(({ en, fil }) => `${en} — ${fil}`).join("\n")
      : pages.map(({ english, filipino }) => [english, filipino].filter(Boolean).join("\n")).join("\n\n");
    const source = material.body?.source?.url;
    download(`${material.title}.txt`, [material.title, `Grade ${material.grade_level}`, text, source].filter(Boolean).join("\n\n"), "text/plain;charset=utf-8");
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("IDEAS THAT INSPIRE")}</span>
          <h2>
            {admin ? ({resources: "All teaching materials", lessons: "Lessons", stories: "Stories", activities: "Activities & games", quizzes: "Quizzes & worksheets", dictionary: "Vocabulary materials"}[section] || uiText("Teaching materials")) : section === "downloads"
              ? uiText("Your saved learning shelf")
              : lessonLibrary
                ? uiText("Lessons & learning materials")
              : section === "resources"
                ? uiText("Your classroom resources")
                : uiText("Discover {0}", [kind === "game" ? "activities & games" : kind === "quiz" ? "quizzes & worksheets" : kind === "story" ? "stories" : kind + "s"])}
          </h2>
          <p>
            {admin ? uiText("Create, review, and publish teaching content in one place.") : section === "downloads"
              ? uiText("Keep lesson copies on this device.")
              : lessonLibrary ? uiText("Find lessons, stories, games, quizzes, and vocabulary for your grade in one place.")
              : section === "resources" ? uiText("Your materials, favorites, and suggested resources for your grade.")
              : uiText("Explore English–Filipino materials for your classroom.")}
          </p>
        </div>
        <div className="material-page-actions">
        {section === "downloads" && <a className="button secondary" href="/offline.html">{uiText("Open Offline Library")}</a>}
        {section !== "downloads" && (
          <Button
            icon="plus"
            onClick={newMaterial}
          >{uiText("Create material")}</Button>
        )}
        <Button variant="ghost" icon="book" onClick={()=>setGuide(true)}>{uiText("How it works")}</Button>
        </div>
      </div>
      {lessonLibrary && <AdminSectionNav label={uiText("Lesson library views")} parameter="view"
        selected={learningMaterials ? "materials" : "lessons"} items={[["lessons", "Lessons"], ["materials", "Learning materials"]]}/>}
      {materialNotice && <Notice>{materialNotice}</Notice>}
      {section === "lessons" && <DepEdSources defaultGrade={user.grade_levels?.[0] || 1}/>}
      {suggestedDownloads.length > 0 && (
        <section className="panel download-suggestions" aria-label={uiText("Suggested downloads")}>
          <div className="section-heading">
            <h3>{uiText("Suggested downloads")}</h3>
            <Button variant="secondary" icon="download" onClick={() => saveDownloads(suggestedDownloads)}>{uiText("Save suggested materials")}</Button>
          </div>
          <ul>{suggestedDownloads.map((material) => (
            <li key={material.id}>
              <button type="button" className="text-button" onClick={() => previewMaterial(material)}>{materialTitle(material)}</button>
              <Button variant="ghost" icon="download" onClick={() => saveDownloads([material])}>{uiText("Save copy")}</Button>
            </li>
          ))}</ul>
        </section>
      )}
      <Toolbar activeCount={[grade, status, favorites, area, language, activityType, quarter, version].filter(Boolean).length}>
        <Search value={query} onChange={changeMaterialQuery} />
        <Select label="Language filter" value={language} onChange={event=>setLanguage(event.target.value)}
          values={[["", "All languages"], ["English", "English"], ["Filipino", "Filipino"]]} />
        {!kind && <Select label="Activity type" value={activityType} onChange={event=>setActivityType(event.target.value)}
          values={[["", "All types"], ["lesson", "Lessons"], ["story", "Stories"], ["game", "Games"], ["quiz", "Quizzes"], ["dictionary", "Dictionary"], ["vocabulary", "Vocabulary"]]} />}
        <GradeSelect
          label={uiText("Grade filter")}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          values={[["", "All grades"], ...grades.map((g) => [g, `Grade ${g}`])]}
        />
        <Select
          label={uiText("Status filter")}
          value={status}
          onChange={(e) => changeStatus(e.target.value)}
          values={[
            ["", "All statuses"],
            "published",
            "classroom",
            "draft",
            "submitted",
            "archived",
          ]}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={favorites}
            onChange={(e) => setFavorites(e.target.checked)}
          />{uiText("Favorites")}</label>
        {["lessons", "resources", "quizzes"].includes(section) && (
          <>
            <Select
              label={uiText("Learning area")}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              values={[
                ["", "All learning areas"],
                ...new Set([
                  "English",
                  "Filipino",
                  ...data.materials
                    .map((m) => m.curriculum?.learning_area)
                    .filter(Boolean),
                ]),
              ]}
            />
            <Select
              label={uiText("Quarter")}
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              values={[
                ["", "All quarters"],
                ...[1, 2, 3, 4].map((q) => [q, `Quarter ${q}`]),
              ]}
            />
            <Select
              label={uiText("Curriculum version")}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              values={[
                ["", "All versions"],
                ...new Set(
                  data.materials
                    .map((m) => m.curriculum?.version)
                    .filter(Boolean),
                ),
              ]}
            />
          </>
        )}
      </Toolbar>
      {activeFilters.length > 0 && <div className="material-active-filters" role="group" aria-label={uiText("Active material filters")}>
        {activeFilters.map(filter=><button type="button" className="material-filter-chip" key={filter.key} aria-label={uiText("Remove filter: {0}", [filter.label])} onClick={filter.clear}><span>{filter.label}</span><Icon name="close" size={14}/></button>)}
        {activeFilters.length > 1 && <Button variant="ghost" onClick={clearFilters}>{uiText("Clear all filters")}</Button>}
      </div>}
      {savedNotice && (
        <Notice>
          {savedNotice} {section !== "downloads" && <Link to="/workspace/downloads">{uiText("Open Downloads")}</Link>}
        </Notice>
      )}
      {action.error && <Notice error>{action.error}</Notice>}
      <p className="result-count" role="status">{rows.length} {rows.length === 1 ? uiText("material") : uiText("materials")}</p>
      {gardenMaterial && <section className="garden-feature" aria-label={uiText("Word Garden")}>
        <div>
          <h3>{uiText("Word Garden 🌱")}</h3>
          <small>{uiText("Grade ")}{gardenMaterial.grade_level} · {gardenWordCount || gardenMaterial.body.pairs.length}{uiText(" words")}{gardenSets.length > 1 && uiText(" in {0} sets", [gardenSets.length])}
          </small>
        </div>
        <div className="garden-feature-actions">
          {gardenSets.length > 1 && <Select
            label={uiText("Word Garden set")}
            value={activeGardenSet.id}
            onChange={(event) => setGardenSetId(event.target.value)}
            values={gardenSets.map((material) => [material.id, material.title.split(" · ")[1] || material.title])}
          />}
          <Button icon="game" onClick={() => {setReaderMode("word-builder");setReader(activeGardenSet);}}>{uiText("Play Word Garden")}</Button>
        </div>
      </section>}
      <div className="material-grid">
        {visibleRows.map((m, i) => (
          <article className="material-card" key={m.id}>
            <button
              className={`material-cover color-${i % 5}`}
              onClick={() => previewMaterial(m)}
              aria-label={uiText("Preview {0}", [m.title])}
            >
              {m.kind === "lesson" ? (<LessonArt material={m} />) : m.kind === "story" ? (
                <AnimalScene scene={m.body?.cover_scene || 0} label={m.title} />
              ) : (
                <span>
                  {
                    {
                      lesson: "🌱",
                      story: "📖",
                      game: "🧩",
                      quiz: "✏️",
                      dictionary: "🦉",
                      vocabulary: "🦋",
                    }[m.kind]
                  }
                </span>
              )}
              {!admin && <small>{uiText("GRADE ")}{m.grade_level}</small>}
            </button>
            <div className="card-body">
              <div className="card-badges">
                <Badge>{m.kind}</Badge>
                <Badge>{m.status}</Badge>
                {admin && <Badge>{uiText("Grade ")}{m.grade_level}</Badge>}
              </div>
              <h3>{materialTitle(m)}</h3>
              <p>{m.summary || uiText("A new opportunity to discover and learn.")}</p>
              <small>
                {m.curriculum?.reference_title || uiText("Supplemental enrichment")}
              </small>
              <div className="card-actions">
                <Button variant="secondary" onClick={() => previewMaterial(m)}>{uiText("Preview")}</Button>
                {!admin && section !== "downloads" && ["published", "classroom"].includes(m.status) &&
                  <Link className="button" to={`/workspace/journey?view=levels&grade=${m.grade_level}&material=${encodeURIComponent(m.id)}`}>{uiText("Place in missions")}</Link>}
                {admin && <Button variant="secondary" onClick={() => {setReviewDecision('');setReview(m);}}>{uiText("Review")}</Button>}
                <button
                  className="icon-button"
                  aria-label={uiText("Favorite {0}", [m.title])}
                  aria-pressed={data.favorites?.includes(m.id) || false}
                  onClick={() => favorite(m)}
                >
                  <Icon
                    name="star"
                    fill={
                      data.favorites?.includes(m.id) ? "currentColor" : "none"
                    }
                  />
                </button>
              </div>
              <MoreActions>
                {(admin ||
                  (m.owner_id === user.id && m.status !== "published")) && (
                  <button onClick={() => edit(m)}>{uiText("Edit")}</button>
                )}
                {!admin && section !== "downloads" && (
                <button
                  onClick={() => {
                    saveDownloads([m]);
                  }}
                >{uiText("Save offline")}</button>
                )}
                {section === "downloads" && (
                  <button onClick={() => downloadMaterial(m)}>{uiText("Download file")}</button>
                )}
                {section === "downloads" && (
                  <button
                    onClick={() => {
                      const next = saved.filter((row) => row.id !== m.id);
                      localStorage.setItem(storedKey, JSON.stringify(next));
                      setSaved(next);
                    }}
                  >{uiText("Remove download")}</button>
                )}
                <button
                  onClick={() =>
                    download(`${m.title}.json`, JSON.stringify(m, null, 2))
                  }
                >{uiText("Export")}</button>

              </MoreActions>
            </div>
          </article>
        ))}
      </div>
      <AdminPagination page={currentPage} pageCount={pageCount} total={rows.length} pageSize={pageSize}
        onChange={changeMaterialPage} onPageSizeChange={setPageSize}/>
      {!rows.length && (
        <Empty title={activeFilters.length ? uiText('No matching materials') : section === "downloads" ? uiText("No saved downloads yet") : uiText("Your next discovery is waiting")} action={activeFilters.length ? <Button variant="secondary" onClick={clearFilters}>{"Clear filters"}</Button> : null}>
          {activeFilters.length ? uiText('Remove a filter or try another search to find more activities.') : section === "downloads"
            ? uiText("Save a suggested material above or choose Save offline from a material’s menu.")
            : uiText("Create your first material, or open How it works for a quick guide.")}
        </Empty>
      )}
      {guide && <MaterialGuide admin={admin} onClose={()=>setGuide(false)} onCreate={section !== 'downloads' ? ()=>{setGuide(false);newMaterial();} : undefined}/>}
      {editor && (
        <MaterialEditor
          key={editor.id || "new"}
          initial={editor}
          kind={kind}
          onClose={() => setEditor(null)}
          onSaved={materialSaved}
        />
      )}{" "}
      {reader && (
        <MaterialReader
          key={reader.id}
          material={reader}
          initialGameMode={readerMode}
          onClose={() => {setReader(null);setReaderMode('matching');}}
        />
      )}
      {review && (
        <Modal title={uiText("Review teaching material")} onClose={() => setReview(null)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action.run(async () => {
                await repository.rpc("review_learning_material", {
                  p_id: review.id,
                  p_decision: f.get("decision"),
                  p_notes: f.get("notes"),
                });
                await refresh();
                setReview(null);
              });
            }}
          >
            <h3>{review.title}</h3>
            <Button type="button" variant="secondary" icon="book" onClick={()=>{setReaderMode('matching');setReader(review);}}>{uiText("Preview content")}</Button>
            <Select
              label={uiText("Decision")}
              name="decision"
              value={reviewDecision}
              onChange={event=>setReviewDecision(event.target.value)}
              required
              values={[["", "Choose a decision"], ["published", "Publish to students"], ["draft", "Return to draft"], ["archived", "Archive material"]]}
            />
            <MaterialVisibilityHint status={reviewDecision}/>
            <Field label={uiText("Review notes")}>
              <textarea name="notes" required minLength={3} maxLength={2000} />
            </Field>
            {action.error && <Notice error>{action.error}</Notice>}
            <Button type="submit" disabled={action.busy || !reviewDecision}>{uiText("Save review")}</Button>
          </form>
        </Modal>
      )}
      {section === "quizzes" && admin && (
        <details className="admin-disclosure"><summary>{uiText("Question banks (")}{data.records.filter(record => record.kind === "question_bank").length})</summary><Records kind="question_bank" compact /></details>
      )}
    </>
  );
}
export function Students() {
  useUiLanguage();
  const { data, refresh, openStudent } = useApp(),
    navigate = useNavigate(),
    action = useAction();
  const progress = useTeacherProgress();
  const [params,setParams] = useSearchParams();
  const [query, setQuery] = useState(""),
    [editor, setEditor] = useState(null),
    [detail, setDetail] = useState(null),
    [baselines,setBaselines] = useState(false),
    [grade, setGrade] = useState(()=>params.get('grade')||''),
    [active, setActive] = useState(()=>params.get('profile')||''),
    [missionFilter,setMissionFilter] = useState(()=>params.get('mission')||''),
    [page,setPage] = useState(1);
  useEffect(()=>{setPage(1);},[query,grade,active,missionFilter]);
  useEffect(()=>{const id=params.get('student');if(id){const found=data.children.find(child=>child.id===id);if(found)setDetail(found);}},[params,data.children]);
  const closeDetail=()=>{setDetail(null);if(params.has('student')){const next=new URLSearchParams(params);next.delete('student');setParams(next,{replace:true});}};
  const rows = data.children.filter(
    (c) =>
      c.nickname.toLowerCase().includes(query.toLowerCase()) &&
      (!grade || c.grade_level === Number(grade)) &&
      (!active ||
        String(c.active) === (active === "active" ? "true" : "false")) &&
      matchesMissionFilter(learnerProgress(progress.byChild.get(c.id)).state,missionFilter),
  );
  const pageCount=Math.max(1,Math.ceil(rows.length/12)),currentPage=Math.min(page,pageCount);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("CLASSROOM PROGRESS")}</span>
          <h2>{uiText("Students & missions")}</h2>
          <p>{uiText("See each learner’s current task, review their results, and continue their assigned sequence.")}</p>
        </div>
        <div className="actions"><Button variant="secondary" onClick={()=>setBaselines(true)}>{uiText('Reading baselines')}</Button><Button icon="plus" onClick={() => setEditor({})}>{uiText("Add student")}</Button></div>
      </div>
      <ProgressLoadNotice/>
      <Toolbar>
        <Search
          value={query}
          onChange={setQuery}
          placeholder={uiText("Search student names")}
        />
        <GradeSelect
          label={uiText("Student grade")}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          values={[
            ["", "All my grades"],
            ...grades.map((g) => [g, `Grade ${g}`]),
          ]}
        />
        <Select
          label={uiText("Profile status")}
          value={active}
          onChange={(e) => setActive(e.target.value)}
          values={[
            ["", "All profiles"],
            ["active", "Active"],
            ["inactive", "Inactive"],
          ]}
        />
        <Select label={uiText('Mission status')} value={missionFilter} onChange={event=>setMissionFilter(event.target.value)} values={[
          ['','All mission statuses'],['not-started','Ready to start'],['in-progress','In progress'],['needs-attention','Needs attention'],['reading-review','Teacher reading review'],['quiz-retry','Quiz needs another try'],['pending-scoring','Awaiting online scoring'],['completed','All missions completed'],['not-ready','Unavailable / not prepared'],['unavailable','Progress unavailable'],
        ]}/>
      </Toolbar>
      {action.error && <Notice error>{action.error}</Notice>}
      {rows.length>0&&<TeacherRoster students={rows.slice((currentPage-1)*12,currentPage*12)} progress={progress} attempts={data.attempts} busy={action.busy} onDetails={setDetail} onEdit={setEditor} onOpen={child=>action.run(async()=>{await openStudent(child.id);navigate('/student');})}/>}
      {rows.length>0&&<div className="teacher-progress-refresh" aria-label={uiText('Student pages')}><span>{uiText('{0} students · Page {1} of {2}',[rows.length,currentPage,pageCount])}</span><div className="actions"><Button variant="secondary" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>{uiText('Previous')}</Button><Button variant="secondary" disabled={currentPage>=pageCount} onClick={()=>setPage(currentPage+1)}>{uiText('Next')}</Button></div></div>}
      {!rows.length && (
        <Empty title={uiText(data.children.length?'No students match these filters':'No students yet')}>{uiText(data.children.length?'Change your search or filters to find a student.':'Add a student profile to begin tracking missions.')}</Empty>
      )}
      <details className="student-profile-info"><summary>{uiText('Student profile information')}</summary>
      <Notice>
        <strong>{uiText("Elementary student profiles")}</strong>
        <br />{uiText("Collect only a nickname, preset avatar, grade, optional gender, learning level, and preferences. Students do not register an account or provide an email, exact birth date, address, phone number, or photograph.")}</Notice>
      </details>
      {editor && (
        <StudentEditor
          initial={editor}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}{" "}
      {baselines&&<ClassBaselines records={data.records} children={data.children} onClose={()=>setBaselines(false)} onStudent={child=>{setBaselines(false);setDetail({...child,baseline:true});}}/>}
      {detail && (
        <StudentDetail
          child={data.children.find((c) => c.id === detail.id) || detail}
          initialTab={detail.baseline?'baseline':params.get('tab')==='placement'?'placement':'missions'}
          onClose={closeDetail}
        />
      )}
    </>
  );
}
function StudentDetail({ child, onClose, initialTab='missions' }) {
  useUiLanguage();
  const { data, openStudent } = useApp(),
    navigate = useNavigate(),
    action = useAction();
  const progress=useTeacherProgress();
  const [tab, setTab] = useState(initialTab),
    [reader, setReader] = useState(null);
  const attempts = mergeRecordedAttempts(data.attempts.filter((a) => a.child_id === child.id),progress.byChild.get(child.id)?.quiz_attempts||[]);
  const pending=(data.pending_attempts||[]).filter(a=>a.child_id===child.id);
  const start = () =>
    action.run(async () => {
      await openStudent(child.id);
      navigate('/student');
    });
  return (
    <Modal
      title={uiText("{0}'s learning journey", [child.nickname])}
      onClose={onClose}
      wide
    >
      <p>{uiText("Grade ")}{child.grade_level} · {child.learning_level}
        {child.gender === "male" && uiText(" · Male")}
        {child.gender === "female" && uiText(" · Female")}
      </p>
      <div className="pills student-record-tabs">
        <button
          className={tab === "missions" ? "active" : ""}
          aria-label={uiText('Mission progress')}
          onClick={() => setTab("missions")}
        >{uiText("Missions")}</button>
        <button
          className={tab === "results" ? "active" : ""}
          aria-label={uiText('Results & learning development')}
          onClick={() => setTab("results")}
        >{uiText("Results")}</button>
        <button className={tab==='baseline'?'active':''} onClick={()=>setTab('baseline')}>{uiText('Baseline assessment')}</button>
        <button className={tab==='placement'?'active':''} onClick={()=>setTab('placement')}>{uiText('English placement')}</button>
        <button className={tab==='recordings'?'active':''} onClick={()=>setTab('recordings')}>{uiText('Recordings')}</button>
      </div>
      <div className="actions student-record-controls"><Button disabled={!child.active || action.busy} onClick={start}>{uiText("Continue assigned mission")}</Button><Button variant="secondary" disabled={progress.loading} onClick={progress.refresh}>{uiText('Refresh mission progress')}</Button></div>
      {action.error && <Notice error>{action.error}</Notice>}
      {tab==='recordings'?<StudentRecordings child={child}/>:tab==='placement'?<TeacherPlacement child={child}/>:tab==='baseline'?<StudentBaselines child={child} records={data.records}/>:tab === "results" ? <><QuizDevelopmentTable attempts={attempts}/>{pending.length>0&&<Notice>{uiText('Awaiting online scoring')}: {pending.length}. {uiText('Pending responses are saved separately and do not count as a grade.')}</Notice>}<h3>{uiText('All recorded attempts')}</h3><AttemptTable attempts={attempts} children={data.children}/></> : <StudentMissionRecord child={child} onPreview={setReader}/>}
      {reader && (
        <MaterialReader material={reader} onClose={() => setReader(null)} />
      )}
    </Modal>
  );
}
export function Records({ kind, compact = false }) {
  useUiLanguage();
  const { data, user, repository, refresh } = useApp(),
    action = useAction();
  const [query, setQuery] = useState(""),
    [editor, setEditor] = useState(null),
    [detail, setDetail] = useState(null);
  const [sequence, setSequence] = useState(null);
  const advanceSequence = () => setSequence(previous => previous && previous.index < previous.ids.length - 1
    ? {...previous,index:previous.index+1} : null);
  const sequenceMaterial = sequence && data.materials.find(material => material.id === sequence.ids[sequence.index]);
  const rows = data.records.filter(
    (r) =>
      r.kind === kind &&
      `${r.title} ${r.data.details || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const canEdit = (r) =>
    user.role === "administrator" || r.owner_id === user.id;
  async function fullRecord(row) {
    const full = row.details_deferred ? await repository.record(row.id) : row;
    if (!full || full.id !== row.id || full.kind !== row.kind)
      throw new Error('This record changed. Refresh the page and try again.');
    if (['dataset','training'].includes(row.kind) && full.details_deferred)
      throw new Error('The full record could not be loaded. Please try again.');
    if (row.kind === 'dataset' && !Array.isArray(full.data?.pairs))
      throw new Error('The dataset pairs could not be loaded. Please try again.');
    if (row.kind === 'training' && full.data?.dataset && !Array.isArray(full.data.dataset.pairs))
      throw new Error('The training dataset could not be loaded. Please try again.');
    return full;
  }
  const openRecord = (row, open) => action.run(async () => open(await fullRecord(row)));
  const exportRecord = (row, csv = false) => action.run(async () => {
    const full = await fullRecord(row);
    if (csv) {
      if (!Array.isArray(full.data.pairs)) throw new Error('The dataset pairs could not be loaded.');
      download('translation-dataset.csv', csvText([
        ['english','filipino','source','license'],
        ...full.data.pairs.map(pair => [pair.en,pair.fil,full.data.source_url,full.data.license]),
      ]), 'text/csv');
    } else download(`${full.title}.json`, JSON.stringify(full, null, 2));
  });
  return (
    <section className={compact ? "panel" : ""}>
      <div className="page-intro">
        <div>
          <span className="eyebrow">
            {kind === "dataset"
              ? uiText("REVIEWED DATA, BETTER LEARNING")
              : uiText("ORGANIZE YOUR NEXT STEP")}
          </span>
          <h2>
            {
              {
                plan: "My teaching plans",
                session: "Classroom sessions",
                curriculum: "Published curriculum references",
                dataset: "Translation datasets",
                training: "Training packages",
                announcement: "Announcements",
                question_bank: "Question banks",
              }[kind]
            }
          </h2>
        </div>
        {(user.role === "administrator" ||
          ["plan", "session"].includes(kind)) && (
          <Button icon="plus" onClick={() => setEditor({})}>{uiText("Create ")}{kind.replace("_", " ")}
          </Button>
        )}
      </div>
      <Search value={query} onChange={setQuery} />
      {action.error && <Notice error>{action.error}</Notice>}
      <div className="record-list">
        {rows.map((r) => (
          <article className="record-card" key={r.id}>
            <div className="record-icon">
              <Icon name={kind === "dataset" ? "table" : "book"} size={26} />
            </div>
            <div>
              <Badge>{r.status}</Badge>
              {r.status === "draft" && r.data.collection === "classroom-starters-v1" && <Badge>{uiText("Sample")}</Badge>}
              <h3>{r.title}</h3>
              <p className="record-summary">{r.data.details}</p>
              <small>
                {dateText(r.updated_at)}
                {(r.data.pairs || r.data.pair_count !== undefined) && uiText(" · {0} pairs", [r.data.pairs?.length ?? r.data.pair_count])}
                {r.data.grade_level && uiText(" · Grade {0}", [r.data.grade_level])}
              </small>
              <div className="text-actions record-primary-actions">
                <button disabled={action.busy} onClick={() => openRecord(r, setDetail)}>{uiText("View details")}</button>
                {canEdit(r) && (
                  <button disabled={action.busy} onClick={() => openRecord(r, setEditor)}>{uiText("Edit")}</button>
                )}
                {r.data.material_ids?.length > 0 && (
                  <button
                    onClick={() =>
                      setSequence({ ids: r.data.material_ids, index: 0 })
                    }
                  >{uiText("Open teaching sequence")}</button>
                )}
              </div>
              <MoreActions>
                {kind === "dataset" && (
                  <button
                    disabled={action.busy}
                    onClick={() => exportRecord(r, true)}
                  >{uiText("Export CSV")}</button>
                )}
                <button
                  disabled={action.busy}
                  onClick={() => exportRecord(r)}
                >{uiText("Download ")}{kind === "training" ? uiText("manifest") : uiText("record")}
                </button>
              </MoreActions>
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <Empty title={uiText("No {0} records yet", [kind.replace("_", " ")])}>{uiText("Create one when you're ready.")}</Empty>
      )}
      {editor && (
        <RecordEditor
          kind={kind}
          initial={editor}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}{" "}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          <dl>
            {Object.entries(detail.data)
              .filter(([_, v]) => typeof v !== "object")
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>{String(v ?? "—")}</dd>
                </div>
              ))}
          </dl>
          {detail.data.pairs && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{uiText("English")}</th>
                    <th>{uiText("Filipino")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.pairs.slice(0, 200).map((p, i) => (
                    <tr key={i}>
                      <td>{p.en}</td>
                      <td>{p.fil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
      {sequence && (sequenceMaterial ? <MaterialReader key={sequenceMaterial.id} material={sequenceMaterial} onClose={advanceSequence}/>
        : <Modal title={uiText("Activity unavailable")} onClose={()=>setSequence(null)}>
            <p>{uiText("This activity is no longer available. You can skip it and continue the teaching sequence.")}</p>
            <div className="modal-actions"><Button variant="secondary" onClick={()=>setSequence(null)}>{uiText("Close sequence")}</Button>
              <Button onClick={advanceSequence}>{uiText("Skip unavailable activity")}</Button></div>
          </Modal>)}
    </section>
  );
}
function AttemptTable({ attempts, children }) {
  useUiLanguage();
  return !attempts.length ? (
    <Empty title={uiText("No recorded activities yet")} />
  ) : (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{uiText("Student")}</th>
            <th>{uiText("Activity")}</th>
            <th>{uiText("Grade")}</th>
            <th>{uiText("Version")}</th>
            <th>{uiText("Score")}</th>
            <th>{uiText("Stars")}</th>
            <th>{uiText("Completed")}</th>
          </tr>
        </thead>
        <tbody>
          {[...attempts]
            .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
            .map((a) => (
              <tr key={a.id}>
                <td>
                  {children.find((c) => c.id === a.child_id)?.nickname ||
                    uiText("Student")}
                </td>
                <td>
                  {a.quiz_number ? uiText("Quiz {0} · ", [a.quiz_number]) : ""}
                  {a.material_title || uiText("Learning activity")}
                </td>
                <td>{a.grade_level || "—"}</td>
                <td>{a.material_version}</td>
                <td>
                  {['quiz','game'].includes(a.activity_kind)?`${a.correct_count}/${a.total_count}`:uiText('Completed task')}
                </td>
                <td>{a.stars}</td>
                <td>{dateText(a.completed_at)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
export function Reports() {
  useUiLanguage();
  const [reportParams]=useSearchParams();
  const { data, refresh, user } = useApp(),
    [grade, setGrade] = useState(()=>reportParams.get('grade')||''),
    [child, setChild] = useState(""),
    [history, setHistory] = useState(false),
    [quiz, setQuiz] = useState(""),
    [query, setQuery] = useState(""),
    [copied, setCopied] = useState(false);
  const missionProgress=useTeacherProgress();
  const reportingData={...data,attempts:mergeRecordedAttempts(data.attempts,missionProgress.learners.flatMap(learner=>learner.quiz_attempts||[])).filter(attempt=>attempt.assessment_type!=='pending_online_scoring')};
  const children = data.children.filter(
    (c) =>
      (!grade ||
        c.grade_level === Number(grade) ||
        data.attempts.some(
          (a) => a.child_id === c.id && a.grade_level === Number(grade),
        )) &&
      (!child || c.id === child) &&
      c.nickname.toLowerCase().includes(query.toLowerCase()),
  );
  const ids = new Set(children.map((c) => c.id)),
    attempts = reportingData.attempts.filter(
      (a) =>
        ids.has(a.child_id) &&
        (!grade || a.grade_level === Number(grade)) &&
        (!quiz || quizIdentity(a) === quiz),
    );
  const allColumns = gradebookMatrix(reportingData, children, grade);
  const matrix = {
    ...allColumns,
    columns: allColumns.columns.filter((m) => !quiz || m.key === quiz),
    rows: allColumns.rows.map((row) => ({
      ...row,
      cells: row.cells.filter(
        (cell, i) => !quiz || allColumns.columns[i].key === quiz,
      ),
    })),
  };
  const results = matrix.rows.flatMap((row) =>
    row.cells.filter((c) => c.attempt).map((c) => c.attempt),
  );
  const average = results.length
    ? results.reduce((n, a) => n + (a.correct_count / a.total_count) * 100, 0) /
      results.length
    : null;
  const exported = history
    ? [
        [
          "Student ID",
          "Student",
          "Activity",
          "Grade",
          "Version",
          "Correct",
          "Total",
          "Completed",
        ],
        ...attempts.map((a) => [
          a.child_id,
          data.children.find((c) => c.id === a.child_id)?.nickname,
          a.material_title,
          a.grade_level,
          a.material_version,
          a.correct_count,
          a.total_count,
          a.completed_at,
        ]),
      ]
    : [
        ["Student ID", "Student", "Grade", ...(user.role==='educator'?["Mission status", "Completed mission tasks", "Current mission task"]:[]), ...matrix.columns.map(material =>
          `${materialTitle(material)} (v${material.version || 1})`)],
        ...matrix.rows.map((row) => [
          row.child.id,
          row.child.nickname,
          row.child.grade_level,
          ...(user.role==='educator'?[learnerProgress(missionProgress.byChild.get(row.child.id)).label,
          missionProgress.byChild.has(row.child.id)?`${learnerProgress(missionProgress.byChild.get(row.child.id)).completed} of ${learnerProgress(missionProgress.byChild.get(row.child.id)).total}`:'Unavailable',
          learnerProgress(missionProgress.byChild.get(row.child.id)).current?.title||'']:[]),
          ...row.cells.map((cell) => cell.attempt
            ? `${cell.attempt.correct_count} of ${cell.attempt.total_count}`
            : cell.text),
        ]),
      ];
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("CELEBRATE WHAT THEY'VE LEARNED")}</span>
          <h2>{uiText("Reports & gradebook")}</h2>
          <p>{uiText("Latest quiz results stay separate from missing work. All past attempts remain available.")}</p>
        </div>
        <Button
          icon="download"
          onClick={() =>
            download(history ? "linguakids-activity-history.csv" : "linguakids-gradebook.csv", csvText(exported), "text/csv;charset=utf-8")
          }
        >{uiText("Export CSV")}</Button>
      </div>
      <div className="actions">
        <Button variant="secondary" icon="refresh" onClick={refresh}>{uiText("Refresh records")}</Button>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(csvText(exported));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >{uiText("Copy CSV")}</Button>
      </div>
      {copied && (
        <Notice>{uiText("Quiz records copied. Paste them into your spreadsheet.")}</Notice>
      )}
      <Stats
        items={[
          ["Students", children.length, "users"],
          ["Quizzes", matrix.columns.length, "check"],
          ["Recorded quiz results", results.length, "book"],
          [
            "Average recorded score",
            average === null ? "—" : `${average.toFixed(1)}%`,
            "chart",
          ],
        ]}
      />
      {!!data.pending_attempts?.length && <Notice>{uiText('Awaiting online scoring')}: {data.pending_attempts.length}. {uiText('These saved responses are excluded from scores until the educator transfers the backup online.')}</Notice>}
      <Toolbar>
        <Search
          value={query}
          onChange={setQuery}
          placeholder={uiText("Search student names")}
        />
        <Select
          label={uiText("Quiz filter")}
          value={quiz}
          onChange={(e) => setQuiz(e.target.value)}
          values={[
            ["", "All quizzes"],
            ...allColumns.columns.map((m) => [
              m.key,
              `Grade ${m.grade_level} · ${materialTitle(m)} · v${m.version||1}`,
            ]),
          ]}
        />
        <GradeSelect
          label={uiText("Grade filter")}
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value);
            setChild("");
            setQuiz("");
          }}
          values={[["", "All grades"], ...grades.map((g) => [g, `Grade ${g}`])]}
        />
        <Select
          label={uiText("Student filter")}
          value={child}
          onChange={(e) => setChild(e.target.value)}
          values={[
            ["", "All students"],
            ...data.children
              .filter(
                (c) =>
                  !grade ||
                  c.grade_level === Number(grade) ||
                  data.attempts.some(
                    (a) =>
                      a.child_id === c.id && a.grade_level === Number(grade),
                  ),
              )
              .map((c) => [c.id, `${c.nickname} · ${c.id.slice(0, 6)}`]),
          ]}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => setHistory(e.target.checked)}
          />{uiText("All activity attempts")}</label>
      </Toolbar>
      <details className="panel">
        <summary>{uiText("What is included in the CSV?")}</summary>
        <p>{uiText('Mission status and completed task counts come from the same student mission record. A missing progress record is marked unavailable, never zero.')}</p>
        <p>{uiText("The export follows the grade, student, quiz and search filters on this page. Open the downloaded file in Excel, Google Sheets or LibreOffice.")}</p>
        <p>{uiText("Gradebook gives one row per student, their grade, and one column per quiz version. Each result is the latest attempt for that quiz version. The CSV shows 4 of 5 for four correct answers out of five. Missing work stays labeled as missing.")}</p>
        <p>{uiText("Turn on All activity attempts to export one row per attempt with the activity, version, correct answers, total questions and completion time. Repeated attempts remain separate rows.")}</p>
      </details>
      <section className="panel">
        {history ? (
          <AttemptTable attempts={attempts} children={data.children} />
        ) : !children.length ? (
          <Empty title={uiText("No student profiles in this selection")} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{uiText("Student")}</th>
                  <th>{uiText("Grade")}</th>
                  {user.role==='educator'&&<th>{uiText('Mission progress')}</th>}
                  {matrix.columns.map((m) => (
                    <th key={m.key}>{materialTitle(m)}<small className="student-id">v{m.version||1}</small></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.child.id}>
                    <td>
                      {user.role==='educator'?<Link to={`/workspace/students?student=${encodeURIComponent(row.child.id)}`}>{row.child.nickname}</Link>:row.child.nickname}
                      <small className="student-id">
                        {row.child.id.slice(0, 6)}
                      </small>
                    </td>
                    <td>{row.child.grade_level}</td>
                    {user.role==='educator'&&<td><CompactMissionProgress child={row.child}/></td>}
                    {row.cells.map((cell, i) => (
                      <td
                        key={matrix.columns[i].key}
                        className={`grade-cell ${cell.kind}`}
                        title={
                          cell.attempt
                            ? uiText("{0} · version {1}", [cell.attempt.material_title, cell.attempt.material_version])
                            : cell.text
                        }
                      >
                        {cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
export function Educators() {
  useUiLanguage();
  const { data, repository, refresh } = useApp(),
    action = useAction();
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null), [status,setStatus] = useState(""), [grade,setGrade] = useState(""),
    [page,setPage] = useState(1), [pageSize,setPageSize] = useState(20);
  useEffect(()=>setPage(1),[query,status,grade,pageSize]);
  const rows = data.educators.filter(educator=>educator.role === "educator" &&
    `${educator.name} ${educator.email}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!status || educator.status === status) && (!grade || educator.grade_levels?.includes(Number(grade))));
  const pageCount=Math.max(1,Math.ceil(rows.length/pageSize)), currentPage=Math.min(page,pageCount);
  const clearFilters=()=>{setQuery("");setStatus("");setGrade("");};

  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("YOUR LEARNING COMMUNITY")}</span>
          <h2>{uiText("Educator management")}</h2>
          <p>{uiText("Support your educators and manage account access.")}</p>
        </div>
      </div>
      {!repository.preview && <GradeAdmissions/>}
      <Toolbar activeCount={[status,grade].filter(Boolean).length}>
        <Search value={query} onChange={setQuery}/>
        <Select label={uiText("Account status")} value={status} onChange={event=>setStatus(event.target.value)} values={[["","All statuses"],["active","Active"],["suspended","Suspended"]]}/>
        <GradeSelect label={uiText("Grade filter")} value={grade} onChange={event=>setGrade(event.target.value)} values={[["","All grades"],...grades.map(g=>[g,`Grade ${g}`])]}/>
      </Toolbar>
      <p role="status">{uiText("Educators")}: {rows.length}</p>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{uiText("Name")}</th>
                <th>{uiText("Email")}</th>
                <th>{uiText("Grades")}</th>
                <th>{uiText("Status")}</th>
                <th>{uiText("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((currentPage-1)*pageSize,currentPage*pageSize).map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.grade_levels?.join(", ") || "—"}{u.account_kind==='review'&&<Badge>{uiText("Review / demo")}</Badge>}</td>
                    <td>
                      <Badge>{u.status}</Badge>
                    </td>
                    <td>
                      {u.status === "active" && (
                        <Button
                          variant="secondary"
                          onClick={() => {action.setError("");setSelected(u);}}
                        >{uiText("Suspend")}</Button>
                      )}
                      {u.status === "suspended" && (
                        <Button
                          variant="secondary"
                          onClick={() => {action.setError("");setSelected(u);}}
                        >{uiText("Reactivate")}</Button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <AdminPagination page={currentPage} pageCount={pageCount} total={rows.length} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize}/>
      {!rows.length && <Empty title={uiText("No matching educators")} action={<Button variant="secondary" onClick={clearFilters}>{uiText("Clear filters")}</Button>}>{uiText("Try another name, email, grade, or account status.")}</Empty>}
      {selected && (
        <Modal
          title={uiText("{0} educator", [selected.status === "active" ? "Suspend" : "Reactivate"])}
          onClose={() => setSelected(null)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = new FormData(e.currentTarget).get("reason");
              action.run(async () => {
                if(reason.trim().length < 3)throw new Error("Enter a reason with at least 3 characters.");
                await repository.rpc("admin_update_educator", {
                  p_id: selected.id,
                  p_status: selected.status === "active" ? "suspended" : "active",
                  p_reason: reason.trim(),
                });
                await refresh();
                setSelected(null);
              });
            }}
          >
            <p>
              {selected.name} · {selected.email}
            </p>
            <Field label={uiText("Reason")} name="reason" minLength={3} required />
            {action.error && <Notice error>{action.error}</Notice>}
            <Button disabled={action.busy} type="submit">{uiText("Confirm account status")}</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Audit() {
  useUiLanguage();
  const { repository } = useApp(),
    [rows, setRows] = useState(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  async function load() {
    try {
      setError("");
      setRows(await repository.loadTable("audit_logs", "occurred_at"));
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="page-intro">
        <div>
          <h2>{uiText("Audit logs")}</h2>
          <p>{uiText("Latest 200 recorded account and content events.")}</p>
        </div>
        <Button icon="refresh" variant="secondary" onClick={load}>{uiText("Refresh")}</Button>
      </div>
      <Search value={query} onChange={setQuery} />
      {error && <Notice error>{error}</Notice>}
      {!rows && !error ? (
        <Loading />
      ) : (
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{uiText("When")}</th>
                  <th>{uiText("Action")}</th>
                  <th>{uiText("Record")}</th>
                  <th>{uiText("Actor")}</th>
                  <th>{uiText("Details")}</th>
                </tr>
              </thead>
              <tbody>
                {(rows || [])
                  .filter((r) =>
                    JSON.stringify(r)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{dateText(r.occurred_at)}</td>
                      <td>{r.action.replaceAll("_", " ")}</td>
                      <td>{r.entity_type}</td>
                      <td>{r.actor_id?.slice(0, 8) || uiText("System")}</td>
                      <td>
                        {Object.entries(r.metadata || {})
                          .map(
                            ([k, v]) =>
                              `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
                          )
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
export function Settings() {
  useUiLanguage();
  const { repository, user } = useApp(),
    action = useAction();
  const [prefs, setPrefs] = useState(null), [prefsLoading,setPrefsLoading] = useState(false), [saved,setSaved] = useState(false);
  async function loadPreferences() {
    setPrefsLoading(true);action.setError("");
    try {setPrefs(await repository.preferences(user.id));}
    catch(error){action.setError(errorText(error));}
    finally {setPrefsLoading(false);}
  }
  useEffect(()=>{loadPreferences();},[user.id]);
  return (
    <section className="panel settings-panel">
      <ConnectionPanel /><OnlineBackupTransfer/>
      <span className="eyebrow">{uiText("MAKE YOURSELF AT HOME")}</span>
      <h2>{uiText("Your preferences")}</h2>
      {action.error && <Notice error>{action.error}</Notice>}
      {prefsLoading && <Loading text="Loading preferences…"/>}
      {!prefs && !prefsLoading && action.error && <Button variant="secondary" onClick={loadPreferences}>{uiText("Try again")}</Button>}
      {saved && <Notice>{uiText("Preferences saved.")}</Notice>}
      {prefs && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setSaved(false);action.run(async () => {
              const values = {
                locale: f.get("locale"),
                text_scale: Number(f.get("scale")),
                reduced_motion: f.get("motion") === "on",
                muted: f.get("muted") === "on",
              };
              await repository.savePreferences(user.id, values);
              setPrefs(values);
              document.documentElement.style.fontSize = `${values.text_scale * 16}px`;
              document.documentElement.dataset.reducedMotion = String(
                values.reduced_motion,
              );
              document.documentElement.dataset.muted = String(values.muted);
              setUiLanguage(values.locale);setSaved(true);
            });
          }}
        >
          <Select
            label={uiText("Preferred language")}
            name="locale"
            defaultValue={prefs.locale}
            values={["en", "fil"].map((v) => [
              v,
              v === "en" ? "English" : "Filipino",
            ])}
          />
          <Select
            label={uiText("Text size")}
            name="scale"
            defaultValue={prefs.text_scale}
            values={[
              [0.8, "Small"],
              [1, "Standard"],
              [1.25, "Large"],
              [1.5, "Extra large"],
              [2, "Largest"],
            ]}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              name="motion"
              defaultChecked={prefs.reduced_motion}
            />{uiText("Reduce motion")}</label>
          <label className="checkbox">
            <input type="checkbox" name="muted" defaultChecked={prefs.muted} />{uiText("Mute sounds")}</label>
          <Button disabled={action.busy} type="submit">{uiText("Save preferences")}</Button>
        </form>
      )}
      <hr />
      <p>
        <strong>{user.name}</strong>
        <br />
        {user.email}
        <br />
        {user.role}
      </p>
      <Link
        to={`/forgot-password?role=${user.role}`}
        state={{ email: user.email }}
      >{uiText("Change my password")}</Link>
    </section>
  );
}
function ConnectionPanel() {
  useUiLanguage();
  const { repository, data, dataError, refresh } = useApp(),
    [api, setApi] = useState("checking");
  async function check() {
    if (repository.preview) {
      setApi("preview");
      return;
    }
    setApi("checking");
    try {
      setApi((await repository.health()) ? "ready" : "offline");
    } catch {
      setApi("offline");
    }
  }
  useEffect(() => {
    check();
  }, []);
  return (
    <section className="connection-panel">
      <h3>{uiText("Account connection")}</h3>
      <div>
        <span>{uiText("Saved account data")}</span>
        <Badge>
          {repository.preview
            ? uiText("Sample data")
            : data && !dataError
              ? uiText("Connected")
              : uiText("Unavailable")}
        </Badge>
      </div>
      <div>
        <span>{uiText("Learning service")}</span>
        <Badge>
          {api === "ready"
            ? uiText("Ready")
            : api === "checking"
              ? uiText("Checking…")
              : api === "preview"
                ? uiText("Preview only")
                : uiText("Offline")}
        </Badge>
      </div>
      <Button
        type="button"
        variant="ghost"
        icon="refresh"
        onClick={() => {
          check();
          refresh();
        }}
      >{uiText("Check connection")}</Button>
      {api === "offline" && (
        <small>{uiText("Open LinguaKids using its app launcher to start the learning service.")}</small>
      )}
      <hr />
    </section>
  );
}
export function Dictionary() {
  useUiLanguage();
  const { repository, user } = useApp(),
    action = useAction();
  const [entries, setEntries] = useState([]),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [editor, setEditor] = useState(null), [entriesLoading,setEntriesLoading] = useState(true), [entriesError,setEntriesError] = useState("");
  async function load() {
    setEntriesLoading(true);setEntriesError("");
    try {
      setEntries(await repository.loadTable("dictionary_entries"));
    } catch (e) {
      setEntriesError(errorText(e));
    } finally {setEntriesLoading(false);}
  }
  useEffect(() => {
    load();
  }, []);
  const admin = user.role === "administrator";
  const term = query.trim().toLowerCase();
  const matches = entries.filter((entry) =>
    `${entry.english_term} ${entry.filipino_term}`.toLowerCase().includes(term),
  ).sort((a, b) => a.english_term.localeCompare(b.english_term));
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  return (
    <>
      <div className="page-intro">
        <div>
          <span className="eyebrow">{uiText("ONE WORD, TWO WORLDS")}</span>
          <h2>{uiText("English–Filipino dictionary")}</h2>
        </div>
        {admin && (
          <Button icon="plus" onClick={() => {action.setError("");setEditor({});}}>{uiText("Add word")}</Button>
        )}
      </div>
      {action.error && <Notice error>{action.error}</Notice>}
      {entriesError && <Notice error>{entriesError} <Button variant="secondary" onClick={load}>{uiText("Try again")}</Button></Notice>}
      {entriesLoading && <Loading text="Loading dictionary…"/>}
      <DictionaryLookup query={query} onChange={(value) => { setQuery(value); setPage(1); }} />
      <div className="dictionary-grid">
        {matches.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((e) => (
            <article className="panel" key={e.id}>
              <Badge>{e.state}</Badge>
              <h3>{e.english_term}</h3>
              <p className="word-translation">{e.filipino_term}</p>
              <small>
                {e.part_of_speech && `${e.part_of_speech} · `}
                {e.min_grade && e.max_grade && uiText("Grade {0}–{1}", [e.min_grade, e.max_grade])}
              </small>
              <div className="actions">
                <ListenButton text={e.english_term} language="en">{uiText("English")}</ListenButton>
                <ListenButton text={e.filipino_term} language="fil">{uiText("Tagalog")}</ListenButton>
              </div>
              {e.examples?.map((x, i) => (
                <p key={i}>
                  {typeof x === "string"
                    ? x
                    : `${x.en || x.english || ""} — ${x.fil || x.filipino || ""}`}
                </p>
              ))}
              {admin && (
                <Button variant="ghost" onClick={() => {action.setError("");setEditor(e);}}>{uiText("Edit word")}</Button>
              )}
            </article>
          ))}
      </div>
      <AdminPagination page={currentPage} pageCount={pageCount} total={matches.length} pageSize={pageSize} onChange={setPage} />
      {!entriesLoading && !entriesError && !matches.length && <Empty title={term ? uiText("No matching words") : uiText("Add a new word to your world")} />}
      {editor && (
        <Modal
          title={editor.id ? uiText("Edit dictionary word") : uiText("Add dictionary word")}
          onClose={() => setEditor(null)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              action.run(async () => {
                const englishWord=String(f.get("en") || "").trim(),filipinoWord=String(f.get("fil") || "").trim();
                if(!englishWord || !filipinoWord)throw new Error("Enter both an English word and a Filipino word.");
                if (Number(f.get("min")) > Number(f.get("max")))
                  throw new Error("Minimum grade cannot exceed maximum grade.");
                await repository.saveTable(
                  "dictionary_entries",
                  {
                    english_term: englishWord,
                    filipino_term: filipinoWord,
                    part_of_speech: f.get("part"),
                    categories: [f.get("category").trim(), ...(editor.categories || []).slice(1)].filter(Boolean),
                    min_grade: Number(f.get("min")),
                    max_grade: Number(f.get("max")),
                    state: f.get("state"),
                    ...(!editor.id
                      ? { created_by: user.id, definitions: [], examples: [] }
                      : {}),
                  },
                  editor.id,
                );
                await load();
                setQuery(englishWord);setPage(1);
                setEditor(null);
              });
            }}
          >
            <Field
              label={uiText("English word")}
              name="en"
              required
              defaultValue={editor.english_term || ""}
            />
            <Field
              label={uiText("Filipino word")}
              name="fil"
              required
              defaultValue={editor.filipino_term || ""}
            />
            <Field
              label={uiText("Part of speech")}
              name="part"
              defaultValue={editor.part_of_speech || ""}
            />
            <Field
              label={uiText("Category")}
              name="category"
              defaultValue={editor.categories?.[0] || editor.category || ""}
            />
            <div className="form-grid">
              <GradeSelect
                label={uiText("Minimum grade")}
                name="min"
                defaultValue={editor.min_grade || 1}
                values={grades}
              />
              <GradeSelect
                label={uiText("Maximum grade")}
                name="max"
                defaultValue={editor.max_grade || 6}
                values={grades}
              />
            </div>
            <Select
              label={uiText("Status")}
              name="state"
              defaultValue={editor.state || "draft"}
              values={["draft", "published", "archived"]}
            />
            {action.error && <Notice error>{action.error}</Notice>}
            <Button type="submit" disabled={action.busy}>{uiText("Save word")}</Button>
          </form>
        </Modal>
      )}
      {!admin && <Materials section="dictionary" />}
    </>
  );
}
export function Curriculum() {
  useUiLanguage();
  return <Records kind="curriculum" />;
}
export function Presentation() {
  useUiLanguage();
  const { repository, user, session, authError, data, dataError, refresh, locked } = useApp(),
    navigate = useNavigate();
  const [selected, setSelected] = useState(null),
    [chosenGrade, setGrade] = useState(null);
  if (locked) return <Navigate to="/adult-unlock" replace />;
  if (!user && session)
    return authError ? (
      <div className="panel">
        <Notice error>{authError}</Notice>
        <Button onClick={() => repository.signOut()}>{uiText("Return to login")}</Button>
      </div>
    ) : <Loading />;
  if (!user || user.status !== "active") return <Navigate to="/login" replace />;
  if (user.role !== "educator") return <Navigate to={homeFor(user)} replace />;
  const grade = chosenGrade ?? String(user.grade_levels?.[0] || 1);
  const materials = data?.materials.filter(
    (material) => material.grade_level === Number(grade) && material.status !== "archived",
  );
  return (
    <div className="presentation">
      <header>
        <Brand />
        <Button variant="secondary" onClick={() => navigate(homeFor(user))}>{uiText("Exit presentation")}</Button>
      </header>
      <main>
        <h1>{uiText("Let's learn something wonderful.")}</h1>
        <GradeSelect
          label={uiText("Grade")}
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          values={grades.map((g) => [g, `Grade ${g}`])}
        />
        {dataError && <Notice error>{dataError} <Button onClick={refresh}>{uiText("Try again")}</Button></Notice>}
        {!data && !dataError && <Loading />}
        {materials?.length === 0 && <Empty title={uiText("No materials for this grade")} />}
        <div className="material-grid">
          {materials?.map((m) => (
              <button
                className="panel"
                key={m.id}
                onClick={() => setSelected(m)}
              >
                <div
                  style={{
                    height: 140,
                    overflow: "hidden",
                    borderRadius: 16,
                    marginBottom: 18,
                  }}
                >
                  <AnimalScene
                    scene={m.body?.cover_scene ?? m.grade_level}
                    label={m.title}
                  />
                </div>
                <h2>{m.title}</h2>
                <Badge>{m.kind}</Badge>
              </button>
            ))}
        </div>
        {selected && (
          <MaterialReader
            key={selected.id}
            material={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </main>
    </div>
  );
}

