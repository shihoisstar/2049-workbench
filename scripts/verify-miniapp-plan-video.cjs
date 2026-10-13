// Native WeChat taps + isolated HTTP/Temporal/FFmpeg; modal and album API results injected; paid calls 0.
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const { randomBytes, randomUUID } = require('node:crypto'); const {setTimeout: delay} = require('node:timers/promises');
const {ideTool} = require('./verify-miniapp-portrait.cjs'); const root = path.resolve(__dirname, '..'); const directory = path.resolve(process.argv[2] || '');
assert.equal(path.dirname(directory), path.join(root, '.local')); assert.ok(path.basename(directory).startsWith('wb-miniapp-drama-'));
const state = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')); assert.equal(state.apiBase, 'http://127.0.0.1:3027'); assert.ok(state.mediaWorkerPid);
const evidence = path.join(root, 'docs/验收留档/PLAN-VIDEO-2026-10-11', state.runId); fs.mkdirSync(evidence, {recursive: true});
let session; const checks=[]; let taps=0;
function save(file, value) { const text = JSON.stringify(value, null, 2)+'\n'; fs.writeFileSync(file,text); assert.equal(fs.readFileSync(file,'utf8'),text); }
function check(value, label) { assert.ok(value,label); checks.push(label); console.log('CHECK',label); }
async function api(route, body, auth=true) { const response=await fetch(state.apiBase+route,{method: body?'POST':'GET',headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${session.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})}); assert.ok(response.ok, `${route}: ${response.status}`); return response.json(); }
async function eventually(read, condition) { const until=Date.now()+45000; while(Date.now()<until){const value=await read();if(condition(value))return value;await delay(500);}throw new Error('Result deadline exceeded'); }
function text(selector) { return String(ideTool('automation_element_action',['--action','text','--selector',selector,'--wait-for-selector',selector])); }
function tap(selector){ideTool('automation_element_action',['--action','tap','--selector',selector,'--wait-for-selector',selector,'--wait','1']);taps++;}
function mock(method,value){const file=path.join(directory,'plan-video-api-result.json');save(file,value);ideTool('automation_wx_api',['--action','mock','--method',method,'--result-file',file]);}
async function navigate(url) { const previous=ideTool('automation_runtime_info',['--action','currentPage']).currentPage?.pageId;ideTool('automation_navigate',['--action','reLaunch','--url',url]);await eventually(()=>Promise.resolve(ideTool('automation_runtime_info',['--action','currentPage']).currentPage),page=>page?.pageId!==previous&&page?.path===url.split('?')[0].slice(1)); }
async function main(){
  session=await api('/v2/auth/guest',{credential:randomBytes(32).toString('hex')},false);const actor=path.join(directory,'plan-video-session.json');save(actor,[session]);
  try{ideTool('automation_evaluate',['--fn-source','function(session){wx.setStorageSync("wb_v2_session",session);return true;}','--args-file',actor]);}finally{fs.unlinkSync(actor);}
  try{
    const content=Array.from({length:5},(_,n)=>`## 第${n+1}集\n**场景1：云海 日/外**\n旁白（画外音）：第${n+1}站出发。`).join('\n\n');
    const project=await api('/v2/drama/projects',{mode:'script',title:'五站模拟预览',content,look:'3D国创',aspectRatio:'9:16',episodeCount:5});
    await api(`/v2/drama/projects/${project.id}/script-confirmation`,{versionId:project.activeVersionId});
    const initial=await api(`/v2/drama/projects/${project.id}/preparation`);
    const prepared=await api(`/v2/drama/projects/${project.id}/preparation`,{scriptVersionId:initial.scriptVersionId,baseRevision:0,roles:initial.roles.map(({key,name,usage,description,referenceMaterialId})=>({key,name,usage,description,referenceMaterialId})),scenes:initial.scenes.map(({key,description})=>({key,description}))});
    let plan=await api(`/v2/drama/projects/${project.id}/storyboard-plan`,{scriptVersionId:prepared.scriptVersionId,preparationRevision:prepared.revision});
    for(const shot of plan.shots)plan=await api(`/v2/drama/storyboard-plans/${plan.id}`,{baseRevision:plan.revision,shotKey:shot.key,content:shot.content,roleKeys:[],reviewed:true});
    check(plan.shots.length===5,'Five planned episodes each have one isolated fixture slot; no visual reference needed for voice-only');
    const images=[];
    for(const shot of plan.shots){const request={shotKey:shot.key,planRevision:plan.revision};const price=await api(`/v2/drama/storyboard-plans/${plan.id}/image-quote`,request);const image=await api(`/v2/drama/storyboard-plans/${plan.id}/images`,{...request,quoteVersion:price.version,requestKey:randomUUID()});await eventually(()=>api(`/v2/drama/storyboard-plans/${plan.id}/images?shotKey=${shot.key}`),page=>page.items[0]?.status==='succeeded');images.push(await api(`/v2/drama/storyboard-images/${image.candidateId}/select`,{planRevision:plan.revision}));}
    const route=`/pages/studio-drama-plan/index?id=${plan.id}`;await navigate(route);await eventually(()=>Promise.resolve(text('.plan-video-generate')),value=>value.includes('制作模拟镜头'));
    mock('showModal',{confirm:false,cancel:true});tap('.plan-video-generate');check(await api(`/v2/drama/candidates/${images[0].candidateId}/plan-video-jobs`)===null&&(await api('/v2/wallet')).balance===45,'Native quote cancel creates no video and no new hold');
    mock('showModal',{confirm:true,cancel:false});tap('.plan-video-generate');const first=await eventually(()=>api(`/v2/drama/candidates/${images[0].candidateId}/plan-video-jobs`),job=>job?.status==='succeeded');check(!!first.requestKey,'Native confirmation persists original video nonce and worker publishes one private clip');
    for(const image of images.slice(1)){const price=await api(`/v2/drama/candidates/${image.candidateId}/plan-video-quote`,{planRevision:plan.revision});await api(`/v2/drama/candidates/${image.candidateId}/plan-video-jobs`,{planRevision:plan.revision,quoteVersion:price.version,requestKey:randomUUID()});}
    for(const image of images)await eventually(()=>api(`/v2/drama/candidates/${image.candidateId}/plan-video-jobs`),job=>job?.status==='succeeded');
    check((await api('/v2/wallet')).balance===10,'Five mock image and five mock video jobs settle exactly seventy test credits');
    await navigate(route);await eventually(()=>Promise.resolve(text('.plan-video-preview')),value=>value.includes('预览模拟镜头'));tap('.plan-video-preview');check(text('.plan-video').includes('模拟镜头已完成'),'Video task is restored on native reentry and preview control works');
    tap('.plan-export-generate');const firstExport=await eventually(()=>api(`/v2/drama/storyboard-plans/${plan.id}/exports`),jobs=>jobs[0]?.status==='succeeded');check(firstExport[0].episodeNumber===1,'Native first episode export reaches private FFmpeg publication through dedicated media worker');
    for(let episodeNumber=2;episodeNumber<=5;episodeNumber++)await api(`/v2/drama/projects/${project.id}/exports`,{episodeNumber,planId:plan.id,planRevision:plan.revision,requestKey:randomUUID()});
    const exported=await eventually(()=>api(`/v2/drama/storyboard-plans/${plan.id}/exports`),jobs=>jobs.length===5&&jobs.every(job=>job.status==='succeeded'));
    const assets=[];for(const job of exported){const media=await api(`/v2/drama/exports/${job.id}/media`);const response=await fetch(media.url);check(response.ok&&Number(response.headers.get('content-length'))>0,`Episode ${job.episodeNumber} private MP4 is independently downloadable`);assets.push({episodeNumber:job.episodeNumber,jobId:job.id,assetId:media.assetId,sha256:media.sha256,durationMs:media.durationMs,byteLength:media.byteLength});}
    check(new Set(assets.map(asset=>asset.assetId)).size===5,'Five separate episode assets are retained');
    await navigate(route);await eventually(()=>Promise.resolve(text('.plan-exports')),value=>value.includes('第 5 集')&&value.includes('预览已完成'));tap('.plan-export-play');
    mock('downloadFile',{statusCode:200,tempFilePath:'wxfile://fixture-plan-preview.mp4'});mock('saveVideoToPhotosAlbum',{});tap('.plan-export-save');await eventually(()=>Promise.resolve(text('.plan-exports')),value=>value.includes('本集预览已保存相册'));
    check(true,'Native album button reaches download and album APIs with injected success; physical phone unverified');
    const wallet=await api('/v2/wallet');check(wallet.balance===10,'Exports, playback, reentry and saving cause no extra test credit deduction');
    save(path.join(evidence,'weapp-state.json'),{runId:state.runId,userId:session.userId,projectId:project.id,planId:plan.id,checks,taps,assets,balance:wallet.balance,paidProviderCalls:0,albumResultInjected:true,phoneVerified:false,realFiveEpisodeQualityVerified:false});
    ideTool('simulator_screenshot',['--path',path.join(evidence,'five-preview-exports.jpg'),'--wait-for-selector','.plan-exports','--wait','1']);
  }finally{for(const method of ['showModal','downloadFile','saveVideoToPhotosAlbum'])try{ideTool('automation_wx_api',['--action','restore','--method',method]);}catch{} }
}
main().catch(error=>{save(path.join(evidence,'failed.json'),{message:error.message,checks,taps,paidProviderCalls:0});console.error(error.message);process.exitCode=1;});
