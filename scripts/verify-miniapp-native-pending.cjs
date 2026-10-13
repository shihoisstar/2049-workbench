// Executes the actual frontend service against injected storage and transport; no network.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const{randomUUID}=require('node:crypto');const{createRequire}=require('node:module');const{Script}=require('node:vm');
const req=createRequire(path.resolve(__dirname,'../apps/miniapp/package.json'));const ts=req('typescript');const{ApiError}=req('@wb/api-client');const{ErrorCode}=req('@wb/contracts');const a=randomUUID(),b=randomUUID();
const session=id=>({userId:id,token:'fixture',expiresInSec:3600});const storage=new Map([['wb_v2_session',session(a)]]);const calls=[];let respond=()=>{throw new Error('Connection lost');};
const taro={getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),setStorage:async({key,data})=>storage.set(key,data),removeStorage:async({key})=>storage.delete(key),removeStorageSync:key=>storage.delete(key)};
const source=path.resolve(__dirname,'../apps/miniapp/src/services/generation.ts');const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const moduleObject={exports:{}};
new Script(`(function(require,module,exports,process){${compiled}\n})`,{filename:source}).runInThisContext()(name=>name==='@tarojs/taro'?taro:name==='./taro-transport'?{createMiniappApiClient:()=>({request:async(...args)=>{calls.push(args);return respond(...args);}})}:req(name),moduleObject,moduleObject.exports,{env:{TARO_ENV:'weapp'}});
const service=moduleObject.exports;const checks=[];const check=(value,name)=>{assert.ok(value,name);checks.push(name);};
const input=()=>({category:'commerce',durationSec:10,resolution:'720p',aspectRatio:'9:16',prompt:'带上小猫，一起出门。',materialIds:[],requestKey:randomUUID(),quoteVersion:'a'.repeat(64)});
const receipt=body=>({...body,id:randomUUID(),provider:'mock',status:'accepted',reservedCredits:7,actualCredits:null,createdAt:new Date().toISOString(),finishedAt:null});
async function main(){
  const original=input();await assert.rejects(service.submitGeneration(original));check(service.pendingGeneration()?.requestKey===original.requestKey,'network loss retains original');check(calls.at(-1)[1]==='/v2/marketing/video','native route selected');
  await assert.rejects(service.submitGeneration({...input(),prompt:'changed'}));check(calls.at(-1)[2].body.requestKey===original.requestKey&&calls.at(-1)[2].body.prompt===original.prompt,'retry reuses content and request key');
  storage.set('wb_v2_session',session(b));check(service.pendingGeneration()===null,'other account cannot recover first request');storage.set('wb_v2_session',session(a));check(service.pendingGeneration()?.requestKey===original.requestKey,'original account restores its request');
  respond=()=>{throw new ApiError(503,{message:'unclassified gateway loss'});};await assert.rejects(service.submitGeneration(input()));check(service.pendingGeneration()?.requestKey===original.requestKey,'unknown 503 retains request');
  respond=(_method,_route,{body})=>receipt({...body,requestKey:randomUUID()});await assert.rejects(service.submitGeneration(input()));check(service.pendingGeneration()?.requestKey===original.requestKey,'wrong receipt cannot clear original');
  respond=(_method,_route,{body})=>receipt(body);await service.submitGeneration(input());check(service.pendingGeneration()===null,'matching receipt clears original');
  respond=()=>{throw new ApiError(503,{code:ErrorCode.GENERATION_UNAVAILABLE,message:'disabled'});};await assert.rejects(service.submitGeneration(input()));check(service.pendingGeneration()===null,'definitive unavailable clears unaccepted request');
  const legacy={...input(),durationSec:5,quoteVersion:'legacy'};storage.set('wb_v2_pending_video',legacy);check(service.pendingGeneration()?.durationSec===5,'legacy request remains recoverable');
  respond=(_method,route,{body})=>{assert.equal(route,'/v2/generation');return receipt(body);};await service.submitGeneration(legacy);check(!storage.has('wb_v2_pending_video'),'legacy uses old route and clears after receipt');
  console.log(JSON.stringify({checks:checks.length,failures:0,networkCalls:0,details:checks}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
