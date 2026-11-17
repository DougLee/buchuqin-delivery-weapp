import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function harness() {
  let owner='staff-a', accept;
  const events=[], exports={};
  const api={ profile:async()=>{events.push('profile');return{notifyTemplateId:'org-template'};},notifyGrant:async n=>events.push('grant:'+n),notifyQuota:async()=>({quota:1}) };
  const uni={ getStorageSync:key=>key==='staffToken'?owner:'',showToast(){events.push('toast');},requestSubscribeMessage(options){events.push('subscribe');accept=()=>options.success({'org-template':'accept'});} };
  const source=ts.transpileModule(fs.readFileSync(new URL('../src/utils/notifyQuota.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports,require(name){if(name==='../api')return{api};if(name.includes('stores/session'))return{useSessionStore:()=>({role:'building-manager'})};return{isManagerRole:()=>true};},uni,console:{error(){}}});
  return{module:exports,events,accept:()=>accept(),switchOwner:()=>owner='staff-b'};
}
test('楼长授权在同步点击链先调用微信，不先await profile网络',async()=>{const h=harness();h.module.setNotifyTemplateId('org-template');const p=h.module.grantTimes(1);assert.deepEqual(h.events,['subscribe']);h.accept();assert.equal(await p,1);assert.deepEqual(h.events,['subscribe','grant:1']);});
test('模板尚未预载时不拿其他组织默认模板弹窗，预载后重试',async()=>{const h=harness();assert.equal(h.module.notifyAuthReady(),false);assert.ok(!h.events.includes('subscribe'));await new Promise(resolve=>setImmediate(resolve));assert.equal(h.module.notifyAuthReady(),true);const p=h.module.grantTimes(1);assert.equal(h.events.at(-1),'subscribe');h.accept();assert.equal(await p,1);});
test('用户授权期间换员工，不能把额度上报给新账号',async()=>{const h=harness();h.module.setNotifyTemplateId('org-template');const p=h.module.grantTimes(1);h.switchOwner();h.accept();assert.equal(await p,0);assert.ok(!h.events.some(e=>e.startsWith('grant:')));});
