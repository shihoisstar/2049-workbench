const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const{createHash}=require('node:crypto');const{createRequire}=require('node:module');const{setTimeout:delay}=require('node:timers/promises');const{spawnSync}=require('node:child_process');
const commerce=process.argv.includes('--commerce');const root=path.resolve(__dirname,'..');const req=createRequire(path.join(root,'apps/worker/package.json'));const directory=path.join(root,commerce?'.local/native-commerce-2026-10-11':'.local/native-visit-2026-10-11');const evidence=path.join(root,commerce?'docs/验收留档/NATIVE-COMMERCE-2026-10-11':'docs/验收留档/NATIVE-VISIT-2026-10-11');
const visitPlan={revision:1,category:'store_visit',fictional:true,provider:'Atlas',model:'bytedance/seedance-2.0-fast/text-to-video',durationSec:10,resolution:'720p',aspectRatio:'9:16',generateAudio:true,bitrateMode:'high',callsLimit:1,budgetCny:10,conservativeUsdCap:1,
  facts:'虚构火锅店，仅含红油锅底、牛肉和蔬菜；没有真实商家素材、店名、价格、地址、优惠或体验背书。',
  lines:['哇，你看这锅红油，咕嘟咕嘟的！','牛肉、蔬菜，满满摆了一桌。','来，夹一片牛肉下锅！你想先涮哪个？'],
  shots:[{from:0,to:3,action:'同一位成年女主持人在火锅桌旁自然开场，指向锅底，面对镜头说第一句。'},{from:3,to:6,action:'切到红油锅底、牛肉和蔬菜的近景；同一女声说第二句。'},{from:6,to:10,action:'回到同一人物，她用筷子指向食材、看向镜头，轻快地问第三句，留出自然收尾。'}],
  prompt:'制作10秒竖屏真人质感的虚构火锅店探店短视频。明亮暖色店内，同一位成年年轻女性主持人，简洁休闲衣着，桌上红油火锅、牛肉和蔬菜。0–3秒中近景：她兴奋但自然地指向锅底，对镜头说“哇，你看这锅红油，咕嘟咕嘟的！”；3–6秒切锅底和食材特写，同一女声说“牛肉、蔬菜，满满摆了一桌。”；6–10秒回到同一人物，她用筷子指向食材、笑着看向镜头说“来，夹一片牛肉下锅！你想先涮哪个？”。三句用自然标准普通话，说话像朋友现场分享，有轻重音和短暂停顿，不是播音或夸张叫卖，句末有表情回应。人物开口时口型同步，声音在切镜时保持一致。镜头利落，人物、服装、桌面和食材连续，手、筷子和食物真实。保留轻微锅底环境声，女声清楚，无背景音乐、其他人声或额外台词。不生成字幕、招牌、品牌、价格、地址或促销文字；字幕在后期按实际语音添加。',
  priceSource:'https://www.atlascloud.ai/models/bytedance/seedance-2.0-fast/text-to-video',observedUsdPerSecond:0.027,subtitleMethod:'Local faster-whisper small word timing, transcript comparison, shared ASS render; human listening still required'};
const plan=commerce?require('./native-commerce-plan.cjs').plan:visitPlan;const referenceImages=()=>commerce?[require('./native-commerce-plan.cjs').referenceDataUrl()]:undefined;
const hash=b=>createHash('sha256').update(b).digest('hex');const fingerprint=hash(JSON.stringify(plan));
function write(file,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');fs.writeFileSync(file,bytes);assert.equal(hash(fs.readFileSync(file)),hash(bytes));}
const normalize=text=>text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
function expectedPayload(){return{model:plan.model,prompt:plan.prompt,duration:10,resolution:'720p',ratio:'9:16',generate_audio:true,bitrate_mode:'high',...(commerce?{reference_images:referenceImages()}:{})};}
function reserve(report,payload){assert.equal(report.attempts.length,0,'This sample allows one POST only');assert.deepEqual(payload,expectedPayload());assert.ok(plan.conservativeUsdCap<=1&&plan.callsLimit===1);const a={status:'pending',maximumUsd:1,payloadSha256:hash(JSON.stringify(payload)),startedAt:new Date().toISOString()};report.attempts.push(a);return a;}
function captionsFromTranscript(transcript,durationMs){
  assert.equal(normalize(transcript.text),normalize(plan.lines.join('')),'Actual transcript differs from plan; review before rendering');
  const words=transcript.segments.flatMap(s=>s.words);assert.ok(words.length>0);const cues=[];let group=null;let previousEnd=0;
  for(const word of words){const startMs=Math.round(word.start*1000),endMs=Math.round(word.end*1000);assert.ok(Number.isSafeInteger(startMs)&&Number.isSafeInteger(endMs)&&startMs>=previousEnd&&endMs>startMs&&endMs<=durationMs&&typeof word.text==='string'&&Number.isFinite(word.probability)&&word.probability>=0.35,'Uncertain word timing or recognition; review required');
    if(group&&(normalize(group.text+word.text).length>12||startMs-group.endMs>350)){cues.push(group);group=null;}
    if(!group)group={startMs,endMs,text:word.text.trim()};else{group.endMs=endMs;group.text+=word.text.trim();}previousEnd=endMs;
    if(/[。！？!?]$/.test(word.text)||(/[，,、]$/.test(word.text)&&normalize(group.text).length>=6)){cues.push(group);group=null;}
  }
  if(group)cues.push(group);assert.equal(normalize(cues.map(c=>c.text).join('')),normalize(transcript.text));return cues;
}
async function main(){
  if(process.argv.includes('--prepare')){referenceImages();const prior=path.join(directory,'journal.json');if(fs.existsSync(prior))assert.equal(JSON.parse(fs.readFileSync(prior)).fingerprint,fingerprint);fs.mkdirSync(evidence,{recursive:true});write(path.join(evidence,'request-plan.json'),{...plan,fingerprint});console.log(JSON.stringify({category:plan.category,plannedPaidCalls:1,paidCalls:0,budgetCny:10,conservativeUsdCap:1,publicPriceEstimateUsd:0.27,comparableActualUsd:plan.observedComparableSampleUsd??null,approvalRequired:true}));return;}
  const stage=process.argv.includes('--execute')?'execute':process.argv.includes('--transcribe')?'transcribe':process.argv.includes('--compose')?'compose':null;assert.ok(stage);
  if(stage==='execute')assert.ok(process.argv.includes(commerce?'--authorized-commerce-cny=10':'--authorized-native-cny=10'),'Separate human approval for this category and one native video request required');
  assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'request-plan.json'))).fingerprint,fingerprint);fs.mkdirSync(directory,{recursive:true});const lockFile=path.join(directory,'execute.lock');const lock=fs.openSync(lockFile,'wx');
  try{
    const journal=path.join(directory,'journal.json');const report=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal)):{fingerprint,attempts:[]};assert.equal(report.fingerprint,fingerprint);const save=()=>write(journal,report);
    const{runMediaTool}=require('../packages/media/dist/render');const{downloadVideo}=require('../packages/media/dist/download');const{atlasVideoAdapter}=req('@wb/model-gateway');const{composeDramaExport}=req('@wb/media');
    const sourceFile='source.mp4';const sourcePath=path.join(directory,sourceFile);
    if(stage==='execute'&&!report.source){
      assert.ok(fs.existsSync(path.join(root,'.local/voice-models/faster-whisper-small/source-manifest.json')),'Prepare local transcription model before spending');
      const line=fs.readFileSync(path.join(root,'apps/api/.env'),'utf8').split(/\r?\n/).find(x=>x.startsWith('ATLAS_API_KEY='));const secret=line?.slice(14).trim().replace(/^(['"])(.*)\1$/,'$2');assert.ok(secret);const channel={baseUrl:'https://api.atlascloud.ai',config:{}};
      const fetchImpl=async(url,options={})=>{assert.equal(new URL(String(url)).origin,channel.baseUrl);if(options.method!=='POST')return fetch(url,{...options,redirect:'error'});assert.equal(new URL(String(url)).pathname,'/api/v1/model/generateVideo');const a=reserve(report,JSON.parse(String(options.body)));save();
        try{const response=await fetch(url,{...options,redirect:'error'});let json;try{json=await response.clone().json();}catch{a.status='unknown';save();return response;}const id=json?.data?.id??json?.id;
          if([400,401,403,404,422,429].includes(response.status)){a.status='rejected';a.httpStatus=response.status;}else if(response.ok&&typeof id==='string'&&id.trim()&&id.length<=500){a.status='received';a.providerTaskId=id;}else a.status='unknown';save();return response;
        }catch(error){a.status='unknown';save();throw error;}};
      const request={modelName:plan.model,modelType:'video',payload:{prompt:plan.prompt,durationSec:10,resolution:'720p',aspectRatio:'9:16',generateAudio:true,bitrateMode:'high',...(commerce?{imageUrls:referenceImages()}:{})}};const ctx=()=>({secret,fetchImpl,timeoutMs:30000,signal:AbortSignal.timeout(30000)});const prior=report.attempts[0];if(prior&&!prior.providerTaskId)throw new Error('Original submission unknown or rejected; never resubmit');
      if(!prior){const response=await fetch(plan.priceSource,{headers:{accept:'text/markdown'},redirect:'error',signal:AbortSignal.timeout(30000)});assert.ok(response.ok,'Public rate unavailable; do not submit');const rate=Number((await response.text()).match(/\$([0-9.]+) per second of generated video/)?.[1]);assert.ok(Number.isFinite(rate)&&rate>0&&rate*plan.durationSec<=plan.conservativeUsdCap,'Public price exceeds budget or is unknown');report.priceCheck={usdPerSecond:rate,estimateUsd:rate*plan.durationSec,checkedAt:new Date().toISOString()};save();}
      const id=prior?.providerTaskId??(await atlasVideoAdapter.submit(ctx(),channel,request)).providerTaskId;let url;const deadline=Date.now()+300000;
      while(Date.now()<deadline){const result=await atlasVideoAdapter.poll(ctx(),channel,id,request);if(result.status==='failed')throw new Error('Provider generation failed');if(result.status==='succeeded'){url=result.videoUrl;break;}await delay(3000);}assert.ok(url,'Still processing; resume GET with original ID');
      if(!fs.existsSync(sourcePath))await downloadVideo(url,sourcePath,0,AbortSignal.timeout(60000),64*1024*1024);
      const probe=JSON.parse(await runMediaTool('ffprobe',['-v','error','-f','mov','-show_entries','format=duration:stream=codec_type,width,height','-of','json',sourceFile],directory));const video=probe.streams.find(s=>s.codec_type==='video');const durationMs=Math.round(Number(probe.format.duration)*1000);assert.ok(video?.width>=720&&video.height>=720&&Math.abs(video.width/video.height/(9/16)-1)<0.08&&Math.abs(durationMs-10000)<=300&&probe.streams.some(s=>s.codec_type==='audio'),'Native video specification or audio missing');
      report.source={file:sourceFile,sha256:hash(fs.readFileSync(sourcePath)),width:video.width,height:video.height,durationMs};save();
    }
    assert.ok(report.source&&report.source.file===sourceFile);assert.equal(hash(fs.readFileSync(sourcePath)),report.source.sha256);
    if(stage==='transcribe'){
      const audioFile='source-audio.wav';await runMediaTool('ffmpeg',['-nostdin','-y','-protocol_whitelist','file,pipe','-f','mov','-enable_drefs','0','-i',sourceFile,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',audioFile],directory);const transcriptFile=path.join(directory,'transcript.json');
      const result=spawnSync(path.join(root,'.local/voice-analysis-env/Scripts/python.exe'),[path.join(root,'scripts/local-speech-transcribe.py'),'--input',path.join(directory,audioFile),'--output',transcriptFile],{windowsHide:true,encoding:'utf8',timeout:300000});assert.equal(result.status,0,'Local transcription failed');
      const transcript=JSON.parse(fs.readFileSync(transcriptFile));assert.equal(transcript.sourceSha256,hash(fs.readFileSync(path.join(directory,audioFile))));write(path.join(evidence,'transcript.json'),transcript);
      const cues=captionsFromTranscript(transcript,report.source.durationMs);write(path.join(evidence,'captions.json'),{sourceSha256:report.source.sha256,source:'local_asr_word_timestamps',transcriptMatchesPlan:true,humanVerified:false,cues});
    }
    if(stage==='compose'){
      const captions=JSON.parse(fs.readFileSync(path.join(evidence,'captions.json')));assert.equal(captions.sourceSha256,report.source.sha256);assert.equal(captions.transcriptMatchesPlan,true);assert.equal(normalize(captions.cues.map(c=>c.text).join('')),normalize(plan.lines.join('')));
      const output=await composeDramaExport([{bytes:fs.readFileSync(sourcePath),sha256:report.source.sha256,subtitle:'',captions:captions.cues}],'C:/Windows/Fonts/msyh.ttc');const file=commerce?'commerce-native.mp4':'store-visit-native.mp4';write(path.join(evidence,file),output.bytes);report.output={file,sha256:output.sha256,width:output.width,height:output.height,durationMs:output.durationMs};save();
    }
    write(path.join(evidence,'report.json'),{fingerprint,stage,actualCalls:report.attempts.length,source:report.source,output:report.output??null,actualProviderCharge:null,qualityVerified:false,subtitlesHumanVerified:false});console.log(JSON.stringify({stage,actualCalls:report.attempts.length,qualityVerified:false}));
  }finally{fs.closeSync(lock);fs.unlinkSync(lockFile);}
}
if(require.main===module)main().catch(error=>{const file=path.join(directory,'journal.json');const r=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;if(r)write(path.join(evidence,'report.json'),{fingerprint,status:'stopped',actualCalls:r.attempts.length,attempts:r.attempts.map(({status,maximumUsd})=>({status,maximumUsd})),qualityVerified:false});console.error(JSON.stringify({event:'native_visit_stopped',name:error.name,recordedCalls:r?.attempts.length??0}));process.exitCode=1;});
module.exports={plan,reserve,expectedPayload,captionsFromTranscript};
