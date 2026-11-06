import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/utils/newOrderPoller.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let token = 'session-a', count = 0, nextNight, nextContext, interval;
  const toasts = [], events = [], contexts = [];
  let nightCalls = 0;
  const api = { businessContext: async () => nextContext ? nextContext() : { staffId: token, hasNightStore: true }, nightOrders: async () => { nightCalls++; return nextNight ? nextNight() : { total: count }; }, tasksPage: async () => ({ total: 0 }), availableTasks: async () => [] };
  const exports = {};
  vm.runInNewContext(compiled, { exports, Promise, uni: { getStorageSync: () => token, vibrateShort() {}, showToast: value => toasts.push(value.title), $emit: event => events.push(event) }, setInterval: fn => { interval = fn; return 1; }, clearInterval: () => { interval = undefined; }, require(name) { if (name === '../api') return { api }; if (name === '../stores/session') return { useSessionStore: () => ({ role: 'building-manager' }) }; if (name === '../types') return { isManagerRole: role => ['building-manager', 'intern-building-manager'].includes(role) }; if (name === './nightMode') return { syncWorkspaceMode: context => contexts.push(context.staffId) }; throw new Error(name); } });
  return { module: exports, toasts, events, contexts, tick: async () => { interval?.(); await flush(); }, setToken: value => { token = value; }, setCount: value => { count = value; }, setNight: value => { nextNight = value; }, setContext: value => { nextContext = value; }, get nightCalls() { return nightCalls; } };
}
test('首次前台拉取不误报，待接单增加才通知并广播刷新，稳定数量不重复提示', async () => {
  const f = fixture(); f.setCount(1); f.module.startPolling(); await flush();
  assert.deepEqual(f.toasts, []);
  f.setCount(2); await f.tick(); await f.tick();
  assert.deepEqual(f.toasts, ['夜宵店有 2 单待接单']); assert.deepEqual(f.events, ['night:new-orders']);
  f.module.stopPolling();
});
test('账号切换时丢弃旧账号在途订单响应，新账号重新建立提醒基线', async () => {
  const f = fixture(); f.module.startPolling(); await flush();
  let resolve; f.setNight(() => new Promise(done => { resolve = done; })); await f.tick();
  f.setToken('session-b'); resolve({ total: 5 }); await flush();
  assert.deepEqual(f.toasts, []); assert.deepEqual(f.events, []);
  f.setNight(undefined); f.setCount(1); await f.tick(); assert.deepEqual(f.toasts, []);
  f.setCount(2); await f.tick(); assert.equal(f.toasts.length, 1);
  f.module.stopPolling();
});
test('离开前台后在途上下文不再改变工作台或请求订单，恢复前台仍能轮询', async () => {
  const f = fixture(); let resolve;
  f.setContext(() => new Promise(done => { resolve = done; })); f.module.startPolling();
  f.module.stopPolling(); resolve({ staffId: 'old', hasNightStore: true }); await flush();
  assert.equal(f.nightCalls, 0); assert.deepEqual(f.contexts, []);
  f.setContext(undefined); f.module.startPolling(); await flush(); assert.equal(f.nightCalls, 1);
  f.module.stopPolling();
});
test('请求变慢时不重叠发起轮询，完成后下一轮可正常刷新', async () => {
  const f = fixture(); let resolve;
  f.setNight(() => new Promise(done => { resolve = done; })); f.module.startPolling(); await flush();
  await f.tick(); await f.tick(); assert.equal(f.nightCalls, 1);
  resolve({ total: 0 }); await flush(); f.setNight(undefined); await f.tick(); assert.equal(f.nightCalls, 2);
  f.module.stopPolling();
});
