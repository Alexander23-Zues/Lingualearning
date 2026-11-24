import { useUiLanguage, setUiLanguage } from "./i18n";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { scopeWorkspace } from './grade-scope';
import { errorText } from "./domain";
import { educatorLoginEmail } from "./section-logins";
import { configureSpeech, stopSpeech } from './speech';

const Context = createContext(null);
export function useApp() {
  return useContext(Context);
}
export function AppProvider({ repository, children }) {
  useUiLanguage();
  const [session, setSession] = useState(null),
    [user, setUser] = useState(null),
    [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false),
    [authError, setAuthError] = useState("");
  const [locked, setLockedState] = useState(
    () =>
      localStorage.getItem("linguakids.adult_locked") === "true" ||
      localStorage.getItem("flutter.linguakids.adult_locked") === "true",
  );
  const [child, setChildState] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("linguakids.react.child"));
    } catch {
      return null;
    }
  });
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [dataError, setDataError] = useState("");
  const version = useRef(0),
    mounted = useRef(true);
  const snapshotVersion = useRef(0),
    subject = useRef(null);
  const unlocking=useRef(false);
  useEffect(() => {
    configureSpeech((text, language, signal, natural) => {
      if (locked && !child?.token) throw new Error("Ask an adult to reopen your learning profile.");
      return repository.speechAudio(text, language, locked ? child.token : null, signal, natural);
    }, locked ? child?.token : session?.user.id);
    return () => { configureSpeech(null); stopSpeech(); };
  }, [repository, locked, child, session?.user.id]);
  useEffect(() => {
    mounted.current = true;
    function receive(state) {
      if (!mounted.current) return;
      const id = state.session?.user.id || null;
      if (subject.current !== id) {
        subject.current = id;
        version.current++;
        snapshotVersion.current++;
        setUser(null);
        setData(null);
        setDataError("");
      }
      setSession(state.session);
      setRecovery(state.recovery);
      if (state.error) setAuthError(errorText(state.error));
    }
    const unsubscribe = repository.subscribe(receive);
    repository
      .initialize()
      .then(receive)
      .catch((e) => setAuthError(errorText(e)))
      .finally(() => {
        if (mounted.current) setReady(true);
      });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [repository]);
  useEffect(() => {
    const current = ++version.current;
    if (!session) {
      setUser(null);
      return;
    }
    repository
      .profile(session)
      .then((profile) => {
        if (version.current === current) setUser(profile);
      })
      .catch((e) => {
        if (version.current === current) {
          setUser(null);
          setAuthError(errorText(e));
        }
      });
  }, [session, repository]);
  const refresh = useCallback(async () => {
    if (!user || user.status !== "active" || locked) return;
    const current = ++snapshotVersion.current;
    setLoading(true);
    setDataError("");
    try {
      const snapshot = await repository.snapshot();
      if (mounted.current && snapshotVersion.current === current)
        setData(scopeWorkspace(snapshot,user));
    } catch (e) {
      if (mounted.current && snapshotVersion.current === current)
        setDataError(errorText(e));
    } finally {
      if (mounted.current && snapshotVersion.current === current)
        setLoading(false);
    }
  }, [repository, user, locked]);
  useEffect(() => {
    if (locked || user?.status !== "active") return;
    const retry = () => refresh();
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [refresh, locked, user?.status]);
  useEffect(() => {
    let active = true;
    if (!user) {
      document.documentElement.style.fontSize = "16px";
      document.documentElement.dataset.muted = "false";
      document.documentElement.dataset.reducedMotion = "false";
      setUiLanguage("en");
      return;
    }
    repository
      .preferences(user.id)
      .then((prefs) => {
        if (!active) return;
        document.documentElement.style.fontSize = `${Math.max(0.8, Math.min(2, Number(prefs.text_scale) || 1)) * 16}px`;
        document.documentElement.dataset.reducedMotion = String(
          !!prefs.reduced_motion,
        );
        document.documentElement.dataset.muted = String(!!prefs.muted);
        setUiLanguage(prefs.locale);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [repository, user?.id]);
  useEffect(() => {
    snapshotVersion.current++;
    setData(null);
    if (user && !locked) refresh();
  }, [user?.id, user?.status, locked]);
  function lock(value) {
    snapshotVersion.current++;
    localStorage.setItem("linguakids.adult_locked", String(value));
    localStorage.setItem("flutter.linguakids.adult_locked", String(value));
    setLockedState(value);
  }
  function childSession(value) {
    if (value)
      sessionStorage.setItem("linguakids.react.child", JSON.stringify(value));
    else sessionStorage.removeItem("linguakids.react.child");
    setChildState(value);
  }
  // Upgrade an older locked browser before rendering the student workspace.
  // New handoffs already clear the adult session in openStudent below.
  const clearingLegacyAdult = Boolean(!unlocking.current && locked && child?.token && session && repository.suspendAdultForStudent);
  useEffect(()=>{
    if(!ready || !clearingLegacyAdult)return;
    let active=true;
    repository.suspendAdultForStudent().then(()=>{
      if(active){setSession(null);setUser(null);}
    }).catch(error=>{
      if(active){childSession(null);setAuthError(errorText(error));}
    });
    return()=>{active=false;};
  },[ready,clearingLegacyAdult,repository,child?.token,session?.user.id]);
  async function openStudent(id, activityId) {
    const opened = await repository.rpc("open_child_session", {
      p_child_id: id,
    });
    opened.owner_id = user.id;
    if (activityId) opened.initial_activity_id = activityId;
    try {
      if(repository.suspendAdultForStudent)await repository.suspendAdultForStudent();
    } catch(error) {
      try{await repository.studentRpc('close_child_session',{},opened.token);}catch{}
      throw error;
    }
    childSession(opened);
    lock(true);
    return opened;
  }
  async function unlock(email, password) {
    unlocking.current=true;
    try {
    const profile = await repository.signIn(educatorLoginEmail(email), password);
    try {
    if (
      child?.owner_id &&
      child.owner_id !== profile.id &&
      profile.role !== "administrator"
    )
      throw new Error("Use the educator account that opened this profile.");
    if (child) {
      try {
        await repository.studentRpc("close_child_session", {}, child.token);
      } catch (error) {
        // Invalid, expired and revoked tokens are already unusable. Adult
        // verification and the owner check above still have to succeed.
        if (error.code !== "42501") throw error;
      }
    }
    childSession(null);
    lock(false);
    setUser(profile);
    return profile;
    } catch(error) {
      // A successful password check may already have installed an adult JWT.
      // Do not leave that session behind if ownership or session closure fails.
      if(repository.suspendAdultForStudent){
        try{await repository.suspendAdultForStudent();}
        catch(signOutError){childSession(null);setAuthError(errorText(signOutError));}
      }
      throw error;
    }
    } finally {unlocking.current=false;}
  }
  return (
    <Context.Provider
      value={{
        repository,
        session,
        user,
        setUser,
        ready:ready&&!clearingLegacyAdult,
        recovery,
        authError,
        setAuthError,
        locked,
        lock,
        child,
        childSession,
        openStudent,
        unlock,
        data,
        loading,
        dataError,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
