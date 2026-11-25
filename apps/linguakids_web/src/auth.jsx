import { uiText, useUiLanguage } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { AnimalScene } from './art';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useApp } from "./context";
import { Brand, Button, Field, Notice, Password, Icon, Select, useAction } from "./ui";
import { grades, homeFor } from "./domain";
import { isSectionLogin, requireMailbox } from './section-logins';

export function Landing() {
  useUiLanguage();
  const { user } = useApp();
  const [menu,setMenu] = useState(false);
  const menuRef = useRef(null);
  const scroll = (id) => (e) => {
    e.preventDefault();
    setMenu(false);
    const target=document.getElementById(id);
    target?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'instant' : 'smooth' });
    target?.focus({preventScroll:true});
  };
  return (
    <div className="landing public-refresh">
      <a className="public-skip-link" href="#/" onClick={scroll('public-main')}>{uiText("Skip to content")}</a>
      <header className="public-header" onKeyDown={event=>{if(event.key==='Escape'&&menu){setMenu(false);menuRef.current?.focus();}}}>
        <Link to="/" aria-label={uiText("LinguaKids home")}>
          <Brand />
        </Link>
        <button ref={menuRef} type="button" className="public-menu-toggle" aria-label={menu?uiText('Close navigation'):uiText('Open navigation')} aria-expanded={menu} aria-controls="public-navigation" onClick={()=>setMenu(!menu)}><Icon name={menu?'close':'menu'}/></button>
        <nav id="public-navigation" aria-label={uiText("On this page")} data-open={menu}>
          <a href="#/">{uiText("Home")}</a>
          <a href="/offline.html">{uiText("Offline Library")}</a>
          <a href="#/" onClick={scroll("learn")}>{uiText("Learning")}</a>
          <a href="#/" onClick={scroll("educators")}>{uiText("For educators")}</a>
          <a href="#/" onClick={scroll('questions')}>{uiText("FAQs")}</a>
        </nav>
        <Link className="button secondary" to={user ? homeFor(user) : "/login"}>
          {user ? uiText("My workspace") : uiText("Educator login")}
          <Icon name="arrow" />
        </Link>
      </header>
      <main id="public-main" tabIndex={-1}>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="dot" />{uiText(" LITTLE LEARNERS. BIG POSSIBILITIES.")}</span>
            <h1>{uiText("A little learning.")}<br />{uiText("A world of ")}<span>{uiText("possibilities.")}</span>
            </h1>
            <p>{uiText("English and Filipino come to life through stories, playful practice, and moments of discovery. Made for Grades 1–6. Guided by you.")}</p>
            <div className="actions">
              <Link className="button" to="/register">{uiText("Start teaching ")}<Icon name="arrow" />
              </Link>
              <a
                className="button secondary"
                href="#/"
                onClick={scroll("learn")}
              >{uiText("Explore the learning")}</a>
            </div>
            <div className="hero-notes">
              <span><Icon name="check" size={16}/>{uiText(" English + Filipino")}</span>
              <span><Icon name="users" size={16}/>{uiText(" Grades 1–6")}</span>
              <span><Icon name="shield" size={16}/>{uiText(" Educator-guided")}</span>
            </div>
          </div>
          <div className="learning-playground" aria-hidden="true">
            <div className="playground-orbit" />
            <span className="playground-star">✦</span>
            <span className="playground-sun">☀</span>
            <div className="playground-letters"><span>A</span><span>B</span><span>C</span></div>
            <div className="playground-book"><div className="playground-book-art"><AnimalScene scene={0} label="" /></div><div className="playground-book-title"><Icon name="book" size={20}/><strong>{uiText("Read & discover")}</strong><span>01</span></div></div>
            <div className="playground-word"><span><Icon name="volume" size={24}/></span><div><strong>{uiText("Hello!")}</strong><small>{uiText("Kumusta!")}</small></div><span className="playground-wave">▂ ▅ ▃ ▆ ▂</span></div>
            <div className="playground-progress"><Icon name="star" size={25}/><div><strong>{uiText("Small steps. Big growth.")}</strong><span><i/><i/><i/><i/><i/></span></div></div>
          </div>
        </section>
        <div className="public-learning-strip" aria-label={uiText("Made for elementary learning")}><span>{uiText("A little more curiosity.")}<br/><strong>{uiText("A little more confidence.")}</strong></span><div><strong>2</strong><span>{uiText("languages to connect")}</span></div><div><strong>6</strong><span>{uiText("grades to grow through")}</span></div><div><Icon name="spark" size={28}/><span>{uiText("so much to discover")}</span></div></div>
        <section className="intro-section" id="learn" tabIndex={-1}>
          <span className="eyebrow">{uiText("A PLACE TO GROW")}</span>
          <h2>{uiText("Curiosity belongs in every classroom.")}</h2>
          <p>{uiText("One welcoming space for reading, language, and playful learning.")}</p>
          <div className="feature-grid">
            {[
              [
                "book",
                "Stories worth sharing",
                "Bilingual lessons and illustrated stories for every grade.",0,"Read & discover",
              ],
              [
                "game",
                "Practice that feels like play",
                "Word games, quizzes, and vocabulary activities.",6,"Play & practice",
              ],
              [
                "chart",
                "Every little milestone",
                "Student profiles and progress that help you plan the next step.",12,"Grow & celebrate",
              ],
            ].map(([icon, title, body, scene, label]) => (
              <article className="feature" key={title}>
                <div className="public-feature-art"><AnimalScene scene={scene} label={label}/><span>{label}</span></div>
                <div className="public-feature-copy">
                <span className="feature-icon">
                  <Icon name={icon} size={30} />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="public-teacher-section" id="educators" tabIndex={-1}>
          <div>
            <span className="eyebrow">{uiText("MADE FOR YOUR CLASSROOM")}</span>
            <h2>{uiText("You guide the journey.")}<br />{uiText("We'll bring the tools.")}</h2>
            <p>{uiText("Create lessons, welcome your students, and celebrate their progress.")}</p>
          <ol className="public-teaching-steps">
            <li><span>01</span><div><strong>{uiText("Make it your classroom")}</strong><p>{uiText("Create an educator account and student profiles for your learners.")}</p></div></li>
            <li><span>02</span><div><strong>{uiText("Find their next discovery")}</strong><p>{uiText("Choose bilingual lessons, illustrated stories, or playful word games.")}</p></div></li>
            <li><span>03</span><div><strong>{uiText("Celebrate each little step")}</strong><p>{uiText("Let students finish activities in their learning space, then review their progress.")}</p></div></li>
          </ol>
          <Link className="button" to="/register">{uiText("Create educator account ")}<Icon name="arrow" />
          </Link>
          </div>
          <div className="public-teacher-preview" aria-label={uiText("A look inside your teaching tools")}><div className="public-preview-top"><span><Icon name="book" size={18}/>{uiText(" Your teaching space")}</span><span aria-hidden="true">•••</span></div><div className="public-preview-welcome"><small>{uiText("A NEW DAY OF DISCOVERY")}</small><h3>{uiText("Ready when you are.")}</h3><p>{uiText("Good lessons start with a little curiosity.")}</p><div><span><Icon name="book" size={17}/>{uiText(" Lessons")}</span><span><Icon name="game" size={17}/>{uiText(" Games")}</span></div></div><div className="public-preview-tools">{[['users','Your learners','A learning profile for each child'],['calendar','Your teaching plans','A clear next step for every lesson'],['chart','Their little milestones','Progress you can celebrate together']].map(([icon,title,detail])=><div key={icon}><span><Icon name={icon}/></span><div><strong>{title}</strong><small>{detail}</small></div><Icon name="arrow" size={16}/></div>)}</div><div className="public-preview-note"><Icon name="shield" size={17}/><span>{uiText("Students learn through educator-managed profiles.")}</span></div></div>
        </section>
        <section className="public-faq-section" id="questions" tabIndex={-1}><div><span className="eyebrow">{uiText("A LITTLE HELP GETTING STARTED")}</span><h2>{uiText("Good questions.")}<br/>{uiText("Simple answers.")}</h2><p>{uiText("Everything you need for your first little discovery.")}</p></div><div className="public-faq-list">{[
          ['Who is LinguaKids for?','LinguaKids supports English–Filipino learning for Grades 1–6. Educators guide the experience through lessons, stories, word games, and quizzes.'],
          ['Does every child need an account?','No. An educator creates student profiles using a nickname, grade, and preset avatar. Children enter their learning space through the educator’s account.'],
          ['How do I save a student’s progress?','Open Students & missions, choose Continue assigned mission, and let the student complete their current task. Mission progress and quiz results appear in their student record. Teacher previews do not record student grades.'],
          ['Can I create my own learning materials?','Yes. Create lessons, stories, games, vocabulary materials, and quizzes. Keep a draft, share it with your classroom, or submit it for administrator review.'],
        ].map(([question,answer])=><details key={question}><summary>{question}<Icon name="plus" size={18}/></summary><p>{answer}</p></details>)}</div></section>
        <section className="public-closing"><span aria-hidden="true">✦</span><div><h2>{uiText("Great things start with")}<br/>{uiText("a little learning.")}</h2><p>{uiText("Your next classroom discovery is waiting.")}</p></div><Link className="button" to={user?homeFor(user):'/register'}>{user?uiText('Open my workspace'):uiText('Let’s get started')}<Icon name="arrow"/></Link>
        </section>
      </main>
      <footer>
        <Brand />
        <span>{uiText("English–Filipino learning for Grades 1–6")}</span>
        <Link to="/admin-login">{uiText("Administrator access")}</Link>
      </footer>
    </div>
  );
}
export function AuthLayout({ title, subtitle, children }) {
  useUiLanguage();
  return (
    <main className="auth-layout public-auth-refresh">
      <aside className="auth-aside">
        <Link to="/">
          <Brand />
        </Link>
        <div>
          <span className="eyebrow">{uiText("WELCOME TO LINGUAKIDS")}</span>
          <h1>{uiText("Growing minds.")}<br />{uiText("Brighter futures.")}</h1>
          <p>{uiText("A joyful place to learn English and Filipino, one discovery at a time.")}</p>
          <img
            src="/assets/landing-reading-garden-v1.webp"
            alt={uiText("A welcoming reading garden")}
          />
          <div className="auth-aside-note"><Icon name="spark" size={22}/><span>{uiText("Small steps.")}<strong>{uiText("Wonderful discoveries.")}</strong></span></div>
        </div>
        <small>{uiText("Created for Grades 1–6 · Guided by educators")}</small>
      </aside>
      <section className="auth-main">
        <Link className="back-link" to="/">
          <Icon name="back" />{uiText(" Back to home")}</Link>
        <div className="auth-card">
          <span className="public-auth-emblem" aria-hidden="true"><Icon name="book" size={27}/></span>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children}
        </div>
      </section>
    </main>
  );
}
export function Login({ admin = false }) {
  useUiLanguage();
  const { repository, user, setUser, authError, setAuthError } = useApp(),
    navigate = useNavigate(),
    location = useLocation();
  const [email, setEmail] = useState(() => !admin && typeof location.state?.educatorLogin === 'string' ? location.state.educatorLogin : ""),
    [password, setPassword] = useState(""),
    [sent, setSent] = useState(false);
  const action = useAction();
  useEffect(() => {
    if (
      user?.status === "active" &&
      user.role === (admin ? "administrator" : "educator")
    )
      navigate(homeFor(user), { replace: true });
  }, [user, admin, navigate]);
  async function submit(e) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const login = String(fields.get("username") ?? "").trim();
    const submittedPassword = String(fields.get("password") ?? "");
    setEmail(login);
    setPassword(submittedPassword);
    setAuthError("");
    await action.run(async () => {
      if (!login || !submittedPassword)
        throw new Error("Enter your email and password.");
      if (!admin && !isSectionLogin(login) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(login))
        throw new Error("Enter your complete email address.");
      const profile = await repository.signIn(
        login,
        submittedPassword,
        admin ? "administrator" : "educator",
      );
      setUser(profile);
      navigate(homeFor(profile));
    });
  }
  return (
    <AuthLayout
      title={admin ? uiText("Administrator login") : uiText("Welcome back, educator")}
      subtitle={
        admin
          ? "Manage your LinguaKids learning community."
          : "Your classroom is ready for its next discovery."
      }
    >
      {location.state?.passwordReset && <Notice>{uiText("Your password has been changed. Log in with your new password.")}</Notice>}
      <form onSubmit={submit} className="form-stack">
        <Field
          label={uiText("Email")}
          name="username"
          type={admin ? "email" : "text"}
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={admin ? undefined : uiText("Your educator email")}
          value={email}
          onChange={(e) => { setEmail(e.target.value); action.setError(""); setAuthError(""); }}
        />
        <Password
          name="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); action.setError(""); setAuthError(""); }}
        />
        <Link
          className="align-right"
          to={`/forgot-password?role=${admin ? "administrator" : "educator"}`}
          state={{ email }}
        >{uiText("Forgot password?")}</Link>
        {(action.error || authError) && (
          <Notice error>{uiText(action.error || authError)}</Notice>
        )}
        {isSectionLogin(email) && <Notice>{uiText("This section login has been removed. Use an active educator email address.")}</Notice>}
        {sent && (
          <Notice>{uiText("Confirmation email requested. Check your inbox and spam folder.")}</Notice>
        )}
        <Button disabled={action.busy || (admin && isSectionLogin(email))} type="submit">
          {action.busy ? uiText("Logging in…") : uiText("Log in")}
          <Icon name="arrow" />
        </Button>
      </form>
      {!admin && (
        <div className="educator-signup">
          <Link className="button secondary" to="/register">{uiText("Register as an educator")}</Link>
        </div>
      )}
      <div className="auth-links">
        <a href="/offline.html">{uiText("Open Offline Library")}</a>
        <Link to={admin ? "/login" : "/admin-login"}>
          {admin ? uiText("Educator login") : uiText("Administrator login")}
        </Link>
        <button
          className="text-button"
          disabled={!email || action.busy || isSectionLogin(email)}
          onClick={() =>
            action.run(async () => {
              await repository.resend(email);
              setSent(true);
            })
          }
        >{uiText("Resend confirmation email")}</button>
      </div>
    </AuthLayout>
  );
}
export function Register({ setup = false }) {
  useUiLanguage();
  const { repository, locked, child } = useApp(),
    action = useAction();
  const returnPath = setup ? "/admin-login" : locked ? "/adult-unlock" : "/login";
  const [sent, setSent] = useState(false),
    [selected, setSelected] = useState([]);
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [registrationParams]=useSearchParams();
  const [registeredEmail, setRegisteredEmail] = useState("");
  useEffect(()=>{
    const grade = Number(registrationParams.get('grade'));
    if (grades.includes(grade)) setSelected([grade]);
  }, [registrationParams]);

  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await action.run(async () => {
      const educatorName = String(form.get("name") ?? "").trim();
      const registrationEmail = setup ? repository.config.ADMIN_SETUP_EMAIL : String(form.get("email") ?? "").trim();
      if (!educatorName) throw new Error("Enter your full name.");
      requireMailbox(registrationEmail);
      if (form.get("new-password") !== form.get("confirm-password")) throw new Error("The passwords do not match.");
      if (!setup && selected.length !== 1)
        throw new Error("Choose one grade for this educator account.");
      await repository.register({
        name: educatorName,
        email: registrationEmail,
        password: form.get("new-password"),
        school_name: form.get("school") || "",
        grade_levels: setup ? [] : selected,
      });
      setRegisteredEmail(registrationEmail);
      setSent(true);
    });
  }
  return (
    <AuthLayout
      title={setup ? uiText("Administrator setup") : uiText("Register as an educator")}
      subtitle={
        setup
          ? "Only a verified administrator invitation can activate this account."
          : uiText("Register with your own email and choose the grade you teach.")
      }
    >
      {!setup && locked && child ? (
        <Notice>{uiText("An educator must exit the current student session before registering on this device.")}{" "}
          <Link to="/adult-unlock">{uiText("Return to educator controls")}</Link>
        </Notice>
      ) : setup && !repository.config.ADMIN_SETUP_EMAIL ? (
        <Notice>{uiText("Administrator setup is not configured.")}{" "}
          <Link to="/admin-login">{uiText("Open administrator login")}</Link>.
        </Notice>
      ) : sent ? (
        <Notice>{uiText("Check your email and open the confirmation link. Then log in using the password you chose.")}{" "}
          <Link to={returnPath} state={setup ? undefined : { educatorLogin: registeredEmail }}>{uiText("Go to login")}</Link>
        </Notice>
      ) : (
        <form onSubmit={submit} className="form-stack">
          <Field label={uiText("Full name")} name="name" required autoComplete="name" />
          <Field
            label={uiText("Email")}
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={setup ? repository.config.ADMIN_SETUP_EMAIL : ""}
            readOnly={setup}
          />
          {!setup && <small>{uiText("Use your own working email. Open its confirmation link before logging in.")}</small>}
          {!setup && (
            <>
              <Field label={uiText("School (optional)")} name="school" />
              <div className="registration-grades">
                <Field label={uiText("Grade you teach")}>
                  <select aria-label={uiText("Grade you teach")} value={selected[0]||""} required
                    disabled={action.busy}
                    onChange={e=>setSelected(e.target.value?[Number(e.target.value)]:[])}>
                    <option value="">{uiText("Select a grade")}</option>
                    {grades.map(grade=><option key={grade} value={grade}>
                      {uiText("Grade {0}",[grade])}
                    </option>)}
                  </select>
                </Field>
                <small>{uiText("Teachers can choose the same grade. Each account has its own classroom and student progress.")}</small>
              </div>
            </>
          )}
          <Password
            name="new-password"
            required
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Password
            label={uiText("Confirm password")}
            name="confirm-password"
            required
            minLength={12}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <small>{uiText("Use at least 12 characters for your password.")}</small>
          <label className="checkbox">
            <input type="checkbox" required />{uiText("I will use student profiles responsibly and review teaching materials before classroom use.")}</label>
          {action.error && <Notice error>{uiText(action.error)}</Notice>}
          <Button type="submit" disabled={action.busy}>
            {action.busy
              ? uiText("Creating account…")
              : uiText("Create account & verify email")}
          </Button>
          <Link to={returnPath}>{uiText("Already registered? Log in")}</Link>
        </form>
      )}
    </AuthLayout>
  );
}
export function ForgotPassword() {
  useUiLanguage();
  const { repository, authError } = useApp(),
    [params] = useSearchParams(),
    location = useLocation(),
    action = useAction();
  const [email, setEmail] = useState(location.state?.email || ""),
    [sent, setSent] = useState(false),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit(e) {
    e.preventDefault();
    await action.run(async () => {
      requireMailbox(email);
      await repository.resetEmail(email.trim());
      setSent(true);
      setCooldown(60);
    });
  }
  return (
    <AuthLayout
      title={sent ? uiText("Check your email") : uiText("Reset your password")}
      subtitle="Enter the email you used for LinguaKids."
    >
      {(params.has("expired") || authError) && (
        <Notice error>{uiText("This recovery link has expired or cannot be opened here. Request a new link below.")}</Notice>
      )}
      <form onSubmit={submit} className="form-stack">
        <Field
          label={uiText("Account email")}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {sent && (
          <Notice>{uiText("If this account exists, a reset link has been sent. Open the latest email in this same browser. Check spam too.")}</Notice>
        )}
        {action.error && <Notice error>{action.error}</Notice>}
        <Button disabled={action.busy || cooldown > 0} type="submit">
          {cooldown
            ? uiText("Resend in {0}s", [cooldown])
            : sent
              ? uiText("Resend reset link")
              : uiText("Send reset link")}
        </Button>
        <Link
          to={
            params.get("role") === "administrator" ? "/admin-login" : "/login"
          }
        >{uiText("Back to login")}</Link>
      </form>
    </AuthLayout>
  );
}
export function ResetPassword() {
  useUiLanguage();
  const { repository, recovery, user, setAuthError } = useApp(),
    navigate = useNavigate(),
    action = useAction();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  return (
    <AuthLayout
      title={recovery ? uiText("Choose your new password") : uiText("Open your recovery email")}
      subtitle="Use the latest secure link sent to your email."
    >
      {!recovery ? (
        <Link className="button" to="/forgot-password">{uiText("Request a new reset link")}</Link>
      ) : (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            action.run(async () => {
              if (password !== confirm)
                throw new Error("The passwords do not match.");
              const target =
                user?.role === "administrator" ? "/admin-login" : "/login";
              await repository.updatePassword(password);
              setAuthError("");
              navigate(target, { replace: true, state: { passwordReset: true } });
            });
          }}
        >
          <Password
            label={uiText("New password")}
            required
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Password
            label={uiText("Confirm password")}
            required
            minLength={12}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {action.error && <Notice error>{action.error}</Notice>}
          <Button disabled={action.busy} type="submit">
            {action.busy ? uiText("Saving…") : uiText("Save new password")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
export function AdultUnlock() {
  useUiLanguage();
  const { unlock, user, repository, childSession, lock } = useApp(),
    navigate = useNavigate(),
    location = useLocation(),
    action = useAction();
  if (repository.preview)
    return (
      <AuthLayout title={uiText("Return to the preview workspace")}>
        <p>{uiText("This demonstration has no account password.")}</p>
        <Button
          onClick={() => {
            childSession(null);
            lock(false);
            navigate(homeFor(user));
          }}
        >{uiText("Return to workspace")}</Button>
      </AuthLayout>
    );
  return (
    <AuthLayout
      title={uiText("Return to educator controls")}
      subtitle="Verify your account to leave student mode."
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          action.run(async () => {
            const profile = await unlock(f.get("email"), f.get("password"));
            navigate(homeFor(profile), { replace: true });
          });
        }}
      >
        <Field
          label={uiText("Educator email")}
          type="text"
          name="email"
          required
          defaultValue={location.state?.educatorLogin || user?.email || ""}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Password name="password" required autoComplete="current-password" />
        {action.error && <Notice error>{uiText(action.error)}</Notice>}
        <Button disabled={action.busy} type="submit">{uiText("Verify account and exit")}</Button>
      </form>
      <Link to="/forgot-password">{uiText("Forgot password?")}</Link>
      <div className="educator-signup">
        <Link className="button secondary" to="/register">{uiText("Register as an educator")}</Link>
      </div>
    </AuthLayout>
  );
}
