const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const{randomBytes}=require('node:crypto');const{setTimeout:delay}=require('node:timers/promises');const{ideTool,protectSession}=require('./verify-miniapp-portrait.cjs');
const root=path.resolve(__dirname,'..'),directory=path.resolve(process.argv[2]||'');assert.equal(path.dirname(directory),path.join(root,'.local'));assert.ok(path.basename(directory).startsWith('wb-miniapp-drama-'));const state=JSON.parse(fs.readFileSync(path.join(directory,'state.json')));assert.equal(state.apiBase,'http://127.0.0.1:3027');
const evidence=path.join(root,'docs/验收留档/NATIVE-CAPTIONS-2026-10-11',state.runId);fs.mkdirSync(evidence,{recursive:true});const checks=[];let interactions=0,session;
function save(p,v){const text=JSON.stringify(v,null,2)+'\n';fs.writeFileSync(p,text);assert.equal(fs.readFileSync(p,'utf8'),text);}
function evaluate(fn,args){const file=path.join(directory,'native-ui-args.json');save(file,args);try{return ideTool('automation_evaluate',['--fn-source',fn,'--args-file',file]).result.result;}finally{fs.unlinkSync(file);}}
function text(selector){return String(ideTool('automation_element_action',['--action','text','--selector',selector,'--wait-for-selector',selector]));}
function tap(selector){ideTool('automation_element_action',['--action','tap','--selector',selector,'--wait-for-selector',selector,'--wait','1']);interactions++;}
function input(value){const file=path.join(directory,'native-input.json');save(file,{value});ideTool('automation_element_action',['--action','trigger','--selector','.studio-prompt','--type','input','--detail-file',file,'--wait-for-selector','.studio-prompt']);interactions++;}
function check(v,name){assert.ok(v,name);checks.push(name);console.log('CHECK',name);}
async function api(route,body,authenticated=true){const response=await fetch(state.apiBase+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(authenticated?{authorization:`Bearer ${session.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,`${route}: ${response.status}`);return response.json();}
async function navigate(url){const before=ideTool('automation_runtime_info',['--action','currentPage']).currentPage?.pageId;ideTool('automation_navigate',['--action','reLaunch','--url',url]);for(let i=0;i<35;i++){const page=ideTool('automation_runtime_info',['--action','currentPage']).currentPage;if(page?.pageId!==before&&page.path===url.split('?')[0].slice(1))return;await delay(250);}throw new Error('Navigation timeout');}
async function waitFor(read,accept){for(let i=0;i<240;i++){const value=await read();if(accept(value))return value;await delay(500);}throw new Error('UI state timeout');}

async function main(){
  const rows=evaluate('function(){const keys=wx.getStorageInfoSync().keys;return ["wb_v2_pending_video","wb_v2_last_job","wb_v2_saved_media"].map(key=>({key,present:keys.includes(key),value:wx.getStorageSync(key)}));}',[]);const backup=path.join(directory,'native-captions-ui-original.enc.json');save(backup,{protectedData:protectSession(JSON.stringify(rows))});
  session=await api('/v2/auth/guest',{credential:randomBytes(32).toString('hex')},false);let modal=false;const results=[];
  try{
    evaluate('function(session){wx.setStorageSync("wb_v2_session",session);wx.removeStorageSync("wb_v2_pending_video");return true;}',[session]);
    await navigate('/pages/studio-marketing/index');input('橘猫帆布袋，出门忙乱，找到包，装好出门。');tap('#studio-generate-video');
    await waitFor(()=>Promise.resolve(text('.studio-price')),value=>value.includes('7'));
    check(text('.studio-form-body').includes('固定样片'),'fixed fixture disclosure shown');
    const file=path.join(directory,'native-modal.json');save(file,{confirm:true,cancel:false});ideTool('automation_wx_api',['--action','mock','--method','showModal','--result-file',file]);modal=true;tap('#studio-generate-video');
    const works=await waitFor(()=>api('/v2/generation'),r=>r.items.length===1);const commerce=works.items[0];
    const body={category:'store_visit',prompt:'火锅店，口播：哇你看这锅红油咕嘟咕嘟的。',durationSec:10,resolution:'720p',aspectRatio:'9:16',materialIds:[]};const quote=await api('/v2/marketing/video/quote',body);const visit=await api('/v2/marketing/video',{...body,requestKey:require('node:crypto').randomUUID(),quoteVersion:quote.version});
    for(const job of [commerce,visit]){
      const review=await waitFor(()=>api('/v2/marketing/video/'+job.id+'/review'),r=>r?.state==='review');check(review.cues.length>0,job.category+' offline transcript persisted');
      await navigate('/pages/studio-progress/index?id='+job.id);await waitFor(()=>Promise.resolve(text('.native-caption-review')),v=>v.includes('核对字幕'));
      check(text('.native-caption-review').includes(review.cues[0].text),job.category+' recognized text shown');
      const previewJob=await api('/v2/generation/'+job.id);const previewWallet=await api('/v2/wallet');check(previewJob.status==='accepted'&&previewJob.actualCredits===7&&previewJob.settlementPoint==='preview'&&previewWallet.entries.filter(e=>e.billingKey==='generation:'+job.id&&e.type==='settle').length===1,job.category+' preview settled before caption confirmation');
      check(text('.studio-result-body').includes('已消耗 7')&&text('.studio-result-body').includes('合成重试免费'),job.category+' early settlement UI shown');
      ideTool('simulator_screenshot',['--path',path.join(evidence,job.category+'-review.jpg')]);
      const corrected=job.category==='store_visit'?review.cues[0].text.replaceAll('孤独','咕嘟'):review.cues[0].text+'。';
      tap('.native-caption-edit');const detail=path.join(directory,'caption-input.json');save(detail,{value:corrected});ideTool('automation_element_action',['--action','trigger','--selector','.native-caption-input','--type','input','--detail-file',detail,'--wait-for-selector','.native-caption-input']);interactions++;
      await navigate('/pages/studio-home/index');await navigate('/pages/studio-progress/index?id='+job.id);await waitFor(()=>Promise.resolve(text('.native-caption-review')),v=>v.includes(corrected));check(true,job.category+' local correction survives page reentry');
      tap('.native-caption-confirm');const done=await waitFor(()=>api('/v2/generation/'+job.id),r=>r.status==='succeeded');check(done.actualCredits===7,job.category+' original job settled once');
      const finalReview=await api('/v2/marketing/video/'+job.id+'/review');check(finalReview.cues[0].text===corrected&&finalReview.state==='ready',job.category+' confirmed correction persisted');
      const access=await api('/v2/generation/'+job.id+'/media');const res=await fetch(access.url);assert.ok(res.ok);const bytes=Buffer.from(await res.arrayBuffer());check(require('node:crypto').createHash('sha256').update(bytes).digest('hex')===access.sha256,job.category+' downloaded movie hash matches');fs.writeFileSync(path.join(evidence,job.category+'-captioned.mp4'),bytes);assert.ok(fs.readFileSync(path.join(evidence,job.category+'-captioned.mp4')).equals(bytes));
      await waitFor(()=>Promise.resolve(text('.studio-field-heading')),v=>v.includes('成片已就绪'));tap('#save-generated-video');await waitFor(()=>Promise.resolve(text('#video-save-state')),v=>v.includes('已保存到小程序本地文件'));check(true,job.category+' saved to developer-tool local file');
      ideTool('simulator_screenshot',['--path',path.join(evidence,job.category+'-complete.jpg')]);
      const wallet=await api('/v2/wallet');const entries=wallet.entries.filter(e=>e.billingKey==='generation:'+job.id);check(entries.filter(e=>e.type==='hold').length===1&&entries.filter(e=>e.type==='settle').length===1&&entries.filter(e=>e.type==='refund').length===0,job.category+' one hold one settle no refund');
      results.push({jobId:job.id,category:job.category,sha256:access.sha256,width:access.width,height:access.height,durationMs:access.durationMs,cues:finalReview.cues});
    }
    check((await api('/v2/generation')).items.length===2&&(await api('/v2/wallet')).balance===66,'two jobs only and no additional reservation');
    const req=require('node:module').createRequire(path.join(root,'apps/worker/package.json'));const{Connection,Client}=req('@temporalio/client');const{Worker}=req('@temporalio/worker');const{historyToJSON}=req('@temporalio/common/lib/proto-utils');const connection=await Connection.connect({address:state.temporalAddress});
    try{const client=new Client({connection});for(const result of results){const handle=client.workflow.getHandle('generation:'+result.jobId);await connection.withDeadline(Date.now()+20000,()=>handle.result());const history=await handle.fetchHistory();save(path.join(directory,result.category+'-native-history.json'),historyToJSON(history));await Worker.runReplayHistory({workflowsPath:require.resolve('../apps/worker/dist/workflows')},history,'generation:'+result.jobId);result.historyEvents=history.events.length;check(true,result.category+' durable history replay');}}finally{await connection.close();}
    save(path.join(evidence,'weapp-state.json'),{runId:state.runId,checks,assertions:checks.length,interactions,results,paidCalls:0,modalReturnInjected:true,phoneVerified:false,realGenerationVerified:false,source:'previously approved fixed fixtures; fresh offline ASR and local composition'});
  }finally{
    if(modal)ideTool('automation_wx_api',['--action','restore','--method','showModal']);
    const restored=evaluate('function(rows,userId){for(const r of rows){if(r.present)wx.setStorageSync(r.key,r.value);else wx.removeStorageSync(r.key);}for(const key of wx.getStorageInfoSync().keys){if(key.includes(userId)&&(key.startsWith("wb_native_captions_")||key.startsWith("wb_v2_pending_native_video:")||key.startsWith("wb_v2_marketing_draft:")))wx.removeStorageSync(key);}return rows.every(r=>r.present?JSON.stringify(wx.getStorageSync(r.key))===JSON.stringify(r.value):!wx.getStorageInfoSync().keys.includes(r.key));}',[JSON.parse(protectSession(JSON.parse(fs.readFileSync(backup)).protectedData,true)),session.userId]);assert.equal(restored,true);fs.unlinkSync(backup);
  }
  console.log(JSON.stringify({assertions:checks.length,interactions,paidCalls:0}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
