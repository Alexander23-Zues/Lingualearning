import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ client: null }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mock.client),
}));
import { createRepository } from "./repository";
const config = {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  API_BASE_URL: "http://localhost:8010",
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mock.client = {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "adult-fixture-jwt" } },
      })),
      signOut: vi.fn(async () => ({})),
      getUser: vi.fn(async () => ({ data: { user: { email: "teacher@school.edu.ph", email_confirmed_at: "2026-11-27T12:00:00Z" } } })),
      signInWithPassword: vi.fn(async () => ({
        data: { session: { user: { id: "fixture-user", email_confirmed_at: "2026-11-27T12:00:00Z" } } },
      })),
      signInWithOAuth: vi.fn(async () => ({data:{}})),
      signUp: vi.fn(async () => ({ data: { user: { identities: [{ provider: "email" }] } } })),
      exchangeCodeForSession: vi.fn(),
      updateUser: vi.fn(async () => ({ data: {} })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {} })),
      resend: vi.fn(async () => ({ data: {} })),
    },
    rpc: vi.fn(async name => ({ data: name==='teacher_invitation_valid'?true:null })),
    from: vi.fn(table => table==='educator_grade_availability'?{select:()=>({order:async()=>({data:[1,2,3,4,5,6].map(grade_level=>({grade_level,occupied:false}))})})}:({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "fixture-user", role: "educator", status: "active" },
          }),
        }),
      }),
    })),
  };
});
describe("Connected repository", () => {
  it('ends only this browser adult session before student handoff and surfaces sign-out errors',async()=>{
    const repository=createRepository(config);await repository.suspendAdultForStudent();
    expect(mock.client.auth.signOut).toHaveBeenCalledWith({scope:'local'});
    mock.client.auth.signOut.mockResolvedValueOnce({error:new Error('Synthetic network failure')});
    await expect(repository.suspendAdultForStudent()).rejects.toThrow('Teacher sign-out could not be confirmed');
  });
  it('authenticates active emails and still verifies the password', async()=>{
    const repo=createRepository(config);
    for(const [login,email] of [
      ['grade1.teacher@example.org','grade1.teacher@example.org'],
      ['grade2.teacher@example.org','grade2.teacher@example.org'],
      ['grade3.teacher@example.org','grade3.teacher@example.org'],
      ['teacher4@example.org','teacher4@example.org'],
      ['teacher5@example.org','teacher5@example.org'],
      ['teacher6@example.org','teacher6@example.org'],
    ]){
      await repo.signIn(login,'fixture-password','educator');
      expect(mock.client.auth.signInWithPassword).toHaveBeenLastCalledWith({email,password:'fixture-password'});
    }
    mock.client.auth.signInWithPassword.mockResolvedValueOnce({error:{code:'invalid_credentials'}});
    await expect(repo.signIn('teacher@example.org','wrong-password','educator')).rejects.toMatchObject({code:'invalid_credentials'});
    mock.client.auth.signInWithPassword.mockResolvedValueOnce({error:{name:'AuthRetryableFetchError'}});
    await expect(repo.signIn('teacher@example.org','fixture-password','educator')).rejects.toThrow(/Check your internet connection/);
  });
  it('rejects section aliases on the administrator page and ambiguous sections before authentication',async()=>{
    const repo=createRepository(config);
      for(const alias of ['teacher1','TEACHER2','teacher3@linguakids.example'])
        await expect(repo.signIn(alias,'fixture','educator')).rejects.toThrow(/removed/);
      expect(mock.client.auth.signInWithPassword).not.toHaveBeenCalled();
    await expect(repo.signIn('malikhain','fixture','educator')).rejects.toThrow(/removed/);
    expect(mock.client.auth.signInWithPassword).not.toHaveBeenCalled();
    await expect(repo.signIn('mapagmahal@gmail.com','fixture','administrator')).rejects.toThrow(/removed/);
    expect(mock.client.auth.signInWithPassword).not.toHaveBeenCalled();
    await expect(repo.signIn('real-admin@example.org','fixture','administrator')).rejects.toThrow(/administrator/);
    expect(mock.client.auth.signInWithPassword).toHaveBeenLastCalledWith({email:'real-admin@example.org',password:'fixture'});
  });
  it('blocks email recovery and confirmation for non-mailbox section logins',()=>{
    const repo=createRepository(config);
    for(const method of ['resetEmail','resend'])expect(()=>repo[method]('mapagmahal@gmail.com')).toThrow(/no email inbox/);
  });
  it("never sends an adult JWT with student learning requests", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ materials: [] }),
    }));
    vi.stubGlobal("fetch", fetch);
    await createRepository(config).studentRpc(
      "student_learning_state",
      {},
      "student-fixture",
    );
    const [, request] = fetch.mock.calls[0];
    expect(request.headers).toEqual({
      apikey: "sb_publishable_fixture",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(request.body)).toEqual({ p_token: "student-fixture" });
    expect(mock.client.auth.getSession).not.toHaveBeenCalled();
  });
  it("accepts empty success responses when closing a session or saving a word", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const repo = createRepository(config);
    await expect(repo.studentRpc("close_child_session", {}, "student-fixture")).resolves.toBeNull();
    await expect(repo.studentRpc("student_save_vocabulary", { p_material_id: "fixture" }, "student-fixture")).resolves.toBeNull();
  });
  it("uses only a user session token for protected API calls", async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal("fetch", fetch);
    await createRepository(config).api("/v1/ai/jobs");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer adult-fixture-jwt",
    );
  });
  it("rejects a wrong-role login before an account-start event is recorded", async () => {
    const repo = createRepository(config);
    await expect(
      repo.signIn("a@school.edu.ph", "fixture", "administrator"),
    ).rejects.toThrow(/administrator/);
    expect(mock.client.auth.signOut).toHaveBeenCalled();
    expect(mock.client.rpc).not.toHaveBeenCalledWith(
      "record_account_event",
      expect.anything(),
    );
  });
  it("does not request an administrator role in public registration metadata", async () => {
    await createRepository(config).register({
      name: "Teacher",
      email: " a@school.edu.ph ",
      password: "Fixture-password!2",
      school_name: "Manihala Elementary School",
      grade_levels: [1], invitation_code: "a".repeat(64),
      role: "administrator",
    });
    const [body] = mock.client.auth.signUp.mock.calls[0];
    expect(body.email).toBe("a@school.edu.ph");
    expect(body.options.data).toEqual({
      name: "Teacher",
      school_name: "Manihala Elementary School",
      grade_levels: [1],
    });
  });
  it("keeps existing classroom aliases out of educator registration", () => {
    const repo = createRepository(config);
    expect(() => repo.register({email: "malikhain4@gmail.com"})).toThrow(/removed/);
    expect(mock.client.auth.signUp).not.toHaveBeenCalled();
  });
  it("captures initial recovery before a React subscriber attaches and clears it on sign-out", async () => {
    const repo = createRepository(config),
      callback = mock.client.auth.onAuthStateChange.mock.calls[0][0];
    const session = { user: { id: "fixture-user" } };
    callback("PASSWORD_RECOVERY", session);
    mock.client.auth.getSession.mockResolvedValue({ data: { session } });
    expect((await repo.initialize()).recovery).toBe(true);
    callback("SIGNED_OUT", null);
    expect(sessionStorage.getItem("linguakids.react.recovery")).toBe(null);
  });

  it("keeps student authorization errors distinct from a broken network", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 403,
      json: async () => ({ code: "42501", message: "Ask an adult to reopen your learning profile" }),
    })));
    await expect(createRepository(config).studentRpc("close_child_session", {}, "expired-fixture"))
      .rejects.toMatchObject({ code: "42501", status: 403 });
  });

  it("shows a recoverable error if a broken workspace endpoint returns counts instead of learning records", async () => {
    mock.client.rpc.mockResolvedValue({ data: { educators: 3, materials: 156 } });
    await expect(createRepository(config).snapshot()).rejects.toThrow(/workspace could not be loaded/);
  });
});

it('uses real email confirmation and recovery redirects and reports delivery failures',async()=>{
  const repo=createRepository({...config,AUTH_REDIRECT_URL:'https://school.example.org'});
  await repo.resetEmail(' teacher@school.edu.ph ');
  expect(mock.client.auth.resetPasswordForEmail).toHaveBeenCalledWith('teacher@school.edu.ph',{redirectTo:'https://school.example.org'});
  mock.client.auth.resetPasswordForEmail.mockResolvedValueOnce({error:{code:'email_address_not_authorized'}});
  await expect(repo.resetEmail('teacher@school.edu.ph')).rejects.toThrow(/Email delivery is currently unavailable/);
  mock.client.auth.signUp.mockResolvedValueOnce({error:{code:'over_email_send_rate_limit'}});
  await expect(repo.register({name:'Teacher',email:'teacher@school.edu.ph',school_name:'School',password:'Fixture-password!2',grade_levels:[1]})).rejects.toThrow(/Too many email requests/);
});
it('rejects placeholder inboxes before any signup or reset request',()=>{
  const repo=createRepository(config);
  for(const email of ['teacher@linguakids.example','teacher@example.org','no-email']){
    expect(()=>repo.register({email})).toThrow();
    expect(()=>repo.resetEmail(email)).toThrow();
  }
  expect(mock.client.auth.signUp).not.toHaveBeenCalled();
  expect(mock.client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
});

it('sends two distinct teacher signups for the same grade to Auth',async()=>{
  const repo=createRepository(config);
  for (const email of ['teacher@school.edu.ph', 'another@school.edu.ph']) {
    await repo.register({name:'Teacher',email,school_name:'School',password:'Fixture-password!2',grade_levels:[1]});
    expect(mock.client.auth.signUp).toHaveBeenLastCalledWith(expect.objectContaining({
      email, options:expect.objectContaining({data:expect.objectContaining({grade_levels:[1]})}),
    }));
  }
  expect(mock.client.auth.signUp).toHaveBeenCalledTimes(2);
  expect(mock.client.from).not.toHaveBeenCalledWith('educator_grade_availability');
});

it('requires exactly one supported grade before sending a teacher signup',()=>{
  const repo=createRepository(config);
  for (const grade_levels of [[],[1,2],[7],[1.5],['Other']]) {
    expect(()=>repo.register({email:'teacher@school.edu.ph',grade_levels})).toThrow(/Choose one grade/);
  }
  expect(mock.client.auth.signUp).not.toHaveBeenCalled();
});

it('registers directly without calling invitation validation or forwarding approval metadata',async()=>{
 const repo=createRepository(config);
 await repo.register({name:'Teacher',email:'teacher@school.edu.ph',password:'Fixture-password!2',school_name:'School',grade_levels:[1],invitation_code:'legacy-code',role:'administrator',teacher_approved_by:'forged'});
 expect(mock.client.rpc).not.toHaveBeenCalledWith('teacher_invitation_valid',expect.anything());
 expect(mock.client.auth.signUp).toHaveBeenCalledWith({email:'teacher@school.edu.ph',password:'Fixture-password!2',options:{emailRedirectTo:window.location.origin,data:{name:'Teacher',school_name:'Manihala Elementary School',grade_levels:[1]}}});
});

it("blocks missing school, weak passwords, and misleading success for an obfuscated signup", async () => {
  const repo = createRepository(config);
  const fields = { name: "Teacher", email: "teacher@school.edu.ph", school_name: "School", password: "Fixture-password!2", grade_levels: [6] };
  expect(() => repo.register({ ...fields, password: "letters-only" })).toThrow(/uppercase and lowercase/);
  expect(mock.client.auth.signUp).not.toHaveBeenCalled();
  mock.client.auth.signUp.mockResolvedValueOnce({ data: { user: { identities: [] } } });
  await expect(repo.register(fields)).resolves.toEqual({ confirmationRequested: false });
});

it("does not open a workspace for an unverified login", async () => {
  const repo = createRepository(config);
  mock.client.auth.signInWithPassword.mockResolvedValueOnce({ error: { code: "email_not_confirmed" } });
  await expect(repo.signIn("teacher@school.edu.ph", "Fixture-password!2", "educator"))
    .rejects.toThrow("Please verify your email address before logging in.");
  expect(mock.client.from).not.toHaveBeenCalled();
});

it("exchanges a verification code only once and clears the temporary session before returning the confirmation", async () => {
  window.history.replaceState(null, "", "/?code=verification-fixture&sb_flow_id=fixture#/");
  const user = { email: "teacher@school.edu.ph", email_confirmed_at: "2026-11-27T12:00:00Z" };
  mock.client.auth.exchangeCodeForSession.mockResolvedValue({ data: { user, session: { user } } });
  mock.client.auth.getSession.mockResolvedValue({ data: { session: null } });
  const repo = createRepository(config);
  const expected = { session: null, emailCallback: { type: "confirmed", email: user.email } };
  await expect(repo.initialize()).resolves.toMatchObject(expected);
  await expect(repo.initialize()).resolves.toMatchObject(expected);
  expect(mock.client.auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("verification-fixture");
  expect(mock.client.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("#/");
});

it("clears a legacy implicit verification session before requiring password login", async () => {
  window.history.replaceState(null, "", "/#access_token=verification-fixture&type=signup");
  mock.client.auth.getSession.mockResolvedValue({ data: { session: null } });
  const repo = createRepository(config);
  await expect(repo.initialize()).resolves.toMatchObject({
    session: null,
    emailCallback: { type: "confirmed", email: "teacher@school.edu.ph" },
  });
  expect(mock.client.auth.getUser).toHaveBeenCalledExactlyOnceWith("verification-fixture");
  expect(mock.client.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
});

it("keeps a verified recovery session for reset and signs it out after updating the password", async () => {
  window.history.replaceState(null, "", "/?code=recovery-fixture#/");
  const user = { id: "fixture-user", email_confirmed_at: "2026-11-27T12:00:00Z" };
  const session = { user };
  mock.client.auth.getSession.mockResolvedValue({ data: { session } });
  mock.client.auth.exchangeCodeForSession.mockResolvedValue({ data: { user, session, redirectType: "recovery" } });
  const repo = createRepository(config);
  await expect(repo.updatePassword("Fixture-password!2")).rejects.toThrow(/Open your password reset link/);
  await expect(repo.initialize()).resolves.toMatchObject({ session, recovery: true });
  expect(mock.client.auth.signOut).not.toHaveBeenCalled();
  await repo.updatePassword("Fixture-password!2");
  expect(mock.client.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: "Fixture-password!2" });
  expect(mock.client.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
});
it("keeps a verified Google callback session without treating it as email confirmation", async () => {
  window.history.replaceState(null, "", "/?auth=google&code=google-fixture");
  try {
    const user={id:"fixture-user",email_confirmed_at:"2026-11-27",identities:[{provider:"google"}]};
    const session={user};
    mock.client.auth.exchangeCodeForSession.mockResolvedValue({data:{user,session}});
    mock.client.auth.getSession.mockResolvedValue({data:{session}});
    const repo=createRepository(config);
    await repo.signInWithGoogle();
    expect(mock.client.auth.signInWithOAuth).toHaveBeenCalledWith({provider:"google",options:{
      redirectTo:window.location.origin+"/?auth=google",queryParams:{prompt:"select_account"},
    }});
    expect(await repo.initialize()).toMatchObject({session,emailCallback:{type:"google"}});
    expect(mock.client.auth.signOut).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  } finally {window.history.replaceState(null,"","/");}
});
