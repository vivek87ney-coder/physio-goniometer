import {listProfiles,createProfile,deleteProfile,LocalEncryptedAdapter,b64,unb64} from "./data.js";
import {initPose,detect,measure,METRICS,LIB,COMP_LABEL,RepCounter,compFrame,baseline,buildReference,defaultReference,scoreRep,SKEL,classify,exDefaults,frameCheck} from "./engine.js";
import {stats,chart,makePDF,makeXLSX,ymd,DISCLAIMER,normSes,isDaily,perWeek} from "./reports.js";
const $=s=>document.querySelector(s),V=$("#view");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let store=null,prof=null,live=null;window.__ex={};
const T=window.__ex;
// ---------- voice ----------
const PH={start:["Let's begin","தொடங்குவோம்"],top:["Good, now return slowly","நல்லது, இப்போது மெதுவாக திரும்புங்கள்"],further:["Go a little further","இன்னும் கொஞ்சம் செல்லுங்கள்"],fast:["Slow down","மெதுவாக செய்யுங்கள்"],
 trunk:["Keep your trunk upright","உடலை நேராக வைத்திருங்கள்"],hipHike:["Keep your hips level","இடுப்பை சமமாக வைத்திருங்கள்"],shrug:["Relax your shoulder down","தோளை தளர்த்தி கீழே வைத்திருங்கள்"],
 valgus:["Keep your knees over your toes","முழங்கால்களை கால்விரல்களுக்கு நேராக வைத்திருங்கள்"],lumbar:["Don't arch your back","முதுகை வளைக்காதீர்கள்"],incomplete:["Go a little further","இன்னும் கொஞ்சம் செல்லுங்கள்"],
 rest:["Set complete. Rest","செட் முடிந்தது. ஓய்வெடுங்கள்"],next:["Next set. Get ready","அடுத்த செட். தயாராகுங்கள்"],done:["Exercise complete. Well done","பயிற்சி முடிந்தது. நன்றாகச் செய்தீர்கள்"],nobody:["Step into the camera view","கேமரா முன் வாருங்கள்"]};
Object.assign(PH,{good:["Good, continue","நல்லது, தொடருங்கள்"],posture:["Please correct your posture","உங்கள் உடல் நிலையை சரி செய்யுங்கள்"],trunk:["Please correct your posture","உங்கள் உடல் நிலையை சரி செய்யுங்கள்"],
 valgus:["Move your knee slightly outward","முழங்காலை சற்று வெளிப்புறமாக நகர்த்துங்கள்"],balance:["Maintain your balance","உங்கள் சமநிலையை பராமரியுங்கள்"],wrong:["Incorrect movement. Please try again","தவறான அசைவு. மீண்டும் முயற்சிக்கவும்"],
 deeper:["Go a little deeper","இன்னும் கொஞ்சம் கீழே செல்லுங்கள்"],higher:["Go a little higher","இன்னும் கொஞ்சம் மேலே உயர்த்துங்கள்"],slow:["Move a little more steadily, not too slow","சீராக செய்யுங்கள்"],shape:["Follow the demo movement","டெமோ அசைவைப் பின்பற்றுங்கள்"],
 nobody:["Please step into the camera view","தயவுசெய்து கேமரா முன் வாருங்கள்"],stepback:["Please step back so your whole body is visible","முழு உடலும் தெரிய பின்னால் செல்லுங்கள்"],go:["Start","தொடங்குங்கள்"],
 count:["You have completed {n} repetitions","நீங்கள் {n} முறை முடித்துள்ளீர்கள்"],setdone:["Set {n} complete. Rest for {r} seconds","செட் {n} முடிந்தது. {r} விநாடிகள் ஓய்வெடுங்கள்"],done:["Exercise complete. Well done","பயிற்சி முடிந்தது. நன்றாகச் செய்தீர்கள்"]});
let lang="en",voiceOn=true;
function phrase(k,a){const p=PH[k];let t=typeof k==="number"?String(k):p?(lang==="ta"?p[1]:p[0]):String(k);if(a)for(const [x,v] of Object.entries(a))t=t.replace("{"+x+"}",v);return t}
// Coach: priority queue, per-phrase cooldowns, never interrupts the utterance in progress (no speechSynthesis.cancel during a session).
// pri 3 = counts / set / countdown / done (never dropped as stale), 2 = corrections, 1 = encouragement
const COOL={good:9000,posture:6000,trunk:6000,valgus:6000,balance:6000,shrug:6000,hipHike:6000,lumbar:6000,fast:5000,slow:6000,deeper:4000,higher:4000,wrong:2500,shape:6000,nobody:7000,stepback:7000,top:5000};
const coach={q:[],busy:false,last:{},timer:0,cur:null};T.speech=[];
function slog(ev,it){T.speech.push({t:Date.now(),ev,key:it.key,text:it.text,pri:it.pri});if(T.speech.length>500)T.speech.shift()}
function say(k,opt){opt=opt||{};const key=typeof k==="number"?"num":k;const pri=opt.pri||(typeof k==="number"||["count","setdone","next","done","go","start"].includes(k)?3:["good","top"].includes(k)?1:2);
 const text=phrase(k,opt.a);if(!opt.silentCue)showCue(lang==="ta"&&PH[k]&&typeof k!=="number"?text+" · "+PH[k][0].replace(/\{(\w+)\}/g,(m,x)=>(opt.a||{})[x]??m):text,opt.col);
 const now=Date.now(),it={key,text,pri,t:now};
 if(!opt.force&&COOL[key]&&now-(coach.last[key]||0)<COOL[key]){T.speechSkips=(T.speechSkips||0)+1;return}
 if(coach.q.some(x=>x.key===key&&x.text===text)||(coach.cur&&coach.cur.text===text&&key!=="num")){slog("skip-duplicate",it);return}
 coach.last[key]=now;coach.q.push(it);coach.q.sort((a,b)=>b.pri-a.pri||a.t-b.t);
 while(coach.q.length>3){const d=coach.q.reduce((m,x)=>x.pri<m.pri||(x.pri===m.pri&&x.t<m.t)?x:m);coach.q.splice(coach.q.indexOf(d),1);slog("drop-overflow",d)}
 slog("queued",it);pump()}
function pump(){if(coach.busy)return;const now=Date.now();
 while(coach.q.length&&coach.q[0].pri<3&&now-coach.q[0].t>3500)slog("drop-stale",coach.q.shift());
 const it=coach.q.shift();if(!it)return;coach.busy=true;coach.cur=it;slog("speak",it);
 const done=()=>{if(coach.cur!==it)return;clearTimeout(coach.timer);coach.busy=false;coach.cur=null;slog("end",it);setTimeout(pump,150)};
 coach.timer=setTimeout(done,it.text.length*75+500); // fallback if onend never fires
 if(!voiceOn||!("speechSynthesis" in window))return;
 try{const u=new SpeechSynthesisUtterance(it.text);let l=lang==="ta"?"ta-IN":"en-IN";const vs=speechSynthesis.getVoices();if(lang==="ta"&&!vs.some(v=>/^ta/i.test(v.lang))&&PH[it.key])u.text=PH[it.key][0].replace(/\{n\}|\{r\}/g,m=>(it.text.match(/\d+/g)||[""])[m==="{n}"?0:1]||"");u.lang=l;u.rate=1.05;u.onend=done;u.onerror=done;speechSynthesis.speak(u)}catch(e){}}
function coachReset(){coach.q=[];coach.last={};clearTimeout(coach.timer);coach.busy=false;coach.cur=null}
let cueT=0;function showCue(t,col){const c=$("#cue");if(!c)return;c.textContent=t;c.style.color=col||"#fff";clearTimeout(cueT);cueT=setTimeout(()=>{if($("#cue"))$("#cue").textContent=""},2500)}
// ---------- files / share ----------
function dl(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
async function shareOrDownload(files,title){T.lastExport=files.map(f=>({name:f.name,size:f.size,type:f.type}));
 try{if(navigator.canShare&&navigator.canShare({files})){await navigator.share({files,title,text:title});return "shared"}}catch(e){if(e.name==="AbortError")return "cancelled"}
 for(const f of files)dl(f,f.name);return "downloaded"}
function pickFile(el){return new Promise(r=>{const i=$(el);i.value="";i.onchange=()=>r(i.files[0]||null);i.click()})}
const safe=s=>String(s||"x").replace(/[^\w-]+/g,"_").slice(0,30);
// ---------- profiles ----------
const URLPID=new URLSearchParams(location.search).get("pid")||"";
async function home(){stopLive();store=null;prof=null;$("#who").textContent="";const ps=await listProfiles();
 V.innerHTML=`<div class="card"><h2>Patient login</h2><div class="grid"><div><label>Patient ID</label><input id="pl_id" value="${esc(URLPID)}" autocapitalize="characters"></div><div><label>PIN</label><input id="pl_pin" type="password" inputmode="numeric" maxlength="8"></div></div><div class="row"><button class="g" id="pl_go">Log in</button><span id="pl_err" class="bad"></span></div>
 <p class="muted">First time on this phone? Create your patient profile below with the Patient ID your physiotherapist gave you, then import the prescription file.</p></div>
 <div class="card"><h2>Profiles on this device</h2>${ps.length?ps.map(p=>`<div class="row" style="margin:6px 0"><button class="b grow" data-open="${p.id}">${esc(p.name)}${p.code?" · "+esc(p.code):""} <span class="pill">${p.role==="therapist"?"Therapist":"Patient"}</span></button><button class="r s" data-del="${p.id}">Delete</button></div>`).join(""):`<p class="muted">No profiles yet.</p>`}</div>
 <div class="card"><h2>New profile</h2><div class="grid"><div><label>Name</label><input id="np_name"></div><div><label>Role</label><select id="np_role"><option value="patient">Patient</option><option value="therapist">Therapist</option></select></div>
 <div id="np_codew"><label>Patient ID (from your therapist)</label><input id="np_code" value="${esc(URLPID)}" autocapitalize="characters"></div>
 <div><label>PIN (4–8 digits)</label><input id="np_pin" type="password" inputmode="numeric" maxlength="8"></div><div><label>Repeat PIN</label><input id="np_pin2" type="password" inputmode="numeric" maxlength="8"></div></div>
 <p class="muted">The PIN encrypts this profile's data (AES-256-GCM, key derived with PBKDF2). There is no PIN recovery – a forgotten PIN means the data cannot be opened.</p><button class="g" id="np_go">Create profile</button></div>`;
 V.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>unlock(ps.find(p=>p.id===b.dataset.open)));
 V.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this profile and ALL its data on this device?")){await deleteProfile(b.dataset.del);home()}});
 $("#np_role").onchange=()=>{$("#np_codew").style.display=$("#np_role").value==="patient"?"":"none"};
 const plgo=async()=>{const id=$("#pl_id").value.trim().toUpperCase(),pin=$("#pl_pin").value;const c=ps.filter(p=>p.role==="patient"&&(p.code||"").toUpperCase()===id);
  if(!id)return $("#pl_err").textContent="Enter your Patient ID";if(!c.length)return $("#pl_err").textContent="No profile with this Patient ID on this device – create it below.";
  for(const p of c){try{await openStore(p,pin);return}catch(e){}}$("#pl_err").textContent="Wrong PIN"};
 $("#pl_go").onclick=plgo;$("#pl_pin").onkeydown=e=>{if(e.key==="Enter")plgo()};
 $("#np_go").onclick=async()=>{const n=$("#np_name").value.trim(),pin=$("#np_pin").value,role=$("#np_role").value,code=role==="patient"?$("#np_code").value.trim().toUpperCase():"";if(!n)return alert("Enter a name");if(role==="patient"&&!code)return alert("Enter the Patient ID from your therapist");
  if(role==="patient"&&ps.some(p=>(p.code||"").toUpperCase()===code))return alert("A profile with this Patient ID already exists on this device – use Patient login.");
  if(!/^\d{4,8}$/.test(pin))return alert("PIN must be 4–8 digits");if(pin!==$("#np_pin2").value)return alert("PINs do not match");
  const p=await createProfile({name:n,role,pin,code});await openStore(p,pin)}}
function unlock(p){V.innerHTML=`<div class="card"><h2>${esc(p.name)}</h2><label>PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="8" autofocus> <button class="b" id="go">Unlock</button> <button id="back">Back</button><p id="err" class="bad"></p></div>`;
 const go=async()=>{try{await openStore(p,$("#pin").value)}catch(e){$("#err").textContent=e.message}};$("#go").onclick=go;$("#pin").onkeydown=e=>{if(e.key==="Enter")go()};$("#back").onclick=home}
async function openStore(p,pin){store=await new LocalEncryptedAdapter().open(p,pin);prof=p;lang=await store.getSetting("lang","en");voiceOn=await store.getSetting("voice",true);await migrate();
 $("#who").innerHTML=`${esc(p.name)} · <a href="#" id="lock" style="color:#9cf">Lock</a>`;$("#lock").onclick=e=>{e.preventDefault();home()};
 if(!(await store.getSetting("consent",false)))return consent();route()}
// v1 -> v2 data migration (sessions get correct/incorrect counts; exercises get frequency, precautions and thresholds)
async function migrate(){if(await store.getSetting("mig2",false))return;let n=0;
 for(const s of await store.list("sessions"))if(s.correctReps==null){normSes(s);await store.put("sessions",s);n++}
 for(const r of await store.list("rx")){for(const e of r.exercises)fixEx(e);await store.put("rx",r)}
 await store.setSetting("mig2",new Date().toISOString());T.migrated=n}
function fixEx(e){if(!e.freq)e.freq=(+e.daysPerWeek||7)>=7?"daily":"weekly";if(e.perWeek==null)e.perWeek=e.freq==="weekly"?(+e.daysPerWeek||3):7;if(e.precautions==null)e.precautions="";
 const d=exDefaults(e);for(const k of ["romThr","simThr","tMin","tMax"])if(e[k]==null)e[k]=d[k];return e}
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
 if(j.format==="physio-exercise-rx"){if(prof.role!=="patient")return alert("This is a prescription package – open it in a Patient profile.");if(prof.code&&j.patient&&j.patient.code&&String(j.patient.code).toUpperCase()!==String(prof.code).toUpperCase()&&!confirm("This prescription is for Patient ID "+j.patient.code+" but you are logged in as "+prof.code+". Import anyway?"))return;await importRx(j);alert("Prescription imported: "+j.rx.exercises.length+" exercises (v"+j.rx.version+")");return patientHome()}
 if(j.format==="physio-exercise-progress"){if(prof.role!=="therapist")return alert("This is a progress report – open it in a Therapist profile.");const pid=await importProgress(j);alert("Report imported: "+j.sessions.length+" sessions for "+j.patient.name);return patientDetail(pid)}
 alert("Unknown file type")}
async function importRx(j){const old=await store.list("rx");for(const o of old)if(o.id!==j.rx.id)await store.del("rx",o.id);
 for(const e of j.rx.exercises){fixEx(e);const m=j.media&&j.media[e.id];if(m){await store.putMedia("demo_"+e.id,new Blob([unb64(m.b64)],{type:m.type}));e.hasDemo=true}}
 await store.put("rx",j.rx);await store.setSetting("patient",j.patient)}
async function importProgress(j){let pts=await store.list("patients");let p=pts.find(x=>x.id===j.patient.id);if(!p){p=j.patient;await store.put("patients",p)}
 const have=new Set((await store.list("sessions")).map(s=>s.id));let n=0;for(const s of j.sessions){s.patientId=p.id;if(!have.has(s.id)){await store.put("sessions",s);n++}else await store.put("sessions",s)}
 await store.put("reports",{patientId:p.id,imported:new Date().toISOString(),from:j.from,to:j.to,sessions:j.sessions.length,rxVersion:j.rx&&j.rx.version});return p.id}
// ---------- therapist ----------
async function therapistHome(){stopLive();const pts=await store.list("patients"),ses=await store.list("sessions");const tname=await store.getSetting("tname",prof.name);
 V.innerHTML=`<div class="card"><div class="row"><h2 class="grow" style="margin:0">Patients</h2><button class="y" id="imp">Import progress report</button></div>
 <table><tr><th>Name</th><th>ID</th><th>Condition</th><th>Last session</th><th></th></tr>${pts.map(p=>{const s=ses.filter(x=>x.patientId===p.id).map(x=>x.date).sort().pop();return `<tr><td>${esc(p.name)}</td><td>${esc(p.code)}</td><td>${esc(p.condition)}</td><td>${s||"–"}</td><td><button class="b s" data-p="${p.id}">Open</button></td></tr>`}).join("")||`<tr><td colspan=5 class="muted">No patients yet</td></tr>`}</table></div>
 <div class="card"><h3>Add patient</h3><div class="grid"><div><label>Name</label><input id="ap_name"></div><div><label>Patient ID (login ID; blank = auto)</label><input id="ap_code"></div><div><label>Age</label><input id="ap_age" type="number"></div><div><label>Sex</label><select id="ap_sex"><option></option><option>F</option><option>M</option><option>Other</option></select></div><div><label>Condition / diagnosis</label><input id="ap_cond"></div><div><label>Phone</label><input id="ap_phone"></div></div><button class="g" id="ap_go">Add patient</button></div>
 <div class="card"><h3>Therapist / clinic name on packages</h3><input id="tname" value="${esc(tname)}"> <button class="s" id="tsave">Save</button></div>${settingsCard()}`;
 bindSettings();$("#imp").onclick=async()=>importFile(await pickFile("#filePick"));V.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>patientDetail(b.dataset.p));
 $("#tsave").onclick=async()=>{await store.setSetting("tname",$("#tname").value)};
 $("#ap_go").onclick=async()=>{const n=$("#ap_name").value.trim();if(!n)return alert("Name required");let code=$("#ap_code").value.trim().toUpperCase()||("P"+Math.random().toString(36).slice(2,7).toUpperCase());if(pts.some(x=>(x.code||"").toUpperCase()===code))return alert("Patient ID already used");const p=await store.put("patients",{name:n,code,age:$("#ap_age").value,sex:$("#ap_sex").value,condition:$("#ap_cond").value,phone:$("#ap_phone").value});patientDetail(p.id)}}
const today=()=>ymd(new Date());
function newEx(key){const t=LIB.find(l=>l.key===key)||{key:"custom",name:"Custom exercise",metric:"knee",start:90,end:160,tempo:3,trunkMax:15,comps:["trunk","fast","incomplete"],steps:[],reps:10,sets:2,rest:45};
 return {id:"e"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),key:t.key,name:t.name,metric:t.metric,side:"auto",start:t.start,end:t.end,targetRom:Math.abs(t.end-t.start),reps:t.reps,sets:t.sets,rest:t.rest,duration:10,perDay:1,daysPerWeek:7,freq:"daily",perWeek:7,tempo:t.tempo,trunkMax:t.trunkMax,comps:[...t.comps],steps:[...t.steps],instructions:"",precautions:"",view:t.view||"",romThr:90,simThr:60,tMin:+(t.tempo*0.6).toFixed(1),tMax:+(t.tempo*2.5).toFixed(1)}}
async function getRx(pid){const all=(await store.list("rx")).filter(r=>r.patientId===pid);return all.sort((a,b)=>(b.version||0)-(a.version||0))[0]||null}
async function patientDetail(pid,tab){stopLive();const p=await store.get("patients",pid);let rx=await getRx(pid);const ses=(await store.list("sessions")).filter(s=>s.patientId===pid);const reps=(await store.list("reports")).filter(r=>r.patientId===pid);
 if(!rx)rx={patientId:pid,version:0,startDate:today(),exercises:[],notes:""};
 V.innerHTML=`<button id="bk">← Patients</button><div class="card"><h2>${esc(p.name)} <span class="muted">${esc(p.code)} · ${esc(p.age)} ${esc(p.sex)} · ${esc(p.condition)}</span></h2>
 <div class="row"><button class="${tab!=="dash"?"b":""}" id="t_rx">Prescription</button><button class="${tab==="dash"?"b":""}" id="t_dash">Dashboard (${ses.length} sessions)</button></div></div><div id="pd"></div>`;
 $("#bk").onclick=therapistHome;$("#t_rx").onclick=()=>patientDetail(pid);$("#t_dash").onclick=()=>patientDetail(pid,"dash");
 tab==="dash"?dashboard(p,rx,ses,reps):rxEditor(p,rx)}
function rxEditor(p,rx){const D=$("#pd");rx.exercises.forEach(fixEx);
 D.innerHTML=`<div class="card"><div class="row"><h3 class="grow">Prescription v${rx.version||0} ${rx.version?"(saved)":"(draft)"}</h3><label style="margin:0">Start date</label><input type="date" id="rx_start" value="${rx.startDate||today()}"></div>
 <div id="exs"></div><div class="row" style="margin-top:8px"><select id="addsel"><option value="">+ Add exercise from library…</option>${LIB.map(l=>`<option value="${l.key}">${l.name}</option>`).join("")}<option value="custom">Custom exercise (choose joint angle & thresholds)</option></select></div>
 <label>General notes for patient</label><textarea id="rx_notes" rows=2>${esc(rx.notes)}</textarea>
 <div class="row" style="margin-top:8px"><button class="g" id="rx_save">Save prescription</button><button class="y" id="rx_export">Save & export package</button><button class="b" id="rx_onb">Onboarding package (link + QR + prescription)</button></div><div id="onb"></div><p class="muted">The package (.json) contains the prescription, demo videos and reference angle curves. Send it to the patient (WhatsApp / email); they open it with "Import prescription".</p></div>`;
 const draw=()=>{$("#exs").innerHTML=rx.exercises.map((e,i)=>exCard(e,i)).join("")||`<p class="muted">No exercises yet.</p>`;bindEx()};
 const bindEx=()=>{rx.exercises.forEach((e,i)=>{const q=s=>D.querySelector(`[data-i="${i}"] ${s}`);
  D.querySelectorAll(`[data-i="${i}"] [data-f]`).forEach(inp=>inp.onchange=()=>{const f=inp.dataset.f;let v=inp.value;if(inp.type==="number")v=+v;if(f==="steps")v=inp.value.split("\n").map(s=>s.trim()).filter(Boolean);e[f]=v;if(f==="start"||f==="end"){e.targetRom=Math.abs(e.end-e.start);q('[data-f="targetRom"]').value=e.targetRom}});
  D.querySelectorAll(`[data-i="${i}"] [data-c]`).forEach(cb=>cb.onchange=()=>{const c=cb.dataset.c;e.comps=e.comps.filter(x=>x!==c);if(cb.checked)e.comps.push(c)});
  q(".rm").onclick=()=>{if(confirm("Remove "+e.name+"?")){rx.exercises.splice(i,1);draw()}};
  q(".rec").onclick=()=>demoRecorder(p,rx,e,()=>rxEditor(p,rx));q(".upl").onclick=async()=>{const f=await pickFile("#vidPick");if(f)await demoFromFile(rx,e,f,q(".dstat"))}})};
 $("#addsel").onchange=e=>{if(!e.target.value)return;rx.exercises.push(newEx(e.target.value));e.target.value="";draw()};
 const save=async()=>{rx.startDate=$("#rx_start").value||today();rx.notes=$("#rx_notes").value;rx.version=(rx.version||0)+1;rx.therapist=await store.getSetting("tname",prof.name);rx.patient={id:p.id,name:p.name,code:p.code};rx.saved=new Date().toISOString();rx.id=rx.id||"rx_"+p.id;await store.put("rx",rx);return rx};
 $("#rx_save").onclick=async()=>{if(!rx.exercises.length)return alert("Add at least one exercise");await save();patientDetail(p.id)};
 $("#rx_onb").onclick=async()=>{if(!rx.exercises.length)return alert("Add at least one exercise");if(!p.code)return alert("Give the patient a Patient ID first");await save();await onboarding(p,rx)};
 $("#rx_export").onclick=async()=>{if(!rx.exercises.length)return alert("Add at least one exercise");await save();await exportRx(p,rx);patientDetail(p.id)};
draw()}
function exCard(e,i){const num=(f,l,st)=>`<div><label>${l}</label><input type="number" data-f="${f}" value="${esc(e[f])}" step="${st||1}"></div>`;
 return `<div class="card" data-i="${i}" style="background:#111"><div class="row"><b class="grow">${i+1}. <input data-f="name" value="${esc(e.name)}" style="width:60%"></b><button class="r s rm">Remove</button></div>
 <div class="grid"><div><label>Primary joint angle</label><select data-f="metric">${Object.entries(METRICS).map(([k,m])=>`<option value="${k}" ${k===e.metric?"selected":""}>${m.label}</option>`).join("")}</select></div>
 <div><label>Side</label><select data-f="side">${["auto","L","R"].map(s=>`<option ${s===e.side?"selected":""} value="${s}">${s==="auto"?"Auto (most visible)":s==="L"?"Left":"Right"}</option>`).join("")}</select></div>
 ${num("start","Start angle °")}${num("end","End angle °")}${num("targetRom","Target ROM °")}${num("reps","Reps / set")}${num("sets","Sets")}${num("rest","Rest between sets (s)")}${num("duration","Duration (min)")}<div><label>Frequency</label><select data-f="freq"><option value="daily" ${isDaily(e)?"selected":""}>Daily</option><option value="weekly" ${isDaily(e)?"":"selected"}>x times per week</option></select></div>${num("perDay","Times per day (daily)")}${num("perWeek","Times per week (weekly)")}${num("tempo","Rep time (s)",.5)}${num("trunkMax","Trunk lean limit °")}</div>
 <label>Correct-rep thresholds (a rep counts only if ALL pass)</label><div class="grid">${num("romThr","ROM ≥ % of target")}${num("simThr","Similarity to demo ≥ %")}${num("tMin","Rep time min (s)",.1)}${num("tMax","Rep time max (s)",.1)}</div>
 <label>Compensations to watch</label><div class="row">${Object.entries(COMP_LABEL).map(([k,l])=>`<label style="display:inline-flex;gap:4px;margin:2px 6px 2px 0;color:#ddd"><input type="checkbox" data-c="${k}" ${e.comps.includes(k)?"checked":""}>${l}</label>`).join("")}</div>
 <label>Checklist (one per line)</label><textarea data-f="steps" rows=3>${esc((e.steps||[]).join("\n"))}</textarea><label>Instructions</label><textarea data-f="instructions" rows=2>${esc(e.instructions)}</textarea><label>Precautions</label><textarea data-f="precautions" rows=2>${esc(e.precautions)}</textarea>
 <div class="row"><button class="b s rec">● Record demo with camera</button><button class="s upl">Upload demo video</button><span class="muted dstat">${e.hasDemo?`Demo saved · reference: ${e.ref&&!e.ref.synthetic?e.ref.reps+" rep(s), "+e.ref.dur.toFixed(1)+" s/rep, peak "+Math.round(e.ref.peak)+"°":"none detected (default curve used)"}`:"No demo yet (default reference curve will be used)"}</span></div>
 <p class="muted">Movement = angle moves from start (${e.start}°) to ≥85% of the way to end (${e.end}°) and back; it is counted as correct only when ROM, similarity, tempo and compensation checks pass. Camera view: ${esc(e.view||"any")}.</p></div>`}
function appLink(p){const u=new URL(location.href);u.search="";u.hash="";u.searchParams.set("pid",p.code);return u.toString()}
function qrCanvas(text,px){const q=qrcode(0,"M");q.addData(text);q.make();const n=q.getModuleCount(),m=4,sz=Math.max(2,Math.floor((px||300)/(n+2*m)));const c=document.createElement("canvas");c.width=c.height=(n+2*m)*sz;const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.fillStyle="#000";
 for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))g.fillRect((k+m)*sz,(r+m)*sz,sz,sz);return c}
async function onboarding(p,rx){const link=appLink(p),qc=qrCanvas(link,360);const tname=rx.therapist||await store.getSetting("tname",prof.name);
 const {jsPDF}=window.jspdf;const d=new jsPDF({unit:"mm",format:"a4"});let y=18;const A=t=>String(t).replace(/[–—]/g,"-").replace(/×/g,"x").replace(/≥/g,">=");
 d.setFont("helvetica","bold");d.setFontSize(18);d.text("Your home exercise app",14,y);y+=8;d.setFontSize(11);d.setFont("helvetica","normal");d.text(A("Patient: "+p.name+"    Patient ID: "+p.code+"    Therapist: "+tname),14,y);y+=6;
 d.addImage(qc.toDataURL("image/png"),"PNG",14,y,60,60);d.setFontSize(10);d.text(d.splitTextToSize(A("1. Scan this QR code with your phone camera (or open the link below in Chrome / Safari).\n2. Tap 'Install' / 'Add to Home screen' so it works offline.\n3. Create your patient profile: your name, Patient ID "+p.code+" and a 4-8 digit PIN you will remember (it encrypts your data; it cannot be recovered).\n4. Tap 'Import prescription' and choose the prescription file sent with this sheet ("+`rx_${safe(p.name)}_v${rx.version}.json`+").\n5. Each day, open the app, log in with your Patient ID and PIN, and do each exercise card. Tap 'Send report to therapist' to share your progress."),120),80,y+4);
 y+=66;d.setFontSize(9);d.textWithLink(A(link),14,y,{url:link});y+=8;d.setFontSize(12);d.setFont("helvetica","bold");d.text("Your exercises",14,y);y+=6;d.setFont("helvetica","normal");d.setFontSize(10);
 rx.exercises.forEach((e,i)=>{const t=A(`${i+1}. ${e.name}: ${e.sets} sets x ${e.reps} reps, rest ${e.rest}s, ~${e.duration} min, ${isDaily(e)?(e.perDay||1)+"x per day, daily":perWeek(e)+"x per week"}${e.instructions?". "+e.instructions:""}${e.precautions?". Precautions: "+e.precautions:""}`);const ls=d.splitTextToSize(t,180);if(y+ls.length*5>285){d.addPage();y=18}d.text(ls,14,y);y+=ls.length*5+2});
 d.setFontSize(8);d.text(d.splitTextToSize(A(DISCLAIMER),180),14,Math.min(y+6,285));
 $("#onb").innerHTML=`<div class="card" style="background:#fff;color:#000;text-align:center"><b>Scan to open the app for ${esc(p.name)} (ID ${esc(p.code)})</b><br><span id="qrhost"></span><div style="word-break:break-all;font-size:12px">${esc(link)}</div></div>`;qc.style.width="200px";$("#qrhost").append(qc);
 const media={};for(const e of rx.exercises){const b=await store.getMedia("demo_"+e.id);if(b)media[e.id]={type:b.type,b64:b64(await b.arrayBuffer())}}
 const pkg={format:"physio-exercise-rx",v:2,created:new Date().toISOString(),patient:{id:p.id,name:p.name,code:p.code,age:p.age,sex:p.sex,condition:p.condition},rx,media,appUrl:link};T.rxPackage=pkg;T.onboardLink=link;
 const files=[new File([d.output("blob")],`onboarding_${safe(p.name)}.pdf`,{type:"application/pdf"}),new File([JSON.stringify(pkg)],`rx_${safe(p.name)}_v${rx.version}.json`,{type:"application/json"})];
 return shareOrDownload(files,"Your home exercise app – "+p.name+" (open the link, then import the prescription file): "+link)}
async function exportRx(p,rx){const media={};for(const e of rx.exercises){const b=await store.getMedia("demo_"+e.id);if(b)media[e.id]={type:b.type,b64:b64(await b.arrayBuffer())}}
 const pkg={format:"physio-exercise-rx",v:2,appUrl:p.code?appLink(p):undefined,created:new Date().toISOString(),patient:{id:p.id,name:p.name,code:p.code,age:p.age,sex:p.sex,condition:p.condition},rx,media};
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
function stopLive(){if(live){live.stop=true;if(live.stream)live.stream.getTracks().forEach(t=>t.stop());if(live.rec&&live.rec.state!=="inactive")try{live.rec.stop()}catch(e){}live=null}coachReset();try{speechSynthesis.cancel()}catch(e){}}
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
 else{h+=`<p class="muted">From ${esc(rx.therapist)} · v${rx.version} · started ${rx.startDate}${rx.notes?" · "+esc(rx.notes):""}</p>`+rx.exercises.map((e,i)=>{const td=stats(rx,ses,today(),today()).days[0].per[i];const wk=stats(rx,ses,null,today()).weeks.slice(-1)[0];const ok=td.status==="completed";
   return `<div class="card excard" style="background:#111"><div class="row"><div class="grow"><b>${i+1}. ${esc(e.name)}</b><div class="muted">${e.sets} sets × ${e.reps} reps · rest ${e.rest}s · ~${e.duration} min · ${isDaily(e)?(e.perDay||1)+"×/day, daily":perWeek(e)+"×/week"}</div>
   <div class="${ok?"ok":td.correct?"warn":"muted"}">Today: ${td.correct}${td.pres?"/"+td.pres:""} correct reps (${td.incorrect} incorrect) · ${td.status}${ok?" ✓":""}</div>${e.precautions?`<div class="warn">⚠ ${esc(e.precautions)}</div>`:""}</div><button class="${ok?"":"g"}" data-ex="${e.id}">${ok?"Do again":"Start"}</button></div></div>`}).join("")+`</div>`;
  const st=stats(rx,ses,null,today());const s=st.summary;
  h+=`<div class="card"><h2>My progress</h2><div class="row"><span class="pill">Sessions ${s.sessions}</span><span class="pill">Correct reps ${s.correct}/${s.presReps}</span><span class="pill">Incorrect ${s.incorrect}</span><span class="pill">Accuracy ${s.acc??"–"}% (correct/total)</span><span class="pill">Compliance ${s.compliance??"–"}%</span><span class="pill">Days missed ${s.missedDays}</span></div>
  <div id="charts"></div>${histTable(st)}<div class="row" style="margin-top:8px"><button class="b" id="share">Send report to therapist</button><button id="pdf">PDF</button><button id="xls">Excel</button></div><p class="muted">"Send report" shares the progress package (.json for your therapist's app) plus PDF and Excel files via WhatsApp, email etc.</p></div>`}
 h+=settingsCard();V.innerHTML=h;bindSettings();$("#imp").onclick=async()=>importFile(await pickFile("#filePick"));
 if(rx){V.querySelectorAll("[data-ex]").forEach(b=>b.onclick=()=>exercisePrep(rx,rx.exercises.find(e=>e.id===b.dataset.ex)));const st=stats(rx,ses,null,today());
  const c=$("#charts");c.append(chart(st.days.slice(-14),"All exercises – daily (last 14 days)","date"),...st.perEx.map(p=>chart(p.rows.slice(-14),p.name+" – daily","date")));c.querySelectorAll("canvas").forEach(x=>{x.style.width="100%";x.style.borderRadius="8px";x.style.marginTop="6px"});
  $("#share").onclick=()=>exportProgress(me,rx,ses,["json","pdf","xlsx"]);$("#pdf").onclick=()=>exportProgress(me,rx,ses,["pdf"]);$("#xls").onclick=()=>exportProgress(me,rx,ses,["xlsx"])}}
function histTable(st){return `<h3>Daily history (correct reps count toward compliance)</h3><table><tr><th>Date</th><th>Sessions</th><th>Correct / prescribed</th><th>Incorrect</th><th>Accuracy</th><th>Compliance</th><th>Missed / partial</th></tr>${st.days.slice().reverse().slice(0,31).map(d=>`<tr><td>${d.date}</td><td>${d.sessions}</td><td>${d.correct}/${d.presReps}</td><td>${d.incorrect}</td><td>${d.acc??"–"}%</td><td class="${d.compliance>=80?"ok":d.compliance>=50?"warn":"bad"}">${d.compliance??"–"}%</td><td class="muted">${esc(d.missed.join("; "))}</td></tr>`).join("")}</table>`}
async function exportProgress(me,rx,ses,kinds){const st=stats(rx,ses,null,today());const nm=safe(me.name)+"_"+today();const files=[];const rxLite={...rx,exercises:rx.exercises.map(e=>{const {traj,...r}=e;return r})};
 if(kinds.includes("json"))files.push(new File([JSON.stringify({format:"physio-exercise-progress",v:1,generated:new Date().toISOString(),from:st.summary.from,to:st.summary.to,patient:me,rx:rxLite,sessions:ses.map(normSes)})],`progress_${nm}.json`,{type:"application/json"}));
 if(kinds.includes("pdf"))files.push(new File([makePDF(me,rx,ses,st)],`report_${nm}.pdf`,{type:"application/pdf"}));
 if(kinds.includes("xlsx"))files.push(new File([makeXLSX(me,rx,ses,st)],`report_${nm}.xlsx`,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
 return shareOrDownload(files,"Exercise progress report – "+me.name)}
async function exercisePrep(rx,e){stopLive();const demo=await store.getMedia("demo_"+e.id);
 V.innerHTML=`<button id="bk">← Today</button><div class="card"><h2>${esc(e.name)}</h2><p>${e.sets} sets × ${e.reps} reps · rest ${e.rest}s · about ${e.duration} min</p>${demo?`<video class="demo" controls playsinline loop src="${URL.createObjectURL(demo)}"></video>`:`<p class="muted">No demo video in this prescription.</p>`}
 ${e.instructions?`<p>${esc(e.instructions)}</p>`:""}${e.precautions?`<p class="warn">⚠ Precautions: ${esc(e.precautions)}</p>`:""}<p class="muted">A rep counts only when it is correct: full range, smooth like the demo, steady speed, good posture. Incorrect reps are shown but not counted.</p><div class="chk">${(e.steps||[]).map(s=>`<label><input type="checkbox" class="cl">${esc(s)}</label>`).join("")}<label><input type="checkbox" class="cl">Space is clear and safe; I will stop if I feel pain</label></div>
 <p class="muted">Camera: ${esc(e.view||"any")} view, whole body visible, ~2–3 m away. Prop the phone up.</p>
 <div class="row"><select id="fc"><option value="user">Front camera</option><option value="environment">Back camera</option></select><button class="g" id="go">Start exercise</button><button class="s" id="tv">Use a video file instead</button></div></div>`;
 $("#bk").onclick=patientHome;const go=src=>{if(![...V.querySelectorAll(".cl")].every(c=>c.checked)&&!confirm("Not all checklist items are ticked. Start anyway?"))return;runExercise(rx,e,src)};
 $("#go").onclick=()=>go({cam:$("#fc").value});$("#tv").onclick=async()=>{const f=await pickFile("#vidPick");if(f)go({file:f})}}
async function runExercise(rx,e,src){stopLive();fixEx(e);
 V.innerHTML=`<div class="card"><div class="row"><b class="grow">${esc(e.name)}</b>${src.file?"":`<button id="swc" title="Switch camera">⇄ Camera</button>`}<button class="r" id="stop">Stop & save</button></div>${stageHTML()}
 <div class="row" id="cnt" style="margin-top:6px;font-size:18px"><span class="pill ok">✓ Correct <b id="c_ok">0</b></span><span class="pill bad">✗ Incorrect <b id="c_bad">0</b></span><span class="pill">Total <b id="c_tot">0</b></span><span class="pill" id="c_set"></span></div>
 <div id="reps" style="margin-top:6px"></div><p id="msg" class="muted">Loading pose model…</p><p class="muted">Scores are AI guidance only, not a medical device.</p></div>`;
 const st=$("#stage"),video=st.querySelector("video"),cv=st.querySelector("canvas"),g=cv.getContext("2d");const L=live={};let facing=src.cam||"user";
 st.insertAdjacentHTML("beforeend",`<div id="fmsg" style="position:absolute;left:0;right:0;top:40%;text-align:center;font-size:22px;font-weight:700;color:#ffd400;text-shadow:0 2px 4px #000;pointer-events:none"></div><div id="cd" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:96px;font-weight:800;color:#fff;text-shadow:0 3px 8px #000;pointer-events:none"></div>`);
 const mir=()=>{const m=!src.file&&facing==="user";video.classList.toggle("mir",m);cv.classList.toggle("mir",m)};
 await ensurePose();try{if(src.file){video.src=URL.createObjectURL(src.file);video.loop=true;await video.play()}else{L.stream=await startCam(video,facing)}mir()}catch(err){$("#msg").textContent="Camera error: "+err.message;return}
 cv.width=video.videoWidth;cv.height=video.videoHeight;$("#msg").textContent="";
 if($("#swc"))$("#swc").onclick=async()=>{try{if(L.stream)L.stream.getTracks().forEach(t=>t.stop());facing=facing==="user"?"environment":"user";L.stream=await startCam(video,facing);mir();cv.width=video.videoWidth;cv.height=video.videoHeight;T.facing=facing}catch(err){$("#msg").textContent="Could not switch camera: "+err.message}};
 const ref=e.ref||defaultReference(e);const rc=new RepCounter(e.start,e.end);const thr=exDefaults(e,ref);
 const S={set:1,inSet:0,reps:[],correct:0,incorrect:0,rest:false,t0:Date.now(),done:false,frames:0,lost:0,armed:false,frame:"ok"};Object.assign(T,{live:S,rc,thr});
 const deepKey=e.end<e.start?"deeper":"higher";
 let base=null;const upd=()=>{$("#h_rep").textContent=S.inSet+"/"+e.reps;$("#h_set").textContent="Set "+Math.min(S.set,e.sets)+" of "+e.sets+" · correct reps";$("#h_lbl").textContent=METRICS[e.metric].label.split(" (")[0];
  $("#c_ok").textContent=S.correct;$("#c_bad").textContent=S.incorrect;$("#c_tot").textContent=S.correct+S.incorrect;$("#c_set").textContent="Set "+Math.min(S.set,e.sets)+"/"+e.sets+": "+S.inSet+"/"+e.reps;
  $("#reps").innerHTML=S.reps.slice(-12).map(r=>`<span class="pill" style="background:${r.ok?"#0f3d1c":"#3d0f0f"}">${r.ok?"✓":"✗"} S${r.set}: ROM ${r.romPct}% · sim ${r.shape}% · ${r.dur}s${r.why.length?" · "+r.why.map(c=>WHY[c]||COMP_LABEL[c]||c).join(", "):""}</span>`).join("")};upd();
 // non-blocking countdown: frames are drawn but reps are not counted until "Start"
 const countdown=(then)=>{let n=3;S.armed=false;const tick=()=>{if(L.stop)return;if(n>0){$("#cd").textContent=n;say(n,{pri:3,silentCue:true});n--;L.cdT=setTimeout(tick,1000)}else{$("#cd").textContent="Start";say("go",{pri:3});S.armed=true;rc.reset();L.cdT=setTimeout(()=>{if($("#cd"))$("#cd").textContent=""},700);then&&then()}};tick()};
 countdown();
 const finish=async(auto)=>{if(S.done)return;S.done=true;clearTimeout(L.cdT);const dur=(Date.now()-S.t0)/1000;L.stop=true;if(L.stream)L.stream.getTracks().forEach(t=>t.stop());
  const good=S.reps.filter(r=>r.ok);const comps={};for(const r of S.reps)for(const c of r.why)comps[c]=(comps[c]||0)+1;
  const total=S.correct+S.incorrect;const setsDone=Math.min(e.sets,S.set-1+(S.inSet>=e.reps?1:0));
  const sess={exId:e.id,exName:e.name,rxId:rx.id,rxVersion:rx.version,date:ymd(new Date(S.t0)),startedAt:new Date(S.t0).toISOString(),endedAt:new Date().toISOString(),durSec:Math.round(dur),
   presSets:+e.sets,presReps:+e.reps,presTotal:e.sets*e.reps,setsDone,correctReps:S.correct,incorrectReps:S.incorrect,totalReps:total,accuracy:total?Math.round(100*S.correct/total):null,
   quality:S.reps.length?Math.round(S.reps.reduce((a,r)=>a+r.acc,0)/S.reps.length):null,repsDone:S.correct,partials:S.reps.filter(r=>r.partial).length,
   repsPerSet:Array.from({length:e.sets},(_,i)=>S.reps.filter(r=>r.set===i+1&&r.ok).length),reps:S.reps,thresholds:thr,
   acc:total?Math.round(100*S.correct/total):0,romAvg:good.length?Math.round(good.reduce((a,r)=>a+r.rom,0)/good.length):0,romMax:S.reps.length?Math.max(...S.reps.map(r=>r.rom)):0,targetRom:e.targetRom||Math.abs(e.end-e.start),comps,complete:S.correct>=e.sets*e.reps};
  if(total||dur>10){await store.put("sessions",sess);T.savedSession=sess}
  if(auto)say("done",{pri:3,force:true});
  V.innerHTML=`<div class="card"><h2>${sess.complete?"✓ Exercise complete":"Session saved (incomplete)"}</h2><p>${esc(e.name)} · ${sess.setsDone}/${sess.presSets} sets · <b>${sess.correctReps}</b>/${sess.presTotal} correct reps · ${sess.incorrectReps} incorrect · ${Math.round(dur/6)/10} min</p>
   <p>Accuracy <b>${sess.accuracy??"–"}%</b> (correct ÷ total reps) · ROM avg ${sess.romAvg}° / best ${sess.romMax}° (target ${sess.targetRom}°)</p><p>${Object.keys(comps).length?"Issues: "+Object.entries(comps).map(([k,v])=>(WHY[k]||COMP_LABEL[k]||k)+" ×"+v).join(", "):"No issues detected"}</p><button class="b" id="bk">Back to today</button></div>`;$("#bk").onclick=patientHome};
 $("#stop").onclick=()=>finish(false);
 const startRest=()=>{S.rest=true;S.armed=false;say("setdone",{a:{n:S.set,r:+e.rest||30},force:true});let n=+e.rest||30;$("#rest").style.display="flex";$("#restN").textContent=n;
  const end=()=>{clearInterval(L.ri);$("#rest").style.display="none";S.rest=false;S.set++;S.inSet=0;rc.reset();upd();say("next",{force:true});countdown()};
  $("#skipRest").onclick=end;L.ri=setInterval(()=>{if(L.stop){clearInterval(L.ri);return}n--;if($("#restN"))$("#restN").textContent=n;if(n<=0)end()},1000)};
 const onRep=(r,now)=>{let sc,cl;if(r.complete){sc=scoreRep(r,e,ref);cl=classify(sc,e,ref)}else{sc={acc:0,shape:0,romPct:Math.round(100*Math.min(1,Math.abs(r.peak-e.start)/Math.abs(e.end-e.start))),tempo:0,rom:Math.round(Math.abs(r.peak-r.low)),peak:Math.round(r.peak),dur:+r.dur.toFixed(1),comps:[...r.comps]};cl={ok:false,why:["rom"]};sc.partial=true}
  sc.ok=cl.ok;sc.why=cl.why;sc.set=S.set;sc.t=Math.round((Date.now()-S.t0)/100)/10;S.reps.push(sc);
  if(cl.ok){S.correct++;S.inSet++;upd();flash("#30d158");
   if(S.inSet>=e.reps){if(S.set>=e.sets){finish(true);return}startRest();return}
   if(S.inSet%5===0)say("count",{a:{n:S.inSet},pri:3});else{say(S.inSet,{pri:3});say("good",{pri:1,col:"#30d158"})}}
  else{S.incorrect++;upd();flash("#ff3b30");const w=cl.why;const fix=w.includes("rom")?deepKey:w.includes("fast")?"fast":w.find(c=>PH[c]&&c!=="rom")||(w.includes("shape")?"posture":null);
   say("wrong",{pri:2,col:"#ff3b30"});if(fix)say(fix,{pri:2,col:"#ffd400"})}};
 const flash=c=>{st.style.boxShadow="0 0 0 6px "+c;setTimeout(()=>st.style.boxShadow="",400)};
 const loop=()=>{if(L.stop)return;if(video.readyState>=2&&!S.rest){const P=detect(video,cv.width,cv.height);S.frames++;const fc0=frameCheck(P,e.metric,cv.width,cv.height);S.fcN=fc0===S.fc0?(S.fcN||0)+1:0;S.fc0=fc0;const fc=fc0==="ok"||S.fcN>=12?fc0:S.frame;S.frame=fc;
   $("#fmsg").textContent=fc==="nobody"?"⚠ Step into the camera view":fc==="stepback"?"⚠ Step back – whole body must be visible":"";
   if(fc!=="ok"&&S.fcN>=12)say(fc,{silentCue:true});
   if(!P){S.lost++;drawPose(g,null,cv.width,cv.height)}else{const m=measure(P,e.metric,e.side);
    if(m.vis<.3){S.lost++}else{S.lost=0;const now=performance.now();T.lastAngle=m.v;
     let p=0,ev=null;if(S.armed){({p,ev}=rc.update(m.v,now))}
     if(!S.armed||rc.state==="rest"){const b=baseline(P);base=base?{es:base.es*.8+b.es*.2,pel:base.pel*.8+b.pel*.2}:b}
     const cs=S.armed&&rc.state==="move"?compFrame(P,e,base):[];if(rc.cur)cs.forEach(c=>{rc.cur.cc=rc.cur.cc||{};rc.cur.cc[c]=(rc.cur.cc[c]||0)+1;if(rc.cur.cc[c]===4){rc.cur.comps.add(c);say(c,{pri:2,col:"#ff3b30"})}});
     const col=cs.length?"#ff3b30":p>=.85?"#30d158":p>.3?"#ffd400":"#0a84ff";st.style.borderColor=col;drawPose(g,P,cv.width,cv.height,hiPts(P,e.metric,m.side),col);
     $("#h_ang").textContent=Math.round(m.v)+"°";$("#prog div").style.height=Math.max(0,Math.min(100,p*100))+"%";$("#prog div").style.background=col;
     const toward=(e.end>e.start)?"↑":"↓",back=(e.end>e.start)?"↓":"↑";$("#arrow").textContent=rc.state==="move"?(rc.cur&&rc.cur.peakP>=.85?back:toward):toward;$("#arrow").style.color=col;
     if(ev&&ev.type==="rep")onRep(ev.rep,now)}}}
  requestAnimationFrame(loop)};loop()}
const WHY={rom:"Range too small",shape:"Movement differs from demo",fast:"Too fast",slow:"Too slow",incomplete:"Incomplete"};
// ---------- therapist dashboard ----------
function dashboard(p,rx,ses,reports){const D=$("#pd");const all=ses.map(normSes);const from0=all.length?all.map(s=>s.date).sort()[0]:today();(rx.exercises||[]).forEach(fixEx);
 D.innerHTML=`<div class="card"><div class="row"><label style="margin:0">View</label><select id="dv"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select><label style="margin:0">From</label><input type="date" id="df" value="${rx.startDate&&rx.startDate<from0?rx.startDate:from0}"><label style="margin:0">To</label><input type="date" id="dt" value="${today()}"><button class="b s" id="dpdf">Download PDF</button><button class="s" id="dxls">Download Excel</button><button class="y s" id="dimp">Import report</button></div>
 <p class="muted">${reports.length?"Imported reports: "+reports.map(r=>new Date(r.imported).toLocaleDateString()+" ("+r.sessions+" sessions)").join(", "):"No reports imported yet."}</p><div id="dsum"></div><div id="dch"></div><div id="dex"></div><div id="dtab"></div></div>`;
 const render=()=>{const f=$("#df").value,t=$("#dt").value;const ss=all.filter(s=>s.date>=f&&s.date<=t);const st=stats(rx.exercises.length?rx:{exercises:[]},ss,f,t);const s=st.summary;const v=$("#dv").value;
  $("#dsum").innerHTML=`<div class="row"><span class="pill">Sessions ${s.sessions}</span><span class="pill">Correct reps ${s.correct}/${s.presReps}</span><span class="pill">Incorrect ${s.incorrect}</span><span class="pill">Accuracy ${s.acc??"–"}%</span><span class="pill">Overall compliance ${s.compliance??"–"}%</span><span class="pill">Days with misses ${s.missedDays}</span><span class="pill">Top issues: ${esc(s.topComps.join(", ")||"none")}</span></div>`;
  const ch=$("#dch");ch.innerHTML="";const cc=v==="weekly"?chart(st.weeks,"Weekly – all exercises","week"):v==="monthly"?chart(st.months.map(m=>({...m,compliance:null})),"Monthly accuracy","month"):chart(st.days.slice(-31),"Daily – all exercises","date");cc.style.width="100%";cc.style.marginTop="6px";ch.append(cc);
  const X=$("#dex");X.innerHTML=st.perEx.map((x,i)=>{const e=rx.exercises[i],td=x.today;return `<div class="card dexc" style="background:#111"><h3>${i+1}. ${esc(x.name)} <span class="muted">${e.sets}×${e.reps} · ${isDaily(e)?(e.perDay||1)+"×/day":perWeek(e)+"×/week"}</span></h3>
   <div class="row"><span class="pill">Today: ${td?esc(td.status)+" "+td.correct+"/"+td.pres:"–"}</span><span class="pill">Prescribed ${x.presReps}</span><span class="pill ok">Correct ${x.correct}</span><span class="pill bad">Incorrect ${x.incorrect}</span><span class="pill">Accuracy ${x.acc??"–"}%</span><span class="pill">Compliance ${x.compliance??"–"}%</span><span class="pill">Best ROM ${x.romBest??"–"}° / ${x.romTarget}°</span><span class="pill">Issues: ${esc(x.topComps.join(", ")||"none")}</span></div><div class="exch"></div>
   <details><summary>History</summary><table><tr><th>Date</th><th>Status</th><th>Correct/presc.</th><th>Incorrect</th><th>Accuracy</th><th>Compliance</th></tr>${st.days.slice().reverse().map(d=>{const q=d.per[i];return `<tr><td>${d.date}</td><td>${q.status}</td><td>${q.correct}/${q.pres}</td><td>${q.incorrect}</td><td>${q.acc??"–"}%</td><td>${q.comp??"–"}%</td></tr>`}).join("")}</table></details></div>`}).join("");
  X.querySelectorAll(".exch").forEach((el,i)=>{const c=chart(st.perEx[i].rows.slice(-31),st.perEx[i].name+" – daily compliance & accuracy","date");c.style.width="100%";el.append(c)});
  $("#dtab").innerHTML=v==="daily"?histTable(st):v==="weekly"?`<table><tr><th>Week of</th><th>Sessions</th><th>Compliance</th><th>Accuracy</th><th>Correct reps</th><th>Shortfall</th></tr>${st.weeks.map(w=>`<tr><td>${w.week}</td><td>${w.sessions}/${w.expected}</td><td>${w.compliance??"–"}%</td><td>${w.acc??"–"}%</td><td>${w.reps}</td><td class="muted">${esc(w.short.join("; "))}</td></tr>`).join("")}</table>`
   :`<table><tr><th>Month</th><th>Sessions</th><th>Correct reps</th><th>Accuracy</th></tr>${st.months.map(m=>`<tr><td>${m.month}</td><td>${m.sessions}</td><td>${m.reps}</td><td>${m.acc??"–"}%</td></tr>`).join("")}</table>`;
  T.dash=st;return {ss,st}};
 ["#dv","#df","#dt"].forEach(s=>$(s).onchange=render);render();
 const pinfo={...p,therapist:rx.therapist};
 $("#dpdf").onclick=()=>{const {ss,st}=render();const b=makePDF(pinfo,rx,ss,st);T.lastExport=[{name:"pdf",size:b.size}];T.lastBlob=b;dl(b,`report_${safe(p.name)}_${today()}.pdf`)};
 $("#dxls").onclick=()=>{const {ss,st}=render();const b=makeXLSX(pinfo,rx,ss,st);T.lastExport=[{name:"xlsx",size:b.size}];T.lastBlob=b;dl(b,`report_${safe(p.name)}_${today()}.xlsx`)};
 $("#dimp").onclick=async()=>importFile(await pickFile("#filePick"))}
// ---------- launch ----------
let pendingLaunch=null;
if("launchQueue" in window)launchQueue.setConsumer(async lp=>{if(lp.files&&lp.files.length){const f=await lp.files[0].getFile();if(store)importFile(f);else{pendingLaunch=f;alert("Unlock your profile to import "+f.name)}}});
T.api={get store(){return store},importFile,stats,say,onboarding,patientDetail,get prof(){return prof}};
home();ensurePose();
