import { createClient } from "@supabase/supabase-js";
import { educatorLoginEmail, isSectionLogin, requireMailbox } from './section-logins';

export function createRepository(config) {
  if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY)
    throw new Error(
      "The public connection settings are missing. Open LinguaKids using its launcher.",
    );
  const client = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "linguakids.react.auth",
      },
    },
  );
  const listeners = new Set();
  let state = { session: null, recovery: false, error: null };
  const marker = "linguakids.react.recovery";
  const readMarker = (session) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(marker));
      return value?.user === session?.user.id && value.expires > Date.now();
    } catch {
      return false;
    }
  };
  // Subscribe at construction so the initial email callback cannot outrun React.
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session)
      sessionStorage.setItem(
        marker,
        JSON.stringify({
          user: session.user.id,
          expires: Date.now() + 3600000,
        }),
      );
    if (event === "SIGNED_OUT") sessionStorage.removeItem(marker);
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
    if (!session) return null;
    await rpc("claim_initial_administrator").catch(() => {});
    return unwrap(
      client
        .from("profiles")
        .select("id,email,name,role,status,school_name,grade_levels,account_kind,teacher_approved_at,registered_grade")
        .eq("id", session.user.id)
        .single(),
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
        throw new Error(typeof detail === 'string' ? detail : 'Speech is temporarily unavailable.');
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
    async initialize() {
      const { data, error } = await client.auth.getSession();
      if (error) {
        state = { ...state, error };
        return state;
      }
      state = {
        ...state,
        session: data.session,
        recovery: !!data.session && readMarker(data.session),
      };
      return state;
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
        if (code === 'email_not_confirmed') {
          throw new Error(
            "Verify your email before logging in. Check your inbox or contact support if you registered recently."
          );
        }
        throw error;
      }
      try {
        const user = await profile(result.session);
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
      try {
        await rpc("record_account_event", { p_event: "session_ended" });
      } finally {
        await client.auth.signOut();
      }
    },
    registrationGrades() {
      return unwrap(client.from('educator_grade_availability').select('grade_level,occupied').order('grade_level'));
    },
    register(data) {
      const { name, email, password, school_name, grade_levels, invitation_code } = data;
      requireMailbox(email);
      const setupInvite=config.ADMIN_SETUP_EMAIL && email.trim().toLowerCase()===config.ADMIN_SETUP_EMAIL.toLowerCase();
      if(!setupInvite && (!Array.isArray(grade_levels)||grade_levels.length!==1||![1,2,3,4,5,6].includes(grade_levels[0])))
        throw new Error('Choose one available grade for this educator account.');
      if(!setupInvite && !/^[a-f0-9]{64}$/i.test(invitation_code||''))throw new Error('Use the private teacher invitation from your administrator.');
      const grade=grade_levels?.[0];
      const gradeAvailable=async()=>{
        if(setupInvite)return;
        const flags=await unwrap(client.from('educator_grade_availability').select('grade_level,occupied').order('grade_level'));
        if(!flags.some(row=>row.grade_level===grade && !row.occupied))
          throw new Error(`Grade ${grade} already has an educator account. Sign in with the assigned account or contact your administrator.`);
      };
      return (async()=>{
        await gradeAvailable();
        if(!setupInvite && !await rpc('teacher_invitation_valid',{p_grade:grade,p_email:email.trim(),p_code:invitation_code.trim()}))
          throw new Error('This invitation is invalid, expired, or assigned to another email or grade. Contact your administrator.');
        try {return await emailRequest(
        client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: config.AUTH_REDIRECT_URL || window.location.origin,
            data: { name, school_name, grade_levels, ...(!setupInvite?{invitation_code:invitation_code.trim()}: {}) },
          },
        }),
      );} catch(error) {
        // Re-check after a simultaneous signup: the database unique index is authoritative.
        try {await gradeAvailable();} catch(availabilityError) {
          if(/already has an educator account/.test(availabilityError?.message||''))throw availabilityError;
        }
        throw error;
      }
      })();
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
      await unwrap(client.auth.updateUser({ password }));
      sessionStorage.removeItem(marker);
      await client.auth.signOut();
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
