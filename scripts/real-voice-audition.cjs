const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict'); const {createHash} = require('node:crypto'); const {createRequire} = require('node:module'); const {setTimeout:delay} = require('node:timers/promises');
const root=path.resolve(__dirname,'..'); const req=createRequire(path.join(root,'apps/worker/package.json'));
const directory=path.join(root,'.local/voice-audition-2026-10-11'); const evidence=path.join(root,'docs/验收留档/VOICE-2026-10-11');
const plan={revision:1,provider:'Atlas',model:'google/gemini-2.5-flash-tts',voices:['Aoede','Leda'],callsLimit:2,budgetCny:1,reservationPerCallUsd:0.05,conservativeUsdCap:0.1,
  text:'请用自然、清晰的标准普通话女声，明快积极、亲切有精神，像向朋友分享，避免播报腔和夸张叫卖。每句之间短暂停顿。只朗读以下正文，不朗读这些要求，也不要添加内容。\n阿橘捡到一封星光信。原来，是月亮在等它。\n带上小猫，一起出门。\n坐在窗边，歇一会儿。',
  priceSource:'https://www.atlascloud.ai/models/google/gemini-2.5-flash-tts',documentedUsdPerThousandCharacters:0.04};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'); const fingerprint=hash(JSON.stringify(plan));
function write(file,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');fs.writeFileSync(file,bytes);assert.equal(hash(fs.readFileSync(file)),hash(bytes));}
function reserve(report,voice,payload){
  assert.ok(plan.voices.includes(voice));assert.ok(report.attempts.length<plan.callsLimit);assert.ok(!report.attempts.some(a=>a.voice===voice||['pending','unknown'].includes(a.status)),'No duplicate or unknown submissions');
  assert.deepEqual(payload,{model:plan.model,text:plan.text,voice});const reserved=report.attempts.reduce((sum,a)=>sum+Math.round(a.maximumUsd*1e6),0);assert.ok(reserved+50000<=Math.round(plan.conservativeUsdCap*1e6));
  const attempt={voice,status:'pending',maximumUsd:plan.reservationPerCallUsd,startedAt:new Date().toISOString(),payloadSha256:hash(JSON.stringify(payload))};report.attempts.push(attempt);return attempt;
}
async function main(){
  if(process.argv.includes('--prepare')){fs.mkdirSync(evidence,{recursive:true});write(path.join(evidence,'request-plan.json'),{...plan,fingerprint});console.log(JSON.stringify({plannedCalls:2,paidCalls:0,approvalRequired:true,budgetCny:1,conservativeUsdCap:0.1}));return;}
  assert.ok(process.argv.includes('--execute')&&process.argv.includes('--authorized-voice-cny=1'),'Separate human approval for two audio requests required');
  assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'request-plan.json'),'utf8')).fingerprint,fingerprint);
  fs.mkdirSync(directory,{recursive:true});const lockFile=path.join(directory,'execute.lock');const lock=fs.openSync(lockFile,'wx');
  try{
    const journal=path.join(directory,'journal.json');const report=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):{fingerprint,attempts:[],outputs:{}};assert.equal(report.fingerprint,fingerprint);const save=()=>write(journal,report);
    const secretLine=fs.readFileSync(path.join(root,'apps/api/.env'),'utf8').split(/\r?\n/).find(line=>/^ATLAS_API_KEY=/.test(line));const secret=secretLine?.slice(14).trim().replace(/^(['"])(.*)\1$/,'$2');assert.ok(secret);
    const {atlasSpeechAdapter}=req('@wb/model-gateway');const {downloadVideo}=require('../packages/media/dist/download');const {runMediaTool}=require('../packages/media/dist/render');const channel={baseUrl:'https://api.atlascloud.ai'};
    for(const voice of plan.voices){
      const existing=report.outputs[voice];if(existing){assert.equal(existing.file,`${voice}.wav`);assert.equal(hash(fs.readFileSync(path.join(evidence,existing.file))),existing.sha256);continue;}
      const fetchImpl=async(url,options={})=>{assert.equal(new URL(String(url)).origin,channel.baseUrl);if(options.method!=='POST')return fetch(url,{...options,redirect:'error'});
        const attempt=reserve(report,voice,JSON.parse(String(options.body)));save();try{const response=await fetch(url,{...options,redirect:'error'});let json;try{json=await response.clone().json();}catch{attempt.status='unknown';save();return response;}
          const id=json?.data?.id??json?.id;if([400,401,403,404,422,429].includes(response.status)){attempt.status='rejected';attempt.httpStatus=response.status;}
          else if(response.ok&&typeof id==='string'&&id.trim()&&id.length<=500){attempt.status='received';attempt.providerTaskId=id;}else attempt.status='unknown';save();return response;
        }catch(error){attempt.status='unknown';save();throw error;}};
      const ctx=()=>({secret,fetchImpl,timeoutMs:30000,signal:AbortSignal.timeout(30000)});const prior=report.attempts.find(a=>a.voice===voice);if(prior&&!prior.providerTaskId)throw new Error('Original receipt unknown or rejected; stop');
      const id=prior?.providerTaskId??(await atlasSpeechAdapter.submit(ctx(),channel,plan.text,{model:plan.model,voice})).providerTaskId;let audioUrl;const deadline=Date.now()+240000;
      while(Date.now()<deadline){const result=await atlasSpeechAdapter.poll(ctx(),channel,id);if(result.status==='failed')throw new Error('Audio generation failed');if(result.status==='succeeded'){audioUrl=result.audioUrl;break;}await delay(2500);}assert.ok(audioUrl,'Resume polling original ID later');
      const raw=`${voice}-provider.bin`;if(!fs.existsSync(path.join(directory,raw)))await downloadVideo(audioUrl,path.join(directory,raw),0,AbortSignal.timeout(60000),16*1024*1024);
      const bytes=fs.readFileSync(path.join(directory,raw));assert.ok(bytes.length>12&&bytes.length<=16*1024*1024);const isWav=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE';const isMp3=bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224);assert.ok(isWav||isMp3,'Unexpected audio container');
      const file=`${voice}.wav`;await runMediaTool('ffmpeg',['-nostdin','-y','-protocol_whitelist','file,pipe','-f',isWav?'wav':'mp3','-i',raw,'-vn','-ac','1','-ar','48000','-c:a','pcm_s16le',file],directory);
      const probe=JSON.parse(await runMediaTool('ffprobe',['-v','error','-f','wav','-show_entries','format=duration','-of','json',file],directory));const durationMs=Math.round(Number(probe.format.duration)*1000);assert.ok(durationMs>0&&durationMs<=45000,'Audio duration rejected; do not truncate');const output=fs.readFileSync(path.join(directory,file));write(path.join(evidence,file),output);report.outputs[voice]={file,sha256:hash(output),durationMs};save();
    }
    write(path.join(evidence,'report.json'),{fingerprint,status:'awaiting_human_listening',actualCalls:report.attempts.length,outputs:report.outputs,actualProviderCharge:null,qualityVerified:false});console.log(JSON.stringify({actualCalls:report.attempts.length,qualityVerified:false}));
  }finally{fs.closeSync(lock);fs.unlinkSync(lockFile);}
}
if(require.main===module)main().catch(error=>{const journal=path.join(directory,'journal.json');const r=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):null;
  if(r)write(path.join(evidence,'report.json'),{fingerprint,status:'stopped',actualCalls:r.attempts.length,attempts:r.attempts.map(({voice,status,maximumUsd})=>({voice,status,maximumUsd})),qualityVerified:false});
  console.error(JSON.stringify({event:'voice_audition_stopped',name:error.name,recordedCalls:r?.attempts.length??0}));process.exitCode=1;});
module.exports={plan,reserve};
