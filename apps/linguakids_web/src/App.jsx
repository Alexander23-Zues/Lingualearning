import { AccountModeBanner } from './grade-admissions';
import { uiText, useUiLanguage } from "./i18n";
import { useEffect } from "react";
import {
  HashRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AppProvider, useApp } from "./context";
import {
  AdultUnlock,
  ForgotPassword,
  GoogleSetup,
  Landing,
  Login,
  Register,
  ResetPassword,
} from "./auth";
import { CollectionBanner, CollectionCapture, CollectionPage } from "./collection";
import { Presentation, WorkspacePage, WorkspaceShell } from "./workspace";
import { StudentPage } from "./reader";
import { Button, Loading, Notice } from "./ui";

function PreviewAccess() {
  useUiLanguage();
  const { repository } = useApp(),
    navigate = useNavigate();
  return (
    <div className="preview-access panel">
      <h1>{uiText("LinguaKids")}</h1>
      <p>{uiText("Choose your workspace for local testing.")}</p>
      <div className="actions">
        {["educator", "administrator"].map((role) => (
          <Button
            key={role}
            onClick={async () => {
              await repository.enterPreview(role);
              navigate(
                role === "administrator"
                  ? "/workspace/overview"
                  : "/workspace/home",
              );
            }}
          >{uiText(role === 'educator' ? 'Educator' : 'Administrator')}
          </Button>
        ))}
      </div>
    </div>
  );
}
function PublicAccount({ children, registration = false }) {
  useUiLanguage();
  const { locked, child, repository, recovery } = useApp();
  if (repository.preview) return <PreviewAccess />;
  if (locked && !recovery && !registration)
    return <Navigate to={child ? "/student" : "/adult-unlock"} replace />;
  return children;
}
function AppRoutes() {
  useUiLanguage();
  const { ready, recovery, emailCallback, setEmailCallback, repository, locked } = useApp(),
    location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    if (!ready || !emailCallback || recovery) return;
    setEmailCallback(null);
    if (locked) return;
    const adminSetupEmail = repository.config?.ADMIN_SETUP_EMAIL;
    const admin = adminSetupEmail && adminSetupEmail.toLowerCase() === emailCallback.email?.toLowerCase();
    navigate(emailCallback.type === "google" ? "/google-setup" : emailCallback.type === "recovery-error" ? "/forgot-password?expired=1" : admin ? "/admin-login" : "/login", {
      replace: true,
      state: {
        educatorLogin: emailCallback.email,
        emailConfirmed: emailCallback.type === "confirmed",
        emailLinkError: emailCallback.type === "link-error",
        googleError: emailCallback.type === "google-error",
      },
    });
  }, [ready, emailCallback, recovery, locked, repository, setEmailCallback, navigate]);
  useEffect(() => {
    function key(e) {
      if (e.ctrlKey && e.shiftKey && e.code === "Digit9") {
        e.preventDefault();
        navigate(locked ? "/adult-unlock" : "/admin-login");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [navigate, locked]);
  if (!ready) return <Loading text="Opening LinguaKids…" />;
  if (recovery && location.pathname !== "/reset-password")
    return <Navigate to="/reset-password" replace />;
  if (emailCallback && !locked && !recovery) return <Loading text="Opening your email link…" />;
  return (
    <>
      {repository.preview && (
        <div className="preview-banner">{uiText("Local testing ·")}{" "}
          <Link to="/login">{uiText("Switch workspace")}</Link>
        </div>
      )}
      <AccountModeBanner/><CollectionBanner/><CollectionCapture/>
      <Routes>
        <Route path="/google-setup" element={<PublicAccount><GoogleSetup/></PublicAccount>}/>
        <Route path="/collection" element={<CollectionPage/>}/>
        <Route path="/" element={repository.preview ? <Navigate to={locked ? "/student" : "/login"} replace /> : <Landing />} />
        <Route
          path="/login"
          element={
            <PublicAccount>
              <Login />
            </PublicAccount>
          }
        />
        <Route
          path="/admin-login"
          element={
            <PublicAccount>
              <Login admin />
            </PublicAccount>
          }
        />
        <Route
          path="/register"
          element={
            <PublicAccount registration>
              <Register />
            </PublicAccount>
          }
        />
        <Route
          path="/admin-setup"
          element={
            <PublicAccount>
              <Register setup />
            </PublicAccount>
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/adult-unlock" element={<AdultUnlock />} />
        <Route path="/student" element={<StudentPage />} />
        <Route path="/presentation" element={<Presentation />} />
        <Route path="/workspace/reading" element={<Navigate to="/workspace/stories" replace />} />
        <Route path="/workspace/:section" element={<WorkspaceShell />}>
          <Route index element={<WorkspacePage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="panel">
              <Notice>{"This page is not available."}</Notice>
              <Link to="/">{"Return to LinguaKids"}</Link>
            </div>
          }
        />
      </Routes>
    </>
  );
}
export default function App({ repository }) {
  useUiLanguage();
  return (
    <AppProvider repository={repository}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppProvider>
  );
}
