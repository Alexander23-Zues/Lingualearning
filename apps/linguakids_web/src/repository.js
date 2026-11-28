import { createClient } from "@supabase/supabase-js";
import { educatorLoginEmail, isSectionLogin, requireMailbox } from './section-logins';
import { requireStrongPassword } from "./account-password";

export const schoolName = "Manihala Elementary School";

const authStorageKey = "linguakids.react.auth";
const verifyEmailMessage = "Please verify your email address before logging in.";

export function createRepository(config) {
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY)
    throw new Error(
      "The public connection settings are missing. Open LinguaKids using its launcher.",
    );
  const callbackUrl = new URL(window.location.href);
  const callbackSearch = callbackUrl.searchParams;
  const callbackHash = new URLSearchParams(callbackUrl.hash.slice(1));
  const googleCallback = callbackSearch.get("auth") === "google";
  const authCode = callbackSearch.get("code");
  const authLinkType = callbackSearch.get("type") || callbackHash.get("type");
  const authLinkError = callbackSearch.get("error") || callbackHash.get("error");
  const implicitSignupToken = authLinkType === "signup" ? callbackHash.get("access_token") : null;
  let resolvingEmailLink = Boolean(authCode || authLinkError || implicitSignupToken);
  let initialization;
  const client = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: authStorageKey,
      },
    },
  );
  const listeners = new Set();
  let state = { session: null, recovery: false, error: null };
  const marker = "linguakids.react.recovery";
  const readMarker = (session) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(marker));
      return value?.user === session?.user?.id && value?.expires > Date.now();
    } catch {
      return false;
    }
  };
  function markRecovery(session) {
    sessionStorage.setItem(marker, JSON.stringify({
      user: session.user.id,
      expires: Date.now() + 3600000,
    }));
  }
  // A confirmation link can mint a temporary session. Publish only the final
  // state after it is signed out, or identified as a password recovery session.
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) markRecovery(session);
    if (event === "SIGNED_OUT") sessionStorage.removeItem(marker);
    if (resolvingEmailLink) return;
    state = {
      session,
      recovery: !!session && readMarker(session),
      error: null,
    };
    listeners.forEach((listener) => listener(state));
  });
  const unwrap = async (promise) => {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  };
  async function clearLocalLinkSession() {
    try {
      await unwrap(client.auth.signOut({ scope: "local" }));
    } catch {
      localStorage.removeItem(authStorageKey);
    }
  }
  async function resolveEmailLink() {
    if (googleCallback && (authLinkError || !authCode)) return { type: "google-error" };
    if (authLinkError) return { type: authLinkType === "recovery" ? "recovery-error" : "link-error" };
    if (implicitSignupToken) {
      const { data, error } = await client.auth.getUser(implicitSignupToken);
      if (error || !data.user?.email_confirmed_at) return { type: "link-error" };
      await clearLocalLinkSession();
      return { type: "confirmed", email: data.user.email };
    }
    const { data, error } = await client.auth.exchangeCodeForSession(authCode);
    if (error) return { type: googleCallback ? "google-error" : "link-error" };
    if (data.redirectType === "recovery" || readMarker(data.session)) {
      markRecovery(data.session);
      return null;
    }
    if (googleCallback) {
      if (data.user?.email_confirmed_at && data.user.identities?.some(identity => identity.provider === "google"))
        return { type: "google" };
      await clearLocalLinkSession();
      return { type: "google-error" };
    }
    const verified = data.user?.email_confirmed_at;
    await clearLocalLinkSession();
    return verified ? { type: "confirmed", email: data.user.email } : { type: "link-error" };
  }
  function cleanEmailLink() {
    const url = new URL(window.location.href);
    for (const param of ["auth", "code", "sb_flow_id", "error", "error_code", "error_description"])
      url.searchParams.delete(param);
    if (!url.hash.startsWith("#/")) url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }
  const emailRequest = async promise => {
    try { return await unwrap(promise); }
    catch(error) {
      const code=error?.code ?? error?.error_code;
      if(['email_address_not_authorized','email_provider_disabled','email_send_failed','unexpected_failure','hook_timeout','hook_timeout_after_retry'].includes(code))
        throw new Error('Email delivery is currently unavailable. Contact your administrator for help.');
      if(['over_email_send_rate_limit','over_request_rate_limit'].includes(code) || error?.status===429)
        throw new Error('Too many email requests. Wait a few minutes before trying again.');
      if(error?.name==='AuthRetryableFetchError')
        throw new Error('Cannot reach the email service. Check your internet connection and try again.');
      throw error;
    }
  };
  const rpc = (name, parameters = {}) => unwrap(client.rpc(name, parameters));
  const profile = async (session) => {
    if (!session?.user?.email_confirmed_at) return null;
    await rpc("claim_initial_administrator").catch(() => {});
    return unwrap(
      client
        .from("profiles")
        .select("id,email,name,role,status,school_name,grade_levels,account_kind,teacher_approved_at,registered_grade")
        .eq("id", session.user.id)
        .maybeSingle(),
    );
  };
  async function api(path, body, { student = false, signal } = {}) {
    const headers = {};
    if (!student) {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error("Log in to continue.");
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    if (body && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    const response = await fetch(`${config.API_BASE_URL || ""}${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
      signal:
        signal || AbortSignal.timeout(body instanceof FormData ? 80000 : 30000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : `Request failed (${response.status}).`,
      );
    return data;
  }
  async function studentRpc(name, parameters, token) {
    // A separate fetch deliberately excludes the adult client's JWT.
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: config.SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token: token, ...parameters }),
      signal: AbortSignal.timeout(25000),
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(error => {
      if (response.ok) throw error;
      return {};
    });
    if (!response.ok)
      throw Object.assign(
        new Error(data.message || "Ask your educator to reopen your profile."),
        { code: data.code, status: response.status },
      );
    return data;
  }
  return {
    client,
    config,
    rpc,
    profile,
    api,
    async speechAudio(text, language, studentToken, signal, natural = false) {
      const headers = { 'Content-Type': 'application/json' };
      if (!studentToken && state.session?.access_token)
        headers.Authorization = `Bearer ${state.session.access_token}`;
      const endpoint = `${config.API_BASE_URL || ''}/v1/ai/${studentToken ? 'student-speak' : 'speak'}`;
      const requestSignal = signal && AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(27000)]) : signal || AbortSignal.timeout(27000);
      const options = {
        method: 'POST', headers,
        body: JSON.stringify({ text, language, ...(natural ? { natural: true } : {}), ...(studentToken ? { student_token: studentToken } : {}) }),
        signal: requestSignal,
      };
      let response = await fetch(endpoint, options);
      if ([502, 503, 504].includes(response.status) && !requestSignal.aborted) {
        await response.body?.cancel().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 600));
        response = await fetch(endpoint, options);
      }
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))).detail;
        throw Object.assign(new Error(typeof detail === 'string' ? detail : 'Speech is temporarily unavailable.'), {
          status: response.status,
          retryAfter: response.headers.get('Retry-After'),
        });
      }
      return response.blob();
    },
    async recordingAudio(archive,id){
      const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Log in to continue.');
      const response=await fetch(`${config.API_BASE_URL||''}/v1/offline/recordings/${encodeURIComponent(archive)}/${encodeURIComponent(id)}/audio`,{headers:{Authorization:`Bearer ${data.session.access_token}`}});
      if(!response.ok)throw new Error('The private recording could not be loaded.');return response.blob();
    },
    async downloadCollectionArchive(id){
      const {data,error}=await client.auth.getSession();if(error)throw error;if(!data.session)throw new Error('Log in to continue.');
      const response=await fetch(`${config.API_BASE_URL||''}/v1/offline/archives/${encodeURIComponent(id)}/download`,{headers:{Authorization:`Bearer ${data.session.access_token}`}});
      if(!response.ok)throw new Error('Private backup could not be downloaded. Keep the original local ZIP.');
      const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='LinguaKids-private-backup.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    },
    async health() {
      const response = await fetch(`${config.API_BASE_URL || ""}/health`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok)
        throw new Error("The learning service is not responding.");
      const value = await response.json();
      return value.status === "ok";
    },
    studentRpc,
    unwrap,
    initialize() {
      initialization ??= (async () => {
        let emailCallback;
        if (resolvingEmailLink) {
          try {
            emailCallback = await resolveEmailLink();
          } catch {
            emailCallback = { type: "link-error" };
          } finally {
            cleanEmailLink();
            resolvingEmailLink = false;
          }
        }
        const { data, error } = await client.auth.getSession();
        state = { session: data.session, recovery: !!data.session && readMarker(data.session), error, emailCallback };
        return state;
      })();
      return initialization;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async suspendAdultForStudent(){
      // Keep only the separately scoped child token on a handed-over browser.
      // Local scope leaves the teacher's other devices signed in.
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw new Error('Teacher sign-out could not be confirmed. Retry before handing this device to the learner.');
    },
    async signInWithGoogle() {
      const redirect = new URL(config.AUTH_REDIRECT_URL || window.location.origin);
      redirect.hash = "";
      redirect.searchParams.set("auth", "google");
      await unwrap(client.auth.signInWithOAuth({provider: "google", options: {
        redirectTo: redirect.href, queryParams: {prompt: "select_account"},
      }}));
    },
    async finishGoogleSignup(name, grade, password) {
      const session = (await unwrap(client.auth.getSession())).session;
      if (!session?.user?.email_confirmed_at || session.user.app_metadata?.provider !== "google")
        throw new Error("Sign in with Google to finish your educator profile.");
      if (await profile(session)) throw new Error("Your educator profile is already set up. Return to login.");
      if (!name || name.length > 160 || !Number.isInteger(grade) || grade < 1 || grade > 6)
        throw new Error("Enter your full name and choose a grade from 1 to 6.");
      requireStrongPassword(password);
      await unwrap(client.auth.updateUser({password}));
      await rpc("finish_google_educator_signup", {p_full_name:name, p_grade:grade});
      await rpc("record_account_event", {p_event:"session_started"}).catch(()=>{});
      return profile(session);
    },
    async signIn(email, password, role) {
      if(role === 'administrator' && isSectionLogin(email))
        throw new Error('This section login has been removed. Use an active account email.');
      const loginEmail = role === 'educator' ? educatorLoginEmail(email) : email.trim();
      let result;
      try {
        result = await unwrap(
          client.auth.signInWithPassword({ email: loginEmail, password }),
        );
      } catch (error) {
        const code = error?.code ?? error?.error_code;
        if (error?.status === 429) {
          throw new Error('Too many login attempts. Wait a few minutes before trying again.');
        }
        if (error?.name === 'AuthRetryableFetchError') {
          throw new Error('Cannot reach the login service. Check your internet connection and try again.');
        }
        if (code === 'email_not_confirmed') throw new Error(verifyEmailMessage);
        throw error;
      }
      try {
        if (!result.session?.user?.email_confirmed_at) throw new Error(verifyEmailMessage);
        const user = await profile(result.session);
        if (!user) throw new Error("Continue with Google to finish setting up your account.");
        if (user.status !== "active" || (role && user.role !== role)) {
          throw new Error(
            user.status !== "active"
              ? "This account is suspended. Contact your administrator."
              : `Use an ${role} account on this page.`,
          );
        }
        await rpc("record_account_event", { p_event: "session_started" });
        return user;
      } catch (error) {
        await client.auth.signOut({ scope: "local" });
        throw error;
      }
    },
    async signOut() {
      await rpc("record_account_event", { p_event: "session_ended" }).catch(() => {});
      await unwrap(client.auth.signOut({ scope: "local" }));
    },
    register({ name, email, password, grade_levels }) {
      requireMailbox(email);
      const setupInvite=config.ADMIN_SETUP_EMAIL && email.trim().toLowerCase()===config.ADMIN_SETUP_EMAIL.toLowerCase();
      if(!setupInvite && (!Array.isArray(grade_levels)||grade_levels.length!==1||![1,2,3,4,5,6].includes(grade_levels[0])))
        throw new Error('Choose one grade for this educator account.');
      name = (name || "").trim();
      if (!name || name.length > 160) throw new Error("Enter your full name (up to 160 characters).");
      requireStrongPassword(password);
      return emailRequest(
        client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: config.AUTH_REDIRECT_URL || window.location.origin,
            data: { name, school_name: schoolName, grade_levels },
          },
        }),
      ).then(async result => {
        if (result.session) {
          await clearLocalLinkSession();
          throw new Error("Email verification is unavailable. Contact your administrator for help.");
        }
        return { confirmationRequested: Boolean(result.user?.identities?.length) };
      });
    },
    resetEmail(email) {
      requireMailbox(email);
      return emailRequest(
        client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: config.AUTH_REDIRECT_URL || window.location.origin,
        }),
      );
    },
    resend(email) {
      requireMailbox(email);
      return emailRequest(
        client.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo: config.AUTH_REDIRECT_URL || window.location.origin,
          },
        }),
      );
    },
    async updatePassword(password) {
      if (!state.recovery) throw new Error("Open your password reset link before choosing a new password.");
      requireStrongPassword(password);
      await unwrap(client.auth.updateUser({ password }));
      await clearLocalLinkSession();
      sessionStorage.removeItem(marker);
    },
    async snapshot() {
      const value = await rpc("workspace_snapshot");
      if (!["materials", "records", "children", "attempts", "educators", "models"]
        .every(key => Array.isArray(value?.[key])))
        throw new Error("Your workspace could not be loaded. Try again or contact your administrator.");
      
      // Fetch model status from backend to check both environment and database
      try {
        const modelStatus = await api("/v1/model-status");
        value.model_status = modelStatus;
      } catch {
        // If model-status endpoint fails, fall back to database active_model
        value.model_status = value.active_model 
          ? { available: false, runtime_checked: false, source: "database", version: value.active_model.version, name: value.active_model.name }
          : { available: false, source: null, version: null };
      }
      
      return value;
    },
    async record(id) {
      return unwrap(client.from("workspace_records").select("*").eq("id", id).single());
    },
    async loadTable(name, order = "created_at") {
      if (name === "audit_logs")
        return unwrap(
          client
            .from(name)
            .select("*")
            .order(order, { ascending: false })
            .limit(200),
        );
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const page = await unwrap(
          client
            .from(name)
            .select("*")
            .order(order, { ascending: false })
            .range(offset, offset + 499),
        );
        rows.push(...page);
        if (page.length < 500) return rows;
      }
    },
    async saveTable(name, data, id) {
      return unwrap(
        id
          ? client.from(name).update(data).eq("id", id)
          : client.from(name).insert(data),
      );
    },
    preferences: (id) =>
      unwrap(
        client
          .from("educator_preferences")
          .select("*")
          .eq("educator_id", id)
          .single(),
      ),
    savePreferences: (id, values) =>
      unwrap(
        client
          .from("educator_preferences")
          .update(values)
          .eq("educator_id", id),
      ),
  };
}
