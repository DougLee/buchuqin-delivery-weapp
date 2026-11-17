import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/utils/newOrderPoller.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let token = 'session-a', count = 0, dayCount = 0, nextDay, nextNight, nextContext, interval, role = 'building-manager';
  const toasts = [], events = [], contexts = [];
  let nightCalls = 0, tasksCalls = 0;
  const api = { businessContext: async () => nextContext ? nextContext() : { staffId: token, hasNightStore: true, nightEnabled: true }, nightOrders: async () => { nightCalls++; return nextNight ? nextNight() : { total: count }; }, tasksPage: async () => { tasksCalls++; return nextDay ? nextDay() : { total: dayCount }; }, availableTasks: async () => Array(dayCount).fill({}) };
  const exports = {};
  vm.runInNewContext(compiled, { exports, Promise, uni: { getStorageSync: () => token, vibrateShort() {}, showToast: value => toasts.push(value.title), $emit: event => events.push(event) }, setInterval: fn => { interval = fn; return 1; }, clearInterval: () => { interval = undefined; }, require(name) { if (name === '../api') return { api }; if (name === '../stores/session') return { useSessionStore: () => ({ role }) }; if (name === '../types') return { isManagerRole: role => ['building-manager', 'intern-building-manager'].includes(role) }; if (name === './nightMode') return { syncWorkspaceMode: context => contexts.push(context.staffId) }; throw new Error(name); } });
  return { module: exports, toasts, events, contexts, tick: async () => { interval?.(); await flush(); }, setToken: value => { token = value; }, setCount: value => { count = value; }, setDayCount: value => { dayCount = value; }, setDay: value => { nextDay = value; }, setRole: value => { role = value; }, setNight: value => { nextNight = value; }, setContext: value => { nextContext = value; }, get nightCalls() { return nightCalls; }, get tasksCalls() { return tasksCalls; } };
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

test('未开通且无历史不请求夜宵订单，白天待接货仍正常轮询', async () => {
  const f=fixture();f.setContext(async()=>({staffId:'manager',hasNightStore:true,nightEnabled:false,hasNightHistory:false}));
  f.module.startPolling();await flush();assert.equal(f.nightCalls,0);assert.equal(f.tasksCalls,1);f.module.stopPolling();
});

test('夜宵上下文失败时白天仍提醒并持续轮询，恢复后正常检查夜单', async () => {
  const f = fixture(); f.setContext(async () => { throw Error('context unavailable'); });
  f.module.startPolling(); await flush();
  f.setDayCount(2); await f.tick(); await f.tick();
  assert.equal(f.tasksCalls, 3); assert.equal(f.nightCalls, 0);
  assert.deepEqual(f.events, ['ikdnvw:new-orders']);
  f.setContext(undefined); await f.tick(); assert.equal(f.nightCalls, 1);
  f.module.stopPolling();
});

test('夜单失败不阻止白天新待办提醒，恢复后双方独立去重', async () => {
  const f = fixture(); f.module.startPolling(); await flush();
  f.setNight(async () => { throw Error('night unavailable'); });
  f.setDayCount(1); await f.tick();
  assert.deepEqual(f.events, ['ikdnvw:new-orders']);
  f.setNight(undefined); f.setCount(1); await f.tick(); await f.tick();
  assert.deepEqual(f.events, ['ikdnvw:new-orders', 'night:new-orders']);
  f.module.stopPolling();
});

test('夜宵上下文一直等待时白天每轮照常检查，不重复请求上下文', async () => {
  const f = fixture(); let resolve, calls = 0;
  f.setContext(() => { calls++; return new Promise(done => { resolve = done; }); });
  f.module.startPolling(); await flush();
  f.setDayCount(1); await f.tick(); f.setDayCount(2); await f.tick();
  assert.equal(calls, 1); assert.equal(f.tasksCalls, 3);
  assert.deepEqual(f.events, ['ikdnvw:new-orders', 'ikdnvw:new-orders']);
  resolve({ hasNightStore: false }); await flush(); f.module.stopPolling();
});

test('夜单等待或超时不拖住白天下一轮，超时后夜单可重新请求', async () => {
  const f = fixture(); let reject;
  f.setNight(() => new Promise((_resolve, fail) => { reject = fail; }));
  f.module.startPolling(); await flush();
  f.setDayCount(1); await f.tick(); await f.tick();
  assert.equal(f.nightCalls, 1); assert.equal(f.tasksCalls, 3);
  assert.deepEqual(f.events, ['ikdnvw:new-orders']);
  reject(Error('timeout')); await flush(); f.setNight(undefined); await f.tick();
  assert.equal(f.nightCalls, 2); f.module.stopPolling();
});

test('白天请求失败或等待时，夜宵仍独立更新与重试', async () => {
  const f = fixture(); let resolve;
  f.setDay(() => new Promise(done => { resolve = done; }));
  f.module.startPolling(); await flush();
  f.setCount(1); await f.tick();
  assert.equal(f.tasksCalls, 1); assert.equal(f.nightCalls, 2);
  assert.deepEqual(f.events, ['night:new-orders']);
  resolve({ total: 0 }); await flush();
  f.setDay(async () => { throw Error('day unavailable'); });
  f.setCount(2); await f.tick();
  assert.deepEqual(f.events, ['night:new-orders', 'night:new-orders']);
  f.setDay(undefined); f.setDayCount(1); await f.tick(); await f.tick();
  assert.deepEqual(f.events, ['night:new-orders', 'night:new-orders', 'ikdnvw:new-orders']);
  f.module.stopPolling();
});

test('切号无需等旧夜单结束，旧响应和旧finally不能覆盖新轮询', async () => {
  const f = fixture(); const pending = [];
  f.setNight(() => new Promise(resolve => pending.push(resolve)));
  f.module.startPolling(); await flush();
  f.setToken('session-b'); await f.tick(); assert.equal(f.nightCalls, 2);
  pending[0]({ total: 99 }); await flush(); await f.tick();
  assert.equal(f.nightCalls, 2); assert.deepEqual(f.events, []);
  pending[1]({ total: 1 }); await flush(); f.setNight(undefined); f.setCount(2); await f.tick();
  assert.deepEqual(f.toasts, ['夜宵店有 2 单待接单']); f.module.stopPolling();
});

test('切后台后的白天晚到响应不提醒，重新进入首拍重新建立基线', async () => {
  const f = fixture(); let resolve;
  f.module.startPolling(); await flush();
  f.setDay(() => new Promise(done => { resolve = done; })); await f.tick();
  f.module.stopPolling(); resolve({ total: 99 }); await flush();
  assert.deepEqual(f.events, []);
  f.setDay(undefined); f.setDayCount(1); f.module.startPolling(); await flush();
  assert.deepEqual(f.events, []); f.setDayCount(2); await f.tick();
  assert.deepEqual(f.events, ['ikdnvw:new-orders']); f.module.stopPolling();
});

test('配送员仅检查抢单池，不访问夜宵上下文', async () => {
  const f = fixture(); f.setRole('fulltime-rider');
  f.setContext(async () => { throw Error('must not query context'); });
  f.module.startPolling(); await flush(); f.setDayCount(1); await f.tick();
  assert.equal(f.tasksCalls, 0); assert.equal(f.nightCalls, 0);
  assert.deepEqual(f.events, ['ikdnvw:new-orders']); f.module.stopPolling();
});
