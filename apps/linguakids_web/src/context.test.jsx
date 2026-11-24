import { beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "./context";
import { useAction } from "./ui";

const owner = { id: "fixture-owner", role: "educator", status: "active" };
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
async function lockedContext(closeError, profile = owner) {
  localStorage.setItem("linguakids.adult_locked", "true");
  sessionStorage.setItem("linguakids.react.child", JSON.stringify({
    owner_id: owner.id, token: "fixture-student-token", child: { id: "fixture-child" },
  }));
  const repository = {
    subscribe: () => () => {},
    initialize: async () => ({ session: { user: { id: owner.id } } }),
    profile: async () => owner,
    preferences: async () => ({}),
    snapshot: async () => ({}),
    signIn: vi.fn(async () => profile),
    studentRpc: vi.fn(async () => { if (closeError) throw closeError; }),
  };
  const hook = renderHook(() => useApp(), {
    wrapper: ({ children }) => <AppProvider repository={repository}>{children}</AppProvider>,
  });
  await waitFor(() => expect(hook.result.current.user).toEqual(owner));
  return { ...hook, repository };
}
it("allows a verified owner to leave an expired student session", async () => {
  const { result, repository } = await lockedContext(Object.assign(new Error("Expired session"), { code: "42501" }));
  await act(async () => { await result.current.unlock("owner@example.test", "fixture-password"); });
  expect(repository.studentRpc).toHaveBeenCalledWith("close_child_session", {}, "fixture-student-token");
  expect(result.current.locked).toBe(false);
  expect(result.current.child).toBe(null);
  expect(sessionStorage.getItem("linguakids.react.child")).toBe(null);
});
it("keeps the student lock when verification uses another educator", async () => {
  const { result, repository } = await lockedContext(null, { ...owner, id: "another-educator" });
  await act(async () => {
    await expect(result.current.unlock("other@example.test", "fixture-password")).rejects.toThrow(/account that opened/);
  });
  expect(repository.studentRpc).not.toHaveBeenCalled();
  expect(result.current.locked).toBe(true);
});
it('clears a newly authenticated adult session when owner verification fails',async()=>{
 const {result,repository}=await lockedContext(null,{...owner,id:'another-educator'});
 repository.suspendAdultForStudent=vi.fn(async()=>{});
 await act(async()=>{await expect(result.current.unlock('other@example.test','fixture-password')).rejects.toThrow(/account that opened/);});
 expect(repository.suspendAdultForStudent).toHaveBeenCalled();expect(result.current.locked).toBe(true);
});
it("keeps the student lock when its session cannot be closed because the network failed", async () => {
  const { result } = await lockedContext(new TypeError("Network interrupted"));
  await act(async () => {
    await expect(result.current.unlock("owner@example.test", "fixture-password")).rejects.toThrow("Network interrupted");
  });
  expect(result.current.locked).toBe(true);
  expect(result.current.child).not.toBe(null);
});
it("prevents repeated actions from queuing duplicate work before React rerenders", async () => {
  const { result } = renderHook(() => useAction());
  let finish;
  const task = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  let first, second;
  act(() => {
    first = result.current.run(task);
    second = result.current.run(task);
  });
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await Promise.all([first, second]); });
  expect(result.current.busy).toBe(false);
  await act(async () => { await result.current.run(async () => {}); });
  expect(result.current.error).toBe("");
});

async function teacherHandoff(error){
 let receive;
 const repository={subscribe:fn=>{receive=fn;return()=>{};},initialize:async()=>({session:{user:{id:owner.id}}}),profile:async()=>owner,preferences:async()=>({}),snapshot:async()=>({children:[],materials:[],records:[],attempts:[]}),rpc:vi.fn(async()=>({token:'scoped-child-token',child:{id:'child'}})),studentRpc:vi.fn(async()=>null),suspendAdultForStudent:vi.fn(async()=>{if(error)throw error;receive({session:null,recovery:false});})};
 const hook=renderHook(()=>useApp(),{wrapper:({children})=><AppProvider repository={repository}>{children}</AppProvider>});
 await waitFor(()=>expect(hook.result.current.user).toEqual(owner));return {...hook,repository};
}
it('removes adult browser access before entering scoped student mode',async()=>{
 const {result,repository}=await teacherHandoff();
 await act(async()=>{await result.current.openStudent('child');});
 expect(repository.suspendAdultForStudent).toHaveBeenCalledTimes(1);
 expect(result.current.locked).toBe(true);expect(result.current.child.token).toBe('scoped-child-token');
 expect(result.current.child.owner_id).toBe(owner.id);
 await waitFor(()=>expect(result.current.user).toBe(null));
 expect(result.current.session).toBe(null);
});
it('does not hand over a device when adult sign-out cannot be confirmed',async()=>{
 const {result,repository}=await teacherHandoff(new Error('Synthetic sign-out failure'));
 await act(async()=>{await expect(result.current.openStudent('child')).rejects.toThrow('Synthetic sign-out failure');});
 expect(result.current.child).toBe(null);expect(result.current.locked).toBe(false);
 expect(repository.studentRpc).toHaveBeenCalledWith('close_child_session',{},'scoped-child-token');
});
it('clears an older saved adult session before displaying the persisted student session',async()=>{
 localStorage.setItem('linguakids.adult_locked','true');sessionStorage.setItem('linguakids.react.child',JSON.stringify({owner_id:owner.id,token:'scoped-child-token',child:{id:'child'}}));
 let receive;
 const repository={subscribe:fn=>{receive=fn;return()=>{};},initialize:async()=>({session:{user:{id:owner.id}}}),profile:async()=>owner,preferences:async()=>({}),suspendAdultForStudent:vi.fn(async()=>receive({session:null,recovery:false}))};
 const {result}=renderHook(()=>useApp(),{wrapper:({children})=><AppProvider repository={repository}>{children}</AppProvider>});
 await waitFor(()=>expect(result.current.ready).toBe(true));expect(repository.suspendAdultForStudent).toHaveBeenCalled();
 expect(result.current.session).toBe(null);expect(result.current.child.token).toBe('scoped-child-token');expect(result.current.locked).toBe(true);
});
it('keeps a deliberately verified teacher sign-in while finishing the adult return',async()=>{
 localStorage.setItem('linguakids.adult_locked','true');sessionStorage.setItem('linguakids.react.child',JSON.stringify({owner_id:owner.id,token:'scoped-child-token',child:{id:'child'}}));
 let receive,finishVerification;
 const repository={subscribe:fn=>{receive=fn;return()=>{};},initialize:async()=>({session:null}),profile:async()=>owner,preferences:async()=>({}),snapshot:async()=>({children:[],materials:[],records:[],attempts:[]}),studentRpc:vi.fn(async()=>null),suspendAdultForStudent:vi.fn(async()=>receive({session:null})),signIn:vi.fn(()=>{receive({session:{user:{id:owner.id}},recovery:false});return new Promise(resolve=>{finishVerification=()=>resolve(owner);});})};
 const {result}=renderHook(()=>useApp(),{wrapper:({children})=><AppProvider repository={repository}>{children}</AppProvider>});
 await waitFor(()=>expect(result.current.ready).toBe(true));let pending;
 await act(async()=>{pending=result.current.unlock('owner@example.test','fixture-password');});
 await waitFor(()=>expect(result.current.session?.user.id).toBe(owner.id));expect(repository.suspendAdultForStudent).not.toHaveBeenCalled();
 await act(async()=>{finishVerification();await pending;});
 expect(result.current.locked).toBe(false);expect(result.current.child).toBe(null);expect(result.current.session.user.id).toBe(owner.id);
});
