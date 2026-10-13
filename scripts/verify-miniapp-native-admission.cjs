const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const{randomBytes}=require('node:crypto');const{setTimeout:delay}=require('node:timers/promises');const{ideTool,protectSession}=require('./verify-miniapp-portrait.cjs');
const root=path.resolve(__dirname,'..'),directory=path.resolve(process.argv[2]||'');assert.equal(path.dirname(directory),path.join(root,'.local'));assert.ok(path.basename(directory).startsWith('wb-miniapp-drama-'));const state=JSON.parse(fs.readFileSync(path.join(directory,'state.json')));assert.equal(state.apiBase,'http://127.0.0.1:3027');
const evidence=path.join(root,'docs/验收留档/NATIVE-ADMISSION-2026-10-11',state.runId);fs.mkdirSync(evidence,{recursive:true});const checks=[];let interactions=0,session;
function save(p,v){const text=JSON.stringify(v,null,2)+'\n';fs.writeFileSync(p,text);assert.equal(fs.readFileSync(p,'utf8'),text);}
function evaluate(fn,args){const file=path.join(directory,'native-ui-args.json');save(file,args);try{return ideTool('automation_evaluate',['--fn-source',fn,'--args-file',file]).result.result;}finally{fs.unlinkSync(file);}}
function text(selector){return String(ideTool('automation_element_action',['--action','text','--selector',selector,'--wait-for-selector',selector]));}
function tap(selector){ideTool('automation_element_action',['--action','tap','--selector',selector,'--wait-for-selector',selector,'--wait','1']);interactions++;}
function input(value){const file=path.join(directory,'native-input.json');save(file,{value});ideTool('automation_element_action',['--action','trigger','--selector','.studio-prompt','--type','input','--detail-file',file,'--wait-for-selector','.studio-prompt']);interactions++;}
function check(v,name){assert.ok(v,name);checks.push(name);console.log('CHECK',name);}
async function api(route,body,authenticated=true){const response=await fetch(state.apiBase+route,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(authenticated?{authorization:`Bearer ${session.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,`${route}: ${response.status}`);return response.json();}
async function navigate(url){const before=ideTool('automation_runtime_info',['--action','currentPage']).currentPage?.pageId;ideTool('automation_navigate',['--action','reLaunch','--url',url]);for(let i=0;i<35;i++){const page=ideTool('automation_runtime_info',['--action','currentPage']).currentPage;if(page?.pageId!==before&&page.path===url.split('?')[0].slice(1))return;await delay(250);}throw new Error('Navigation timeout');}
async function waitFor(read,accept){for(let i=0;i<30;i++){const value=await read();if(accept(value))return value;await delay(500);}throw new Error('UI state timeout');}
async function main(){
  const rows=evaluate('function(){const keys=wx.getStorageInfoSync().keys;return ["wb_v2_pending_video","wb_v2_last_job"].map(key=>({key,present:keys.includes(key),value:wx.getStorageSync(key)}));}',[]);const backup=path.join(directory,'native-ui-original.enc.json');save(backup,{protectedData:protectSession(JSON.stringify(rows))});
  session=await api('/v2/auth/guest',{credential:randomBytes(32).toString('hex')},false);let modal=false;
  try{
    evaluate('function(session){wx.setStorageSync("wb_v2_session",session);wx.removeStorageSync("wb_v2_pending_video");return true;}',[session]);
    await navigate('/pages/studio-marketing/index');check(text('.v2-marketing-settings').includes('10秒'),'10-second settings shown');
    input('橘猫帆布袋，拍一段出门前找到包的小故事。');tap('#studio-generate-video');
    check(text('.v2-marketing-review').includes('橘猫帆布袋'),'content review contains user draft');
    check((await api('/v2/generation')).items.length===0&&(await api('/v2/wallet')).balance===80,'review does not create a job or reserve');
    tap('.studio-form-body .studio-text-button');check(text('.v2-marketing-headline').includes('好商品'),'back to editing');
    tap('.studio-category-tabs button:nth-child(2)');input('咖啡店有木桌和窗边座位，口播：坐下来歇一会儿。');tap('#studio-generate-video');
    check(text('.v2-marketing-review').includes('咖啡店'),'store review uses independent draft');
    await waitFor(()=>Promise.resolve(text('.studio-price')),value=>value.includes('7'));check(text('.studio-form-body').includes('开发模拟'),'mock disclosure is visible');
    ideTool('simulator_screenshot',['--path',path.join(evidence,'content-review.jpg')]);
    const file=path.join(directory,'native-modal.json');save(file,{confirm:true,cancel:false});ideTool('automation_wx_api',['--action','mock','--method','showModal','--result-file',file]);modal=true;tap('#studio-generate-video');
    const works=await waitFor(()=>api('/v2/generation'),r=>r.items.length===1);const job=works.items[0];check(job.durationSec===10&&job.provider==='mock'&&job.category==='store_visit','one native preview admitted');
    check((await api('/v2/wallet')).balance===73,'one seven-credit test reservation');
    await waitFor(()=>Promise.resolve(text('.studio-field-heading')),value=>value.includes('开发模拟记录已保存'));
    await navigate('/pages/studio-home/index');await navigate(`/pages/studio-progress/index?id=${job.id}`);
    check(text('.studio-field-heading').includes('开发模拟记录已保存'),'saved job survives page reentry');
    check((await api('/v2/generation')).items.length===1&&(await api('/v2/wallet')).balance===73,'reopening does not duplicate job or reserve');
    ideTool('simulator_screenshot',['--path',path.join(evidence,'recovered-preview.jpg')]);
    save(path.join(evidence,'weapp-state.json'),{runId:state.runId,jobId:job.id,checks,assertions:checks.length,interactions,paidCalls:0,modalReturnInjected:true,phoneVerified:false,realGenerationVerified:false});
  }finally{
    if(modal)ideTool('automation_wx_api',['--action','restore','--method','showModal']);
    const restored=evaluate('function(rows,userId){for(const r of rows){if(r.present)wx.setStorageSync(r.key,r.value);else wx.removeStorageSync(r.key);}for(const key of wx.getStorageInfoSync().keys){if(key===`wb_v2_pending_native_video:${userId}`||key.startsWith(`wb_v2_marketing_draft:${userId}:`))wx.removeStorageSync(key);}return rows.every(r=>r.present?JSON.stringify(wx.getStorageSync(r.key))===JSON.stringify(r.value):!wx.getStorageInfoSync().keys.includes(r.key));}',[JSON.parse(protectSession(JSON.parse(fs.readFileSync(backup)).protectedData,true)),session.userId]);
    assert.equal(restored,true);fs.unlinkSync(backup);
  }
  console.log(JSON.stringify({assertions:checks.length,interactions,paidCalls:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
