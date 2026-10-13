// Executes the actual frontend service against injected storage and transport; no network.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const{randomUUID}=require('node:crypto');const{createRequire}=require('node:module');const{Script}=require('node:vm');
const req=createRequire(path.resolve(__dirname,'../apps/miniapp/package.json'));const ts=req('typescript');const{ApiError}=req('@wb/api-client');const{ErrorCode}=req('@wb/contracts');const a=randomUUID(),b=randomUUID();
const session=id=>({userId:id,token:'fixture',expiresInSec:3600});const storage=new Map([['wb_v2_session',session(a)]]);const calls=[];let respond=()=>{throw new Error('Connection lost');};
const taro={getRandomValues:async({length})=>({randomValues:require('node:crypto').randomBytes(length)}),getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),setStorage:async({key,data})=>storage.set(key,data),removeStorage:async({key})=>storage.delete(key),removeStorageSync:key=>storage.delete(key)};
const source=path.resolve(__dirname,'../apps/miniapp/src/services/generation.ts');const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const moduleObject={exports:{}};
new Script(`(function(require,module,exports,process){${compiled}\n})`,{filename:source}).runInThisContext()(name=>name==='@tarojs/taro'?taro:name==='./taro-transport'?{createMiniappApiClient:()=>({request:async(...args)=>{calls.push(args);return respond(...args);}})}:req(name),moduleObject,moduleObject.exports,{env:{TARO_ENV:'weapp'}});
const service=moduleObject.exports;const checks=[];const check=(value,name)=>{assert.ok(value,name);checks.push(name);};
const input=()=>({category:'commerce',durationSec:10,resolution:'720p',aspectRatio:'9:16',prompt:'带上小猫，一起出门。',materialIds:[],requestKey:randomUUID(),quoteVersion:'a'.repeat(64)});
const receipt=body=>({...body,id:randomUUID(),provider:'mock',status:'accepted',reservedCredits:7,actualCredits:null,createdAt:new Date().toISOString(),finishedAt:null});
async function main(){
  const jobId=randomUUID(),draft={revision:1,cues:[{startMs:100,endMs:2000,text:'咕嘟咕嘟。'}]};
  const view=body=>({jobId,state:'ready',revision:2,durationMs:10000,transcript:'孤独孤独。',cues:body.cues,issue:null,confirmationRequestKey:body.requestKey,expiresAt:new Date(Date.now()+60000).toISOString()});
  await service.saveNativeCaptionDraft(jobId,draft);check((await service.loadNativeCaptionDraft(jobId)).cues[0].text==='咕嘟咕嘟。','edited text survives service reload');
  storage.set('wb_v2_session',session(b));check(await service.loadNativeCaptionDraft(jobId)===null,'draft isolated by account');storage.set('wb_v2_session',session(a));
  await assert.rejects(service.confirmNativeCaptions(jobId,draft));const pending=await service.pendingNativeCaptions(jobId);check(!!pending,'network loss retains confirmation');
  respond=()=>{throw new ApiError(503,{message:'unknown'});};await assert.rejects(service.confirmNativeCaptions(jobId,{...draft,cues:[{...draft.cues[0],text:'changed'}]}));check(calls.at(-1)[2].body.requestKey===pending.requestKey&&calls.at(-1)[2].body.cues[0].text===draft.cues[0].text,'retry uses identical original captions and request key');
  respond=(_method,_route,{body})=>view({...body,requestKey:randomUUID()});await assert.rejects(service.confirmNativeCaptions(jobId,draft));check((await service.pendingNativeCaptions(jobId)).requestKey===pending.requestKey,'wrong receipt does not clear pending');
  respond=()=>view(pending);await service.nativeCaptionReview(jobId);check(await service.pendingNativeCaptions(jobId)===null,'matching server review resolves unknown confirmation');
  respond=(_method,_route,{body})=>view(body);await service.confirmNativeCaptions(jobId,draft);check(await service.pendingNativeCaptions(jobId)===null&&await service.loadNativeCaptionDraft(jobId)===null,'successful confirmation clears matching pending and draft');
  respond=()=>{throw new ApiError(409,{message:'version changed'});};await assert.rejects(service.confirmNativeCaptions(jobId,draft));check(await service.pendingNativeCaptions(jobId)===null,'explicit conflict permits reload');
  check(calls.every(call=>call[1].endsWith('/review')),'no generation or billing calls');
  console.log(JSON.stringify({checks:checks.length,failures:0,networkCalls:0,details:checks}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
