// --prepare is offline. --execute needs separate human approval plus the explicit budget flag.
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const {createHash} = require('node:crypto'); const {createRequire} = require('node:module'); const {setTimeout:delay} = require('node:timers/promises'); const {samplePlan} = require('./short-sample-plan.cjs');
const root = path.resolve(__dirname,'..'); const req = createRequire(path.join(root,'apps/worker/package.json')); const plan = samplePlan();
const evidence = path.join(root,'docs/验收留档/REAL-SHORT-2026-10-11'); const directory = path.join(root,'.local/real-short-samples-2026-10-11');
const fingerprint = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const {reserveSampleCall} = require('./short-sample-budget.cjs');
function write(file,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');fs.writeFileSync(file,bytes);assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),createHash('sha256').update(bytes).digest('hex'));}
async function main(){
  if(process.argv.includes('--prepare')){fs.mkdirSync(evidence,{recursive:true});write(path.join(evidence,'request-plan.json'),{...plan,fingerprint});console.log(JSON.stringify({paidCalls:0,plannedCalls:12,conservativeReservedUsd:plan.maximumReservedUsd,approvalRequired:true}));return;}
  assert.ok(process.argv.includes('--execute')&&process.argv.includes('--authorized-media-cny=20'),'Separate human media approval and --authorized-media-cny=20 required');
  const stage=process.argv.find(value=>value.startsWith('--stage='))?.split('=')[1];assert.ok(['speech','image','video','compose'].includes(stage),'Run one explicit stage at a time');
  const selectedFrame=process.argv.find(value=>value.startsWith('--frame='))?.split('=')[1];const frames=selectedFrame?plan.frames.filter(frame=>frame.id===selectedFrame):plan.frames;assert.ok(frames.length,'Unknown sample frame');
  const prepared=JSON.parse(fs.readFileSync(path.join(evidence,'request-plan.json'),'utf8'));assert.equal(prepared.fingerprint,fingerprint,'Prepared sample plan changed; review scope again');
  fs.mkdirSync(directory,{recursive:true});const lockFile=path.join(directory,'execute.lock');const lock=fs.openSync(lockFile,'wx');
  try {
  const reportFile=path.join(directory,'journal.json');const report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):{fingerprint,attempts:[],outputs:{},actualProviderCharge:null};assert.equal(report.fingerprint,fingerprint);
  const save=()=>write(reportFile,report);const {atlasImageAdapter,atlasVideoAdapter,atlasSpeechAdapter}=req('@wb/model-gateway');const {readPortraitImage,composeDramaExport}=req('@wb/media');
  function recordedBytes(record, expectedFile){assert.ok(record&&record.file===expectedFile);const bytes=fs.readFileSync(path.join(directory,expectedFile));assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,'Saved sample source changed');return bytes;}
  const {downloadVideo}=require('../packages/media/dist/download');const {runMediaTool}=require('../packages/media/dist/render');
  let secret='';if(stage!=='compose'){const line=fs.readFileSync(path.join(root,'apps/api/.env'),'utf8').split(/\r?\n/).find(value=>/^ATLAS_API_KEY=/.test(value));secret=line?.slice('ATLAS_API_KEY='.length).trim().replace(/^(['"])(.*)\1$/,'$2');assert.ok(secret,'Existing Atlas credential unavailable');}
  const channel={id:1,name:'controlled-short-sample',providerName:'atlas',baseUrl:'https://api.atlascloud.ai',secretRef:'local-only',status:'active',health:'ok',weight:1,rpmLimit:null,config:{imageReferenceField:'images'}};
  let step='';let operation='';const guardedFetch=async(url,options={})=>{
    const target=new URL(String(url));assert.equal(target.origin,'https://api.atlascloud.ai');
    if(options.method!=='POST')return fetch(url,{...options,redirect:'error'});
    const attempt=reserveSampleCall(plan,report,step,operation,JSON.parse(String(options.body)));save();
    try{const response=await fetch(url,{...options,redirect:'error'});let json;try{json=await response.clone().json();}catch{attempt.status='unknown';save();return response;}const id=json?.data?.id??json?.id;
      if([400,401,403,404,422,429].includes(response.status)){attempt.status='rejected';attempt.httpStatus=response.status;}
      else if(response.ok&&typeof id==='string'&&id.trim()&&id.length<=500){attempt.status='received';attempt.providerTaskId=id;}
      else attempt.status='unknown';save();return response;
    }catch(error){attempt.status='unknown';save();throw error;}
  };
  const context=()=>({secret,fetchImpl:guardedFetch,timeoutMs:30000,signal:AbortSignal.timeout(30000)});
  async function task(frame,kind,submit,poll){step=frame.id;operation=kind;let attempt=report.attempts.find(item=>item.step===step&&item.operation===kind);
    if(attempt&&!attempt.providerTaskId)throw new Error('Original attempt has no confirmed receipt; no automatic resubmission');
    const id=attempt?.providerTaskId??(await submit()).providerTaskId;const until=Date.now()+240000;
    while(Date.now()<until){const result=await poll(id);if(result.status==='succeeded')return result;if(result.status==='failed')throw new Error('Provider output failed; keep receipt and stop');await delay(2500);}throw new Error('Provider still processing; resume GET with original ID');
  }
  for(const frame of frames){report.outputs[frame.id]??={};const output=report.outputs[frame.id];
    if(stage==='speech'&&!output.voice){const result=await task(frame,'speech',()=>atlasSpeechAdapter.submit(context(),channel,frame.narration,{model:plan.speechModel,voice:plan.speechVoice,speed:1}),id=>atlasSpeechAdapter.poll(context(),channel,id));
      const downloaded=path.join(directory,`${frame.id}-provider.wav`);if(!fs.existsSync(downloaded))await downloadVideo(result.audioUrl,downloaded,0,AbortSignal.timeout(60000),16*1024*1024);
      const file=`${frame.id}-voice.wav`;await runMediaTool('ffmpeg',['-nostdin','-y','-protocol_whitelist','file,pipe','-f','wav','-i',path.basename(downloaded),'-vn','-ac','1','-ar','48000','-c:a','pcm_s16le',file],directory);
      const probe=JSON.parse(await runMediaTool('ffprobe',['-v','error','-f','wav','-show_entries','format=duration','-of','json',file],directory));const durationMs=Math.round(Number(probe.format.duration)*1000);assert.ok(durationMs>0&&durationMs<=5000,'Narration exceeds five seconds; do not truncate or speed up');
      output.voice={file,sha256:createHash('sha256').update(fs.readFileSync(path.join(directory,file))).digest('hex'),durationMs};save();}
    if(stage==='image'&&!output.image){recordedBytes(output.voice,`${frame.id}-voice.wav`);
      const imageChannel={...channel,config:{...channel.config,modelImageEdit:frame.imageModel,modelImageT2i:frame.imageModel}};const imageUrls=frame.reference?[`data:image/png;base64,${fs.readFileSync(path.join(root,plan.reference.path)).toString('base64')}`]:undefined;
      const result=await task(frame,'image',()=>atlasImageAdapter.submitImage(context(),imageChannel,{modelName:frame.imageModel,prompt:frame.imagePrompt,imageUrls,aspectRatio:'9:16',resolution:'1k',outputFormat:'png'}),id=>atlasImageAdapter.pollImage(context(),imageChannel,id));
      const providerFile=`${frame.id}-provider-image.bin`;if(!fs.existsSync(path.join(directory,providerFile)))await downloadVideo(result.imageUrls[0],path.join(directory,providerFile),0,AbortSignal.timeout(60000),10*1024*1024);let bytes=fs.readFileSync(path.join(directory,providerFile));
      // Atlas can return JPEG despite output_format=png. Decode only a bounded local JPEG; never resubmit.
      if(bytes.subarray(0,3).toString('hex')==='ffd8ff'){
        const probe=JSON.parse(await runMediaTool('ffprobe',['-v','error','-f','image2','-c:v','mjpeg','-show_entries','stream=width,height','-of','json',providerFile],directory));const geometry=probe.streams[0];assert.ok(geometry?.width>=300&&geometry.height>=300&&geometry.width<=4096&&geometry.height<=4096,'Provider JPEG dimensions rejected');
        const normalized=`${frame.id}-normalized.png`;await runMediaTool('ffmpeg',['-nostdin','-y','-protocol_whitelist','file,pipe','-f','image2','-c:v','mjpeg','-i',providerFile,'-frames:v','1',normalized],directory);bytes=fs.readFileSync(path.join(directory,normalized));
      }
      const image=await readPortraitImage(bytes);assert.ok(image.width>=300&&image.height>=300&&Math.abs(image.width/image.height/(9/16)-1)<0.08,'Image geometry rejected');const file=`${frame.id}-frame.png`;write(path.join(directory,file),image.bytes);output.image={file,sha256:image.sha256,url:result.imageUrls[0],width:image.width,height:image.height};save();}
    if(stage==='video'&&!output.video){recordedBytes(output.voice,`${frame.id}-voice.wav`);recordedBytes(output.image,`${frame.id}-frame.png`);
      const request={modelName:plan.videoModel,modelType:'video',payload:{prompt:frame.videoPrompt,imageUrls:[output.image.url],durationSec:5,resolution:'720p',aspectRatio:'9:16'}};
      const result=await task(frame,'video',()=>atlasVideoAdapter.submit(context(),channel,request),id=>atlasVideoAdapter.poll(context(),channel,id,request));const file=`${frame.id}-video.mp4`;const target=path.join(directory,file);
      if(!fs.existsSync(target))await downloadVideo(result.videoUrl,target);const probe=JSON.parse(await runMediaTool('ffprobe',['-v','error','-f','mov','-show_entries','format=duration:stream=codec_type,width,height','-of','json',file],directory));const video=probe.streams.find(item=>item.codec_type==='video');const durationMs=Math.round(Number(probe.format.duration)*1000);
      // BytePlus documents Seedance 1.0 Pro Fast 720p / 9:16 as 704x1248. Preserve source pixels.
      const documented720p=plan.videoModel==='bytedance/seedance-v1-pro-fast/image-to-video'&&video?.width===704&&video.height===1248;
      assert.ok((documented720p||(video?.width>=720&&video.height>=720))&&Math.abs(video.width/video.height/(9/16)-1)<0.08&&Math.abs(durationMs-5000)<=250,'Video specification rejected');output.video={file,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex'),width:video.width,height:video.height,durationMs};save();}
  }
  if(stage==='compose'){for(const group of plan.outputs){const sources=group.frames.map(id=>{const data=report.outputs[id];assert.ok(data?.voice&&data.video);return{bytes:recordedBytes(data.video,`${id}-video.mp4`),sha256:data.video.sha256,subtitle:'',voice:{bytes:recordedBytes(data.voice,`${id}-voice.wav`),sha256:data.voice.sha256},captions:[{startMs:0,endMs:data.voice.durationMs,text:plan.frames.find(frame=>frame.id===id).narration}]};});
    const media=await composeDramaExport(sources,process.platform==='win32'?'C:/Windows/Fonts/msyh.ttc':'/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');write(path.join(evidence,group.file),media.bytes);}}
  write(path.join(evidence,'report.json'),{fingerprint,stage,actualCalls:report.attempts.length,reservedEstimateUsd:report.attempts.reduce((sum,item)=>sum+item.maximumUsd,0),attempts:report.attempts.map(({step,operation,status,maximumUsd})=>({step,operation,status,maximumUsd})),actualProviderCharge:null,phoneVerified:false,qualityVerified:false});console.log(JSON.stringify({stage,actualCalls:report.attempts.length,actualProviderCharge:null}));
  } finally {fs.closeSync(lock);fs.unlinkSync(lockFile);}
}
main().catch(error=>{const journal=path.join(directory,'journal.json');const saved=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):null;const calls=saved?.attempts.length??0;
  if(saved)write(path.join(directory,'last-error.json'),{name:error.name,message:error.message});
  if(saved){fs.mkdirSync(evidence,{recursive:true});write(path.join(evidence,'report.json'),{status:'stopped',fingerprint,actualCalls:calls,attempts:saved.attempts.map(({step,operation,status,maximumUsd})=>({step,operation,status,maximumUsd})),actualProviderCharge:null,qualityVerified:false});}
  console.error(JSON.stringify({event:'short_sample_stopped',name:error.name,recordedCalls:calls}));process.exitCode=1;});
