import {listProfiles,createProfile,deleteProfile,LocalEncryptedAdapter,b64,unb64} from "./data.js";
import {initPose,detect,measure,METRICS,LIB,COMP_LABEL,RepCounter,compFrame,baseline,buildReference,defaultReference,scoreRep,SKEL} from "./engine.js";
import {stats,chart,makePDF,makeXLSX,ymd,DISCLAIMER} from "./reports.js";
const $=s=>document.querySelector(s),V=$("#view");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let store=null,prof=null,live=null;window.__ex={};
const T=window.__ex;
// ---------- voice ----------
const PH={start:["Let's begin","தொடங்குவோம்"],top:["Good, now return slowly","நல்லது, இப்போது மெதுவாக திரும்புங்கள்"],further:["Go a little further","இன்னும் கொஞ்சம் செல்லுங்கள்"],fast:["Slow down","மெதுவாக செய்யுங்கள்"],
 trunk:["Keep your trunk upright","உடலை நேராக வைத்திருங்கள்"],hipHike:["Keep your hips level","இடுப்பை சமமாக வைத்திருங்கள்"],shrug:["Relax your shoulder down","தோளை தளர்த்தி கீழே வைத்திருங்கள்"],
 valgus:["Keep your knees over your toes","முழங்கால்களை கால்விரல்களுக்கு நேராக வைத்திருங்கள்"],lumbar:["Don't arch your back","முதுகை வளைக்காதீர்கள்"],incomplete:["Go a little further","இன்னும் கொஞ்சம் செல்லுங்கள்"],
 rest:["Set complete. Rest","செட் முடிந்தது. ஓய்வெடுங்கள்"],next:["Next set. Get ready","அடுத்த செட். தயாராகுங்கள்"],done:["Exercise complete. Well done","பயிற்சி முடிந்தது. நன்றாகச் செய்தீர்கள்"],nobody:["Step into the camera view","கேமரா முன் வாருங்கள்"]};
let lang="en",voiceOn=true,lastSay=0;
function phrase(k){const p=PH[k];return p?(lang==="ta"?p[1]:p[0]):String(k)}
function say(k,force){const txt=typeof k==="number"?String(k):phrase(k);showCue(typeof k==="number"?String(k):(lang==="ta"&&PH[k]?PH[k][1]+" · "+PH[k][0]:phrase(k)));
 if(!voiceOn||!("speechSynthesis" in window))return;const now=Date.now();if(!force&&now-lastSay<1800)return;lastSay=now;
 try{const u=new SpeechSynthesisUtterance(txt);let l=lang==="ta"?"ta-IN":"en-IN";const vs=speechSynthesis.getVoices();if(lang==="ta"&&!vs.some(v=>/^ta/i.test(v.lang))){u.text=typeof k==="number"?txt:PH[k][0];l="en-IN"}u.lang=l;u.rate=1;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
let cueT=0;function showCue(t,col){const c=$("#cue");if(!c)return;c.textContent=t;c.style.color=col||"#fff";clearTimeout(cueT);cueT=setTimeout(()=>{if($("#cue"))$("#cue").textContent=""},2500)}
// ---------- files / share ----------
function dl(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
async function shareOrDownload(files,title){T.lastExport=files.map(f=>({name:f.name,size:f.size,type:f.type}));
 try{if(navigator.canShare&&navigator.canShare({files})){await navigator.share({files,title,text:title});return "shared"}}catch(e){if(e.name==="AbortError")return "cancelled"}
 for(const f of files)dl(f,f.name);return "downloaded"}
function pickFile(el){return new Promise(r=>{const i=$(el);i.value="";i.onchange=()=>r(i.files[0]||null);i.click()})}
const safe=s=>String(s||"x").replace(/[^\w-]+/g,"_").slice(0,30);
// ---------- profiles ----------
async function home(){stopLive();store=null;prof=null;$("#who").textContent="";const ps=await listProfiles();
 V.innerHTML=`<div class="card"><h2>Choose profile</h2>${ps.length?ps.map(p=>`<div class="row" style="margin:6px 0"><button class="b grow" data-open="${p.id}">${esc(p.name)} <span class="pill">${p.role==="therapist"?"Therapist":"Patient"}</span></button><button class="s" data-del="${p.id}">Delete</button></div>`).join(""):`<p class="muted">No profiles yet on this device.</p>`}</div>
 <div class="card"><h2>New profile</h2><div class="grid"><div><label>Name</label><input id="np_name"></div><div><label>Role</label><select id="np_role"><option value="patient">Patient</option><option value="therapist">Therapist</option></select></div>
 <div><label>PIN (4–8 digits)</label><input id="np_pin" type="password" inputmode="numeric" maxlength="8"></div><div><label>Repeat PIN</label><input id="np_pin2" type="password" inputmode="numeric" maxlength="8"></div></div>
 <p class="muted">The PIN encrypts this profile's data (AES-256-GCM, key derived with PBKDF2). There is no PIN recovery – a forgotten PIN means the data cannot be opened.</p><button class="g" id="np_go">Create profile</button></div>`;
 V.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>unlock(ps.find(p=>p.id===b.dataset.open)));
 V.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this profile and ALL its data on this device?")){await deleteProfile(b.dataset.del);home()}});
 $("#np_go").onclick=async()=>{const n=$("#np_name").value.trim(),pin=$("#np_pin").value;if(!n)return alert("Enter a name");if(!/^\d{4,8}$/.test(pin))return alert("PIN must be 4–8 digits");if(pin!==$("#np_pin2").value)return alert("PINs do not match");
  const p=await createProfile({name:n,role:$("#np_role").value,pin});await openStore(p,pin)}}
function unlock(p){V.innerHTML=`<div class="card"><h2>${esc(p.name)}</h2><label>PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="8" autofocus> <button class="b" id="go">Unlock</button> <button id="back">Back</button><p id="err" class="bad"></p></div>`;
 const go=async()=>{try{await openStore(p,$("#pin").value)}catch(e){$("#err").textContent=e.message}};$("#go").onclick=go;$("#pin").onkeydown=e=>{if(e.key==="Enter")go()};$("#back").onclick=home}
async function openStore(p,pin){store=await new LocalEncryptedAdapter().open(p,pin);prof=p;lang=await store.getSetting("lang","en");voiceOn=await store.getSetting("voice",true);
 $("#who").innerHTML=`${esc(p.name)} · <a href="#" id="lock" style="color:#9cf">Lock</a>`;$("#lock").onclick=e=>{e.preventDefault();home()};
 if(!(await store.getSetting("consent",false)))return consent();route()}
function route(){if(pendingLaunch){const f=pendingLaunch;pendingLaunch=null;return importFile(f)}prof.role==="therapist"?therapistHome():patientHome()}
function consent(){const items=prof.role==="therapist"?["I will only prescribe exercises appropriate for each patient after assessment.","I understand AI rep counts, angles and accuracy scores are estimates and guidance only – not a medical device.","I will obtain the patient's consent to record/share demo videos and progress data.","Shared files (packages, PDF, Excel) contain health data – I will send them only to the intended person."]
 :["My physiotherapist has assessed me and prescribed these exercises.","I will stop immediately and contact my therapist if I feel pain, dizziness, chest pain or breathlessness.","I will exercise in a clear, safe space, with support (chair/wall) or someone nearby if balance is a problem.","I understand the AI scores are guidance only – not a medical device – and may be inaccurate.","My exercise data is stored encrypted on this phone and shared only when I choose to send a report."];
 V.innerHTML=`<div class="card chk"><h2>Safety & consent</h2>${items.map((t,i)=>`<label><input type="checkbox" class="cc">${esc(t)}</label>`).join("")}<div class="note">${esc(DISCLAIMER)}</div><button class="g" id="agree" disabled>I agree – continue</button></div>`;
 const cc=[...V.querySelectorAll(".cc")];cc.forEach(c=>c.onchange=()=>$("#agree").disabled=!cc.every(x=>x.checked));
 $("#agree").onclick=async()=>{await store.setSetting("consent",new Date().toISOString());route()}}
function settingsCard(){return `<div class="card"><h3>Settings</h3><div class="row"><label style="margin:0">Voice cues</label><select id="st_voice"><option value="1">On</option><option value="0">Off</option></select>
 <label style="margin:0">Language</label><select id="st_lang"><option value="en">English</option><option value="ta">தமிழ் Tamil (text + voice if the phone has a Tamil voice)</option></select></div></div>`}
function bindSettings(){$("#st_voice").value=voiceOn?"1":"0";$("#st_lang").value=lang;$("#st_voice").onchange=async e=>{voiceOn=e.target.value==="1";await store.setSetting("voice",voiceOn)};$("#st_lang").onchange=async e=>{lang=e.target.value;await store.setSetting("lang",lang)}}
// ---------- import ----------
async function importFile(f){if(!f)return;let j;try{j=JSON.parse(await f.text())}catch(e){return alert("Not a valid package file")}
 if(j.format==="physio-exercise-rx"){if(prof.role!=="patient")return alert("This is a prescription package – open it in a Patient profile.");await importRx(j);alert("Prescription imported: "+j.rx.exercises.length+" exercises (v"+j.rx.version+")");return patientHome()}
 if(j.format==="physio-exercise-progress"){if(prof.role!=="therapist")return alert("This is a progress report – open it in a Therapist profile.");const pid=await importProgress(j);alert("Report imported: "+j.sessions.length+" sessions for "+j.patient.name);return patientDetail(pid)}
 alert("Unknown file type")}
async function importRx(j){const old=await store.list("rx");for(const o of old)if(o.id!==j.rx.id)await store.del("rx",o.id);
 for(const e of j.rx.exercises){const m=j.media&&j.media[e.id];if(m){await store.putMedia("demo_"+e.id,new Blob([unb64(m.b64)],{type:m.type}));e.hasDemo=true}}
 await store.put("rx",j.rx);await store.setSetting("patient",j.patient)}
async function importProgress(j){let pts=await store.list("patients");let p=pts.find(x=>x.id===j.patient.id);if(!p){p=j.patient;await store.put("patients",p)}
 const have=new Set((await store.list("sessions")).map(s=>s.id));let n=0;for(const s of j.sessions){s.patientId=p.id;if(!have.has(s.id)){await store.put("sessions",s);n++}else await store.put("sessions",s)}
 await store.put("reports",{patientId:p.id,imported:new Date().toISOString(),from:j.from,to:j.to,sessions:j.sessions.length,rxVersion:j.rx&&j.rx.version});return p.id}
// ---------- therapist ----------
async function therapistHome(){stopLive();const pts=await store.list("patients"),ses=await store.list("sessions");const tname=await store.getSetting("tname",prof.name);
 V.innerHTML=`<div class="card"><div class="row"><h2 class="grow" style="margin:0">Patients</h2><button class="y" id="imp">Import progress report</button></div>
 <table><tr><th>Name</th><th>ID</th><th>Condition</th><th>Last session</th><th></th></tr>${pts.map(p=>{const s=ses.filter(x=>x.patientId===p.id).map(x=>x.date).sort().pop();return `<tr><td>${esc(p.name)}</td><td>${esc(p.code)}</td><td>${esc(p.condition)}</td><td>${s||"–"}</td><td><button class="b s" data-p="${p.id}">Open</button></td></tr>`}).join("")||`<tr><td colspan=5 class="muted">No patients yet</td></tr>`}</table></div>
 <div class="card"><h3>Add patient</h3><div class="grid"><div><label>Name</label><input id="ap_name"></div><div><label>Patient ID</label><input id="ap_code"></div><div><label>Age</label><input id="ap_age" type="number"></div><div><label>Sex</label><select id="ap_sex"><option></option><option>F</option><option>M</option><option>Other</option></select></div><div><label>Condition / diagnosis</label><input id="ap_cond"></div><div><label>Phone</label><input id="ap_phone"></div></div><button class="g" id="ap_go">Add patient</button></div>
 <div class="card"><h3>Therapist / clinic name on packages</h3><input id="tname" value="${esc(tname)}"> <button class="s" id="tsave">Save</button></div>${settingsCard()}`;
 bindSettings();$("#imp").onclick=async()=>importFile(await pickFile("#filePick"));V.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>patientDetail(b.dataset.p));
 $("#tsave").onclick=async()=>{await store.setSetting("tname",$("#tname").value)};
 $("#ap_go").onclick=async()=>{const n=$("#ap_name").value.trim();if(!n)return alert("Name required");const p=await store.put("patients",{name:n,code:$("#ap_code").value,age:$("#ap_age").value,sex:$("#ap_sex").value,condition:$("#ap_cond").value,phone:$("#ap_phone").value});patientDetail(p.id)}}
const today=()=>ymd(new Date());
function newEx(key){const t=LIB.find(l=>l.key===key)||{key:"custom",name:"Custom exercise",metric:"knee",start:90,end:160,tempo:3,trunkMax:15,comps:["trunk","fast","incomplete"],steps:[],reps:10,sets:2,rest:45};
 return {id:"e"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),key:t.key,name:t.name,metric:t.metric,side:"auto",start:t.start,end:t.end,targetRom:Math.abs(t.end-t.start),reps:t.reps,sets:t.sets,rest:t.rest,duration:10,perDay:2,daysPerWeek:7,tempo:t.tempo,trunkMax:t.trunkMax,comps:[...t.comps],steps:[...t.steps],instructions:"",view:t.view||""}}
async function getRx(pid){const all=(await store.list("rx")).filter(r=>r.patientId===pid);return all.sort((a,b)=>(b.version||0)-(a.version||0))[0]||null}
async function patientDetail(pid,tab){stopLive();const p=await store.get("patients",pid);let rx=await getRx(pid);const ses=(await store.list("sessions")).filter(s=>s.patientId===pid);const reps=(await store.list("reports")).filter(r=>r.patientId===pid);
 if(!rx)rx={patientId:pid,version:0,startDate:today(),exercises:[],notes:""};
 V.innerHTML=`<button id="bk">← Patients</button><div class="card"><h2>${esc(p.name)} <span class="muted">${esc(p.code)} · ${esc(p.age)} ${esc(p.sex)} · ${esc(p.condition)}</span></h2>
 <div class="row"><button class="${tab!=="dash"?"b":""}" id="t_rx">Prescription</button><button class="${tab==="dash"?"b":""}" id="t_dash">Dashboard (${ses.length} sessions)</button></div></div><div id="pd"></div>`;
 $("#bk").onclick=therapistHome;$("#t_rx").onclick=()=>patientDetail(pid);$("#t_dash").onclick=()=>patientDetail(pid,"dash");
 tab==="dash"?dashboard(p,rx,ses,reps):rxEditor(p,rx)}
function rxEditor(p,rx){const D=$("#pd");
 D.innerHTML=`<div class="card"><div class="row"><h3 class="grow">Prescription v${rx.version||0} ${rx.version?"(saved)":"(draft)"}</h3><label style="margin:0">Start date</label><input type="date" id="rx_start" value="${rx.startDate||today()}"></div>
 <div id="exs"></div><div class="row" style="margin-top:8px"><select id="addsel"><option value="">+ Add exercise from library…</option>${LIB.map(l=>`<option value="${l.key}">${l.name}</option>`).join("")}<option value="custom">Custom exercise (choose joint angle & thresholds)</option></select></div>
 <label>General notes for patient</label><textarea id="rx_notes" rows=2>${esc(rx.notes)}</textarea>
 <div class="row" style="margin-top:8px"><button class="g" id="rx_save">Save prescription</button><button class="y" id="rx_export">Save & export package</button></div><p class="muted">The package (.json) contains the prescription, demo videos and reference angle curves. Send it to the patient (WhatsApp / email); they open it with "Import prescription".</p></div>`;
 const draw=()=>{$("#exs").innerHTML=rx.exercises.map((e,i)=>exCard(e,i)).join("")||`<p class="muted">No exercises yet.</p>`;bindEx()};
 const bindEx=()=>{rx.exercises.forEach((e,i)=>{const q=s=>D.querySelector(`[data-i="${i}"] ${s}`);
  D.querySelectorAll(`[data-i="${i}"] [data-f]`).forEach(inp=>inp.onchange=()=>{const f=inp.dataset.f;let v=inp.value;if(inp.type==="number")v=+v;if(f==="steps")v=inp.value.split("\n").map(s=>s.trim()).filter(Boolean);e[f]=v;if(f==="start"||f==="end"){e.targetRom=Math.abs(e.end-e.start);q('[data-f="targetRom"]').value=e.targetRom}});
  D.querySelectorAll(`[data-i="${i}"] [data-c]`).forEach(cb=>cb.onchange=()=>{const c=cb.dataset.c;e.comps=e.comps.filter(x=>x!==c);if(cb.checked)e.comps.push(c)});
  q(".rm").onclick=()=>{if(confirm("Remove "+e.name+"?")){rx.exercises.splice(i,1);draw()}};
  q(".rec").onclick=()=>demoRecorder(p,rx,e,()=>rxEditor(p,rx));q(".upl").onclick=async()=>{const f=await pickFile("#vidPick");if(f)await demoFromFile(rx,e,f,q(".dstat"))}})};
 $("#addsel").onchange=e=>{if(!e.target.value)return;rx.exercises.push(newEx(e.target.value));e.target.value="";draw()};
 const save=async()=>{rx.startDate=$("#rx_start").value||today();rx.notes=$("#rx_notes").value;rx.version=(rx.version||0)+1;rx.therapist=await store.getSetting("tname",prof.name);rx.patient={id:p.id,name:p.name,code:p.code};rx.saved=new Date().toISOString();rx.id=rx.id||"rx_"+p.id;await store.put("rx",rx);return rx};
 $("#rx_save").onclick=async()=>{if(!rx.exercises.length)return alert("Add at least one exercise");await save();patientDetail(p.id)};
 $("#rx_export").onclick=async()=>{if(!rx.exercises.length)return alert("Add at least one exercise");await save();await exportRx(p,rx);patientDetail(p.id)};
draw()}
function exCard(e,i){const num=(f,l,st)=>`<div><label>${l}</label><input type="number" data-f="${f}" value="${esc(e[f])}" step="${st||1}"></div>`;
 return `<div class="card" data-i="${i}" style="background:#111"><div class="row"><b class="grow">${i+1}. <input data-f="name" value="${esc(e.name)}" style="width:60%"></b><button class="r s rm">Remove</button></div>
 <div class="grid"><div><label>Primary joint angle</label><select data-f="metric">${Object.entries(METRICS).map(([k,m])=>`<option value="${k}" ${k===e.metric?"selected":""}>${m.label}</option>`).join("")}</select></div>
 <div><label>Side</label><select data-f="side">${["auto","L","R"].map(s=>`<option ${s===e.side?"selected":""} value="${s}">${s==="auto"?"Auto (most visible)":s==="L"?"Left":"Right"}</option>`).join("")}</select></div>
 ${num("start","Start angle °")}${num("end","End angle °")}${num("targetRom","Target ROM °")}${num("reps","Reps / set")}${num("sets","Sets")}${num("rest","Rest between sets (s)")}${num("duration","Duration (min)")}${num("perDay","Times per day")}${num("daysPerWeek","Days per week")}${num("tempo","Rep time (s)",.5)}${num("trunkMax","Trunk lean limit °")}</div>
 <label>Compensations to watch</label><div class="row">${Object.entries(COMP_LABEL).map(([k,l])=>`<label style="display:inline-flex;gap:4px;margin:2px 6px 2px 0;color:#ddd"><input type="checkbox" data-c="${k}" ${e.comps.includes(k)?"checked":""}>${l}</label>`).join("")}</div>
 <label>Checklist (one per line)</label><textarea data-f="steps" rows=3>${esc((e.steps||[]).join("\n"))}</textarea><label>Instructions</label><textarea data-f="instructions" rows=2>${esc(e.instructions)}</textarea>
 <div class="row"><button class="b s rec">● Record demo with camera</button><button class="s upl">Upload demo video</button><span class="muted dstat">${e.hasDemo?`Demo saved · reference: ${e.ref&&!e.ref.synthetic?e.ref.reps+" rep(s), "+e.ref.dur.toFixed(1)+" s/rep, peak "+Math.round(e.ref.peak)+"°":"none detected (default curve used)"}`:"No demo yet (default reference curve will be used)"}</span></div>
 <p class="muted">Rep = angle moves from start (${e.start}°) to ≥85% of the way to end (${e.end}°) and back. Camera view: ${esc(e.view||"any")}.</p></div>`}
async function exportRx(p,rx){const media={};for(const e of rx.exercises){const b=await store.getMedia("demo_"+e.id);if(b)media[e.id]={type:b.type,b64:b64(await b.arrayBuffer())}}
 const pkg={format:"physio-exercise-rx",v:1,created:new Date().toISOString(),patient:{id:p.id,name:p.name,code:p.code,age:p.age,sex:p.sex,condition:p.condition},rx,media};
 const f=new File([JSON.stringify(pkg)],`rx_${safe(p.name)}_v${rx.version}.json`,{type:"application/json"});T.rxPackage=pkg;return shareOrDownload([f],"Exercise prescription for "+p.name)}
// trajectory from a video file (seek frame by frame)
async function demoFromFile(rx,e,file,statEl){statEl.textContent="Analysing video…";await ensurePose();const v=document.createElement("video");v.muted=true;v.playsInline=true;v.src=URL.createObjectURL(file);
 await new Promise(r=>v.onloadedmetadata=r);const W=Math.min(640,v.videoWidth),H=Math.round(W*v.videoHeight/v.videoWidth);const c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");const traj=[];
 const dur=Math.min(v.duration||0,60);for(let t=0;t<dur;t+=1/15){v.currentTime=t;await new Promise(r=>v.onseeked=r);g.drawImage(v,0,0,W,H);const P=detect(c,W,H);if(P){const m=measure(P,e.metric,e.side);if(m.vis>.3)traj.push({t:Math.round(t*1000),v:m.v})}statEl.textContent="Analysing "+Math.round(100*t/dur)+"%"}
 await saveDemo(rx,e,file,traj);statEl.textContent=e.ref&&!e.ref.synthetic?`Demo saved · reference: ${e.ref.reps} rep(s), ${e.ref.dur.toFixed(1)} s/rep, peak ${Math.round(e.ref.peak)}° (save prescription to keep)`:`Demo saved, but no full rep detected between ${e.start}° and ${e.end}° – default curve used. Check thresholds.`}
async function saveDemo(rx,e,blob,traj){await store.putMedia("demo_"+e.id,blob);e.hasDemo=true;e.traj=traj.map(s=>({t:s.t,v:Math.round(s.v*10)/10}));e.ref=buildReference(traj,e.start,e.end)||{...defaultReference(e),synthetic:true};T.lastRef=e.ref}
// ---------- camera / live ----------
let poseP=null;function ensurePose(){return poseP||(poseP=initPose())}
async function startCam(video,facing){const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:640},height:{ideal:480}},audio:false});video.srcObject=s;await video.play();return s}
function stopLive(){if(live){live.stop=true;if(live.stream)live.stream.getTracks().forEach(t=>t.stop());if(live.rec&&live.rec.state!=="inactive")try{live.rec.stop()}catch(e){}live=null}try{speechSynthesis.cancel()}catch(e){}}
function drawPose(g,P,W,H,hi,col){g.clearRect(0,0,W,H);if(!P)return;g.lineWidth=Math.max(2,W/200);g.strokeStyle="#ffffffaa";for(const [a,b] of SKEL){if(P[a].v<.3||P[b].v<.3)continue;g.beginPath();g.moveTo(P[a].x,P[a].y);g.lineTo(P[b].x,P[b].y);g.stroke()}
 g.strokeStyle=col||"#30d158";g.lineWidth=Math.max(4,W/110);if(hi){g.beginPath();g.moveTo(hi[0].x,hi[0].y);g.lineTo(hi[1].x,hi[1].y);g.lineTo(hi[2].x,hi[2].y);g.stroke();g.fillStyle=col||"#30d158";g.beginPath();g.arc(hi[1].x,hi[1].y,W/60,0,7);g.fill()}}
const SIDX={L:{e:7,s:11,el:13,w:15,h:23,k:25,a:27,heel:29,t:31},R:{e:8,s:12,el:14,w:16,h:24,k:26,a:28,heel:30,t:32}};
function hiPts(P,metric,side){const m=METRICS[metric],S=SIDX[side];if(metric==="kneeMin"){const l=ang3x(P,23,25,27),r=ang3x(P,24,26,28);return l<r?[P[23],P[25],P[27]]:[P[24],P[26],P[28]]}
 if(metric==="heel")return [P[S.a],P[S.heel],P[S.t]];if(metric==="hipFlex")return [P[S.s],P[S.h],P[S.a]];if(metric==="hipAbd")return [P[S.s],P[S.h],P[S.a]];const k=m.idx;return [P[S[k[0]]],P[S[k[1]]],P[S[k[2]]]]}
function ang3x(P,a,b,c){const v1=Math.atan2(P[a].y-P[b].y,P[a].x-P[b].x),v2=Math.atan2(P[c].y-P[b].y,P[c].x-P[b].x);let d=Math.abs(v1-v2)*180/Math.PI;return d>180?360-d:d}
function stageHTML(){return `<div id="stage"><video playsinline muted></video><canvas></canvas><div id="prog"><div></div></div><div id="hud"><div><div class="big" id="h_rep">0</div><div id="h_set"></div></div><div style="text-align:right"><div class="big" id="h_ang">–</div><div id="h_lbl" class="muted"></div></div></div><div id="arrow"></div><div id="cue"></div><div id="rest"><div>Rest</div><b id="restN">0</b><button class="y" id="skipRest" style="pointer-events:auto">Skip rest</button></div></div>`}
async function demoRecorder(p,rx,e,back){stopLive();const D=$("#pd");D.innerHTML=`<div class="card"><h3>Record demo – ${esc(e.name)}</h3><p class="muted">Position the camera (${esc(e.view||"any view")}), whole body visible. Perform 2–3 good reps at the tempo you want. The angle curve is extracted live and becomes the reference.</p>${stageHTML()}
 <div class="row"><select id="fc"><option value="environment">Back camera</option><option value="user">Front camera</option></select><button class="r" id="recb" disabled>● Start recording</button><button id="cancel">Done / back</button><span id="rs" class="muted"></span></div></div>`;
 const st=$("#stage"),video=st.querySelector("video"),cv=st.querySelector("canvas"),g=cv.getContext("2d");live={};const L=live;
 const go=async()=>{if(L.stream)L.stream.getTracks().forEach(t=>t.stop());try{L.stream=await startCam(video,$("#fc").value)}catch(err){$("#rs").textContent="Camera error: "+err.message;return}cv.width=video.videoWidth;cv.height=video.videoHeight;video.classList.toggle("mir",$("#fc").value==="user");cv.classList.toggle("mir",$("#fc").value==="user");$("#recb").disabled=false};
 $("#fc").onchange=go;$("#rs").textContent="Loading pose model…";await ensurePose();$("#rs").textContent="";await go();
 let traj=[],t0=0,chunks=[];
 $("#recb").onclick=()=>{if(!L.rec||L.rec.state==="inactive"){chunks=[];traj=[];const mt=["video/webm;codecs=vp9","video/webm","video/mp4"].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||"";L.rec=new MediaRecorder(L.stream,mt?{mimeType:mt,videoBitsPerSecond:1200000}:{});L.rec.ondataavailable=ev=>ev.data.size&&chunks.push(ev.data);
   L.rec.onstop=async()=>{const blob=new Blob(chunks,{type:L.rec.mimeType||"video/webm"});await saveDemo(rx,e,blob,traj);$("#rs").textContent=e.ref.synthetic?"Saved – no full rep detected; check start/end thresholds.":`Saved · ${e.ref.reps} reference rep(s), ${e.ref.dur.toFixed(1)} s/rep, peak ${Math.round(e.ref.peak)}°. Remember to Save prescription.`};
   L.rec.start(250);t0=performance.now();$("#recb").textContent="■ Stop recording"}else{L.rec.stop();$("#recb").textContent="● Start recording"}};
 $("#cancel").onclick=()=>{stopLive();back()};
 const loop=()=>{if(L.stop)return;if(video.readyState>=2){const P=detect(video,cv.width,cv.height);if(P){const m=measure(P,e.metric,e.side);drawPose(g,P,cv.width,cv.height,hiPts(P,e.metric,m.side));$("#h_ang").textContent=Math.round(m.v)+"°";
   if(L.rec&&L.rec.state==="recording"&&m.vis>.3)traj.push({t:performance.now()-t0,v:m.v});$("#h_rep").textContent=L.rec&&L.rec.state==="recording"?"REC "+((performance.now()-t0)/1000).toFixed(0)+"s":""}}requestAnimationFrame(loop)};loop()}
// ---------- patient ----------
async function patientHome(){stopLive();const rx=(await store.list("rx"))[0];const ses=await store.list("sessions");const me=await store.getSetting("patient",{name:prof.name});
 let h=`<div class="card"><div class="row"><h2 class="grow" style="margin:0">Today · ${new Date().toLocaleDateString()}</h2><button class="y" id="imp">Import prescription</button></div>`;
 if(!rx)h+=`<p class="muted">No prescription yet. Ask your physiotherapist to send you the prescription file, then tap "Import prescription".</p></div>`;
 else{h+=`<p class="muted">From ${esc(rx.therapist)} · v${rx.version} · started ${rx.startDate}${rx.notes?" · "+esc(rx.notes):""}</p>`+rx.exercises.map(e=>{const n=ses.filter(s=>s.exId===e.id&&s.date===today()).length;const ok=n>=e.perDay;
   return `<div class="card" style="background:#111"><div class="row"><div class="grow"><b>${esc(e.name)}</b><div class="muted">${e.sets} sets × ${e.reps} reps · rest ${e.rest}s · ${e.perDay}×/day, ${e.daysPerWeek} days/week</div><div class="${ok?"ok":n?"warn":"muted"}">Today: ${n}/${e.perDay} sessions ${ok?"✓":""}</div></div><button class="${ok?"":"g"}" data-ex="${e.id}">${ok?"Do again":"Start"}</button></div></div>`}).join("")+`</div>`;
  const st=stats(rx,ses,null,today());const s=st.summary;
  h+=`<div class="card"><h2>My progress</h2><div class="row"><span class="pill">Sessions ${s.sessions}</span><span class="pill">Reps ${s.reps}/${s.presReps}</span><span class="pill">Avg accuracy ${s.acc??"–"}% (AI guidance)</span><span class="pill">Compliance ${s.compliance??"–"}%</span><span class="pill">Days missed ${s.missedDays}</span></div>
  <div id="charts"></div>${histTable(st)}<div class="row" style="margin-top:8px"><button class="b" id="share">Send report to therapist</button><button id="pdf">PDF</button><button id="xls">Excel</button></div><p class="muted">"Send report" shares the progress package (.json for your therapist's app) plus PDF and Excel files via WhatsApp, email etc.</p></div>`}
 h+=settingsCard();V.innerHTML=h;bindSettings();$("#imp").onclick=async()=>importFile(await pickFile("#filePick"));
 if(rx){V.querySelectorAll("[data-ex]").forEach(b=>b.onclick=()=>exercisePrep(rx,rx.exercises.find(e=>e.id===b.dataset.ex)));const st=stats(rx,ses,null,today());
  const c=$("#charts");c.append(chart(st.days.slice(-14),"Daily (last 14 days)","date"),chart(st.weeks.slice(-8),"Weekly","week"));c.querySelectorAll("canvas").forEach(x=>{x.style.width="100%";x.style.borderRadius="8px";x.style.marginTop="6px"});
  $("#share").onclick=()=>exportProgress(me,rx,ses,["json","pdf","xlsx"]);$("#pdf").onclick=()=>exportProgress(me,rx,ses,["pdf"]);$("#xls").onclick=()=>exportProgress(me,rx,ses,["xlsx"])}}
function histTable(st){return `<h3>Daily history</h3><table><tr><th>Date</th><th>Sessions</th><th>Reps</th><th>Accuracy</th><th>ROM</th><th>Compliance</th><th>Missed / incomplete</th></tr>${st.days.slice().reverse().slice(0,31).map(d=>`<tr><td>${d.date}</td><td>${d.sessions}/${d.expected}</td><td>${d.reps}/${d.presReps}</td><td>${d.acc??"–"}%</td><td>${d.rom??"–"}°</td><td class="${d.compliance>=80?"ok":d.compliance>=50?"warn":"bad"}">${d.compliance??"–"}%</td><td class="muted">${esc([...d.missed,d.incomplete?d.incomplete+" incomplete":""].filter(Boolean).join("; "))}</td></tr>`).join("")}</table>`}
async function exportProgress(me,rx,ses,kinds){const st=stats(rx,ses,null,today());const nm=safe(me.name)+"_"+today();const files=[];const rxLite={...rx,exercises:rx.exercises.map(e=>{const {traj,...r}=e;return r})};
 if(kinds.includes("json"))files.push(new File([JSON.stringify({format:"physio-exercise-progress",v:1,generated:new Date().toISOString(),from:st.summary.from,to:st.summary.to,patient:me,rx:rxLite,sessions:ses})],`progress_${nm}.json`,{type:"application/json"}));
 if(kinds.includes("pdf"))files.push(new File([makePDF(me,rx,ses,st)],`report_${nm}.pdf`,{type:"application/pdf"}));
 if(kinds.includes("xlsx"))files.push(new File([makeXLSX(me,rx,ses,st)],`report_${nm}.xlsx`,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
 return shareOrDownload(files,"Exercise progress report – "+me.name)}
async function exercisePrep(rx,e){stopLive();const demo=await store.getMedia("demo_"+e.id);
 V.innerHTML=`<button id="bk">← Today</button><div class="card"><h2>${esc(e.name)}</h2><p>${e.sets} sets × ${e.reps} reps · rest ${e.rest}s · about ${e.duration} min</p>${demo?`<video class="demo" controls playsinline loop src="${URL.createObjectURL(demo)}"></video>`:`<p class="muted">No demo video in this prescription.</p>`}
 ${e.instructions?`<p>${esc(e.instructions)}</p>`:""}<div class="chk">${(e.steps||[]).map(s=>`<label><input type="checkbox" class="cl">${esc(s)}</label>`).join("")}<label><input type="checkbox" class="cl">Space is clear and safe; I will stop if I feel pain</label></div>
 <p class="muted">Camera: ${esc(e.view||"any")} view, whole body visible, ~2–3 m away. Prop the phone up.</p>
 <div class="row"><select id="fc"><option value="user">Front camera</option><option value="environment">Back camera</option></select><button class="g" id="go">Start exercise</button><button class="s" id="tv">Use a video file instead</button></div></div>`;
 $("#bk").onclick=patientHome;const go=src=>{if(![...V.querySelectorAll(".cl")].every(c=>c.checked)&&!confirm("Not all checklist items are ticked. Start anyway?"))return;runExercise(rx,e,src)};
 $("#go").onclick=()=>go({cam:$("#fc").value});$("#tv").onclick=async()=>{const f=await pickFile("#vidPick");if(f)go({file:f})}}
async function runExercise(rx,e,src){stopLive();V.innerHTML=`<div class="card"><div class="row"><b class="grow">${esc(e.name)}</b><button class="r" id="stop">Stop & save</button></div>${stageHTML()}<div id="reps" style="margin-top:6px"></div><p id="msg" class="muted">Loading pose model…</p><p class="muted">Scores are AI guidance only, not a medical device.</p></div>`;
 const st=$("#stage"),video=st.querySelector("video"),cv=st.querySelector("canvas"),g=cv.getContext("2d");const L=live={};
 await ensurePose();try{if(src.file){video.src=URL.createObjectURL(src.file);video.loop=true;await video.play()}else{L.stream=await startCam(video,src.cam);if(src.cam==="user"){video.classList.add("mir");cv.classList.add("mir")}}}catch(err){$("#msg").textContent="Camera error: "+err.message;return}
 cv.width=video.videoWidth;cv.height=video.videoHeight;$("#msg").textContent="";
 const ref=e.ref||defaultReference(e);const rc=new RepCounter(e.start,e.end);const S={set:1,inSet:0,reps:[],partials:0,rest:false,t0:Date.now(),done:false,frames:0,lost:0};Object.assign(T,{live:S,rc});
 let base=null;const upd=()=>{$("#h_rep").textContent=S.inSet+"/"+e.reps;$("#h_set").textContent="Set "+Math.min(S.set,e.sets)+" of "+e.sets;$("#h_lbl").textContent=METRICS[e.metric].label.split(" (")[0];
  $("#reps").innerHTML=S.reps.slice(-12).map((r,i)=>`<span class="pill" style="background:${r.acc>=80?"#0f3d1c":r.acc>=60?"#3d3400":"#3d0f0f"}">S${r.set} #${r.n}: ${r.acc}% · ROM ${r.rom}° · ${r.dur}s${r.comps.length?" · "+r.comps.map(c=>COMP_LABEL[c]).join(", "):""}</span>`).join("")};
 say("start",true);upd();
 const finish=async(auto)=>{if(S.done)return;S.done=true;const dur=(Date.now()-S.t0)/1000;L.stop=true;if(L.stream)L.stream.getTracks().forEach(t=>t.stop());
  const comps={};for(const r of S.reps)for(const c of r.comps)comps[c]=(comps[c]||0)+1;if(S.partials)comps.incomplete=(comps.incomplete||0)+S.partials;
  const setsDone=Math.min(e.sets,S.set-1+(S.inSet>=e.reps?1:0));const sess={exId:e.id,exName:e.name,rxId:rx.id,rxVersion:rx.version,date:ymd(new Date(S.t0)),startedAt:new Date(S.t0).toISOString(),endedAt:new Date().toISOString(),durSec:Math.round(dur),
   presSets:+e.sets,presReps:+e.reps,setsDone,repsDone:S.reps.length,repsPerSet:Array.from({length:e.sets},(_,i)=>S.reps.filter(r=>r.set===i+1).length),partials:S.partials,reps:S.reps,
   acc:S.reps.length?Math.round(S.reps.reduce((a,r)=>a+r.acc,0)/S.reps.length):0,romAvg:S.reps.length?Math.round(S.reps.reduce((a,r)=>a+r.rom,0)/S.reps.length):0,romMax:S.reps.length?Math.max(...S.reps.map(r=>r.rom)):0,targetRom:e.targetRom||Math.abs(e.end-e.start),comps,complete:S.reps.length>=e.sets*e.reps};
  if(sess.repsDone||dur>10){await store.put("sessions",sess);T.savedSession=sess}
  if(auto)say("done",true);V.innerHTML=`<div class="card"><h2>${sess.complete?"✓ Session complete":"Session saved (incomplete)"}</h2><p>${esc(e.name)} · ${sess.setsDone}/${sess.presSets} sets · ${sess.repsDone}/${sess.presSets*sess.presReps} reps · ${Math.round(dur/60*10)/10} min</p>
   <p>Average accuracy <b>${sess.acc}%</b> (AI guidance) · ROM avg ${sess.romAvg}° / best ${sess.romMax}° (target ${sess.targetRom}°)</p><p>${Object.keys(comps).length?"Watch: "+Object.entries(comps).map(([k,v])=>COMP_LABEL[k]+" ×"+v).join(", "):"No compensations detected"}</p><button class="b" id="bk">Back to today</button></div>`;$("#bk").onclick=patientHome};
 $("#stop").onclick=()=>finish(false);
 const startRest=()=>{S.rest=true;say("rest",true);let n=+e.rest||30;$("#rest").style.display="flex";$("#restN").textContent=n;const end=()=>{clearInterval(L.ri);$("#rest").style.display="none";S.rest=false;S.set++;S.inSet=0;rc.reset();upd();say("next",true)};
  $("#skipRest").onclick=end;L.ri=setInterval(()=>{if(L.stop){clearInterval(L.ri);return}n--;if($("#restN"))$("#restN").textContent=n;if(n===3)say(3,true);if(n<=0)end()},1000)};
 let lastComp={};
 const loop=()=>{if(L.stop)return;if(video.readyState>=2&&!S.rest){const P=detect(video,cv.width,cv.height);S.frames++;
   if(!P){S.lost++;drawPose(g,null,cv.width,cv.height);if(S.lost%60===30)say("nobody")}else{const m=measure(P,e.metric,e.side);
    if(m.vis<.3){S.lost++;if(S.lost%60===30)say("nobody")}else{S.lost=0;const now=performance.now();const {p,ev}=rc.update(m.v,now);T.lastAngle=m.v;
     if(rc.state==="rest"){const b=baseline(P);base=base?{es:base.es*.8+b.es*.2,pel:base.pel*.8+b.pel*.2}:b}
     const cs=rc.state==="move"?compFrame(P,e,base):[];if(rc.cur)cs.forEach(c=>{rc.cur.cc=rc.cur.cc||{};rc.cur.cc[c]=(rc.cur.cc[c]||0)+1;if(rc.cur.cc[c]===4){rc.cur.comps.add(c);if(!lastComp[c]||now-lastComp[c]>4000){lastComp[c]=now;say(c)}}});
     const col=cs.length?"#ff3b30":p>=.85?"#30d158":p>.3?"#ffd400":"#0a84ff";st.style.borderColor=col;drawPose(g,P,cv.width,cv.height,hiPts(P,e.metric,m.side),col);
     $("#h_ang").textContent=Math.round(m.v)+"°";$("#prog div").style.height=Math.max(0,Math.min(100,p*100))+"%";$("#prog div").style.background=col;
     const toward=(e.end>e.start)?"↑":"↓",back=(e.end>e.start)?"↓":"↑";$("#arrow").textContent=rc.state==="move"?(rc.cur&&rc.cur.peakP>=.85?back:toward):toward;$("#arrow").style.color=col;
     if(ev&&ev.type==="top")say("top");
     if(ev&&ev.type==="rep"){const r=ev.rep;if(r.complete){const sc=scoreRep(r,e,ref);sc.set=S.set;sc.n=S.inSet+1;S.reps.push(sc);S.inSet++;upd();
       const warn=sc.comps.find(c=>c==="fast");say(S.inSet,true);if(warn)setTimeout(()=>say("fast",true),700);
       if(S.inSet>=e.reps){if(S.set>=e.sets){finish(true);return}startRest()}}else{S.partials++;say("further",true);showCue(phrase("further"),"#ffd400")}}}}}
  requestAnimationFrame(loop)};loop()}
// ---------- therapist dashboard ----------
function dashboard(p,rx,ses,reports){const D=$("#pd");const all=ses.slice();const from0=all.length?all.map(s=>s.date).sort()[0]:today();
 D.innerHTML=`<div class="card"><div class="row"><label style="margin:0">View</label><select id="dv"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><label style="margin:0">From</label><input type="date" id="df" value="${rx.startDate&&rx.startDate<from0?rx.startDate:from0}"><label style="margin:0">To</label><input type="date" id="dt" value="${today()}"><button class="b s" id="dpdf">Download PDF</button><button class="s" id="dxls">Download Excel</button><button class="y s" id="dimp">Import report</button></div>
 <p class="muted">${reports.length?"Imported reports: "+reports.map(r=>new Date(r.imported).toLocaleDateString()+" ("+r.sessions+" sessions)").join(", "):"No reports imported yet."}</p><div id="dsum"></div><div id="dch"></div><div id="dtab"></div></div>`;
 const render=()=>{const f=$("#df").value,t=$("#dt").value;const ss=all.filter(s=>s.date>=f&&s.date<=t);const st=stats(rx.exercises.length?rx:{exercises:[]},ss,f,t);const s=st.summary;const v=$("#dv").value;
  $("#dsum").innerHTML=`<div class="row"><span class="pill">Sessions ${s.sessions} (${s.completeSessions} complete)</span><span class="pill">Reps ${s.reps}/${s.presReps}</span><span class="pill">Accuracy ${s.acc??"–"}%</span><span class="pill">Compliance ${s.compliance??"–"}%</span><span class="pill">Days with misses ${s.missedDays}</span><span class="pill">Top issues: ${esc(s.topComps.join(", ")||"none")}</span></div>
  <table style="margin-top:6px"><tr><th>Exercise</th><th>Sessions</th><th>Reps</th><th>Accuracy</th><th>Best ROM / target</th></tr>${st.perEx.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.sessions}</td><td>${x.reps}/${x.presReps}</td><td>${x.acc??"–"}%</td><td>${x.romBest??"–"}° / ${x.romTarget}°</td></tr>`).join("")}</table>`;
  const ch=$("#dch");ch.innerHTML="";const cc=v==="weekly"?chart(st.weeks,"Weekly","week"):v==="monthly"?chart(st.months.map(m=>({...m,compliance:null})),"Monthly accuracy","month"):chart(st.days.slice(-31),"Daily","date");cc.style.width="100%";cc.style.marginTop="6px";ch.append(cc);
  $("#dtab").innerHTML=v==="daily"?histTable(st):v==="weekly"?`<table><tr><th>Week of</th><th>Sessions</th><th>Compliance</th><th>Accuracy</th><th>Reps</th><th>Shortfall</th></tr>${st.weeks.map(w=>`<tr><td>${w.week}</td><td>${w.sessions}/${w.expected}</td><td>${w.compliance??"–"}%</td><td>${w.acc??"–"}%</td><td>${w.reps}</td><td class="muted">${esc(w.short.join("; "))}</td></tr>`).join("")}</table>`
   :`<table><tr><th>Month</th><th>Sessions</th><th>Reps</th><th>Accuracy</th></tr>${st.months.map(m=>`<tr><td>${m.month}</td><td>${m.sessions}</td><td>${m.reps}</td><td>${m.acc}%</td></tr>`).join("")}</table>`;
  return {ss,st}};
 ["#dv","#df","#dt"].forEach(s=>$(s).onchange=render);render();
 const pinfo={...p,therapist:rx.therapist};
 $("#dpdf").onclick=()=>{const {ss,st}=render();const b=makePDF(pinfo,rx,ss,st);T.lastExport=[{name:"pdf",size:b.size}];dl(b,`report_${safe(p.name)}_${today()}.pdf`)};
 $("#dxls").onclick=()=>{const {ss,st}=render();const b=makeXLSX(pinfo,rx,ss,st);T.lastExport=[{name:"xlsx",size:b.size}];dl(b,`report_${safe(p.name)}_${today()}.xlsx`)};
 $("#dimp").onclick=async()=>importFile(await pickFile("#filePick"))}
// ---------- launch ----------
let pendingLaunch=null;
if("launchQueue" in window)launchQueue.setConsumer(async lp=>{if(lp.files&&lp.files.length){const f=await lp.files[0].getFile();if(store)importFile(f);else{pendingLaunch=f;alert("Unlock your profile to import "+f.name)}}});
T.api={get store(){return store},importFile,stats};
home();ensurePose();
