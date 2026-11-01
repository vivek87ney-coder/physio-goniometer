// ===== AI 3D Biomechanics & Anatomy Activity Analysis – app shell =====
import * as THREE from 'three';
import { listProfiles, createProfile, deleteProfile, LocalEncryptedAdapter } from './data.js';
import { initPose, detect, poseState } from './pose.js';
import { Anatomy, INFO, frames } from './anatomy.js';
import { Analyzer, toVecs, smoothLm, relabelO, summarize, JOINTS, AXIAL, ACT_LABEL, hasRef, refPose, refCurve, meanCurve, patientCurve, rms } from './bio.js';
import { EXPLAIN } from './kb.js';
import { makePDF, makeXLSX, DISCLAIMER, summaryText, mName, romRows } from './reports.js';
const $=s=>document.querySelector(s), view=$('#view'); const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f0=v=>v==null||isNaN(v)?'–':Math.round(v), f1=v=>v==null||isNaN(v)?'–':(+v).toFixed(1);
let store=null, patients=[], curPat=null, ana=null, loopId=0, stream=null;
const SK=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32],[0,11],[0,12]];
const ROLEC={agonist:'#ff4d3d',antagonist:'#3d7bff',synergist:'#ff9f1a',stabiliser:'#30d158'};
window.__app={};
function stop(){ if(ana){ ana.dispose(); ana=null; } cancelAnimationFrame(loopId); loopId=0; if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
async function shareOrDownload(blob,name){ const f=new File([blob],name,{type:blob.type}); if(navigator.canShare&&navigator.canShare({files:[f]})&&!window.__noShare){ try{ await navigator.share({files:[f],title:name}); return; }catch(e){ if(e.name==='AbortError') return; } }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},3000); }
function pickFile(accept){ return new Promise(res=>{ const i=$('#vidPick'); i.accept=accept; i.value=''; i.onchange=()=>res(i.files[0]||null); i.click(); }); }
// ---------- frame packing ----------
const pack=frs=>({t:frs.map(f=>Math.round(f.t)),W:frs.map(f=>f.W.flat().map(v=>Math.round(v*1000))),I:frs.map(f=>f.I.flat().map(v=>Math.round(v*1000)))});
const unpack=pk=>pk.t.map((t,i)=>{ const W=[],I=[]; for(let j=0;j<33;j++){ W.push([pk.W[i][3*j]/1000,pk.W[i][3*j+1]/1000,pk.W[i][3*j+2]/1000]); I.push([pk.I[i][3*j]/1000,pk.I[i][3*j+1]/1000,pk.I[i][3*j+2]/1000]); } return {t,W,I}; });
const toP=W=>toVecs(W.map(a=>({x:a[0],y:a[1],z:a[2]})));
function smoothFrames(frs){ let prev=null; return frs.map(f=>{ const P=smoothLm(prev,toP(f.W),0.55); prev=P; return {t:f.t,P,I:f.I,W:f.W}; }); }
// ---------- login ----------
async function login(){ stop(); store=null; $('#who').textContent=''; const ps=await listProfiles();
  view.innerHTML=`<div class="card"><h2>Clinician / user profiles</h2><p class="muted">Each profile's data is encrypted on this device with its PIN (AES-GCM, PBKDF2). Nothing is uploaded.</p>
  ${ps.map(p=>`<div class="row card"><b class="grow">${esc(p.name)}</b><span class="muted">${esc(p.role)}</span><input type="password" inputmode="numeric" placeholder="PIN" data-pin="${p.id}" style="width:90px"><button class="b s" data-open="${p.id}">Open</button><button class="r s" data-del="${p.id}">✕</button></div>`).join('')||'<p class="muted">No profiles yet.</p>'}
  <h3>New profile</h3><div class="grid"><input id="npN" placeholder="Name"><select id="npR"><option>Therapist</option><option>Patient (self)</option><option>Researcher</option></select><input id="npP" type="password" inputmode="numeric" placeholder="PIN (4+ digits)"></div><button class="g" id="npGo">Create</button><div id="lerr" class="bad"></div></div>`;
  view.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{ const p=ps.find(x=>x.id===b.dataset.open); try{ store=await new LocalEncryptedAdapter().open(p,view.querySelector(`[data-pin="${p.id}"]`).value); home(); }catch(e){ $('#lerr').textContent=e.message; } });
  view.querySelectorAll('[data-pin]').forEach(i=>i.onkeydown=e=>{ if(e.key==='Enter') view.querySelector(`[data-open="${i.dataset.pin}"]`).click(); });
  view.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(confirm('Delete this profile and ALL its data?')){ await deleteProfile(b.dataset.del); login(); } });
  $('#npGo').onclick=async()=>{ const n=$('#npN').value.trim(),pin=$('#npP').value; if(!n||pin.length<4){ $('#lerr').textContent='Name and a 4+ digit PIN required'; return; } const p=await createProfile({name:n,role:$('#npR').value,pin}); store=await new LocalEncryptedAdapter().open(p,pin); home(); }; }
// ---------- dashboard ----------
async function home(){ stop(); $('#who').innerHTML=esc(store.profile.name)+' · <a href="#" id="lo" style="color:#9cf">lock</a>'; $('#lo').onclick=e=>{e.preventDefault(); store.close(); login();};
  patients=(await store.list('patients')).sort((a,b)=>a.name<b.name?-1:1); const sess=await store.list('sessions');
  view.innerHTML=`<div class="card"><div class="row"><h2 class="grow">Therapist dashboard</h2><button class="b" id="quick">⚡ Quick live demo</button></div>
  <table><tr><th>Patient</th><th>Condition</th><th>Sessions</th><th>Last</th><th></th></tr>${patients.map(p=>{ const ss=sess.filter(s=>s.patientId===p.id); const last=ss.sort((a,b)=>a.startedAt<b.startedAt?1:-1)[0];
   return `<tr><td><b>${esc(p.name)}</b> <span class="muted">${esc(p.code||'')}</span></td><td>${esc(p.condition||'')}</td><td>${ss.length}</td><td>${last?new Date(last.startedAt).toLocaleDateString()+' · '+esc(ACT_LABEL[last.main]||''):'–'}</td><td><button class="b s" data-p="${p.id}">Open</button></td></tr>`; }).join('')||'<tr><td colspan=5 class="muted">No patients yet – add one below.</td></tr>'}</table></div>
  <div class="card"><h3>Add patient</h3><div class="grid"><input id="pN" placeholder="Name"><input id="pC" placeholder="Patient ID"><input id="pA" placeholder="Age" type="number"><select id="pS"><option value="">Sex</option><option>F</option><option>M</option><option>Other</option></select><input id="pH" placeholder="Height cm" type="number"><input id="pD" placeholder="Condition / diagnosis"><select id="pSide"><option value="">Affected side</option><option>Left</option><option>Right</option><option>Both</option><option>None</option></select></div><button class="g" id="pGo">Add patient</button></div>
  ${settingsCard()}`;
  view.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>patient(b.dataset.p)); bindSettings();
  $('#quick').onclick=()=>capture(null);
  $('#pGo').onclick=async()=>{ const n=$('#pN').value.trim(); if(!n) return; const p=await store.put('patients',{name:n,code:$('#pC').value,age:$('#pA').value,sex:$('#pS').value,height:$('#pH').value,condition:$('#pD').value,side:$('#pSide').value,created:new Date().toISOString()}); patient(p.id); }; }
function settingsCard(){ const m=localStorage.getItem('bm_model')||'lite', q=localStorage.getItem('bm_q')||'auto';
  return `<div class="card"><h3>Performance</h3><div class="row"><label style="margin:0">Pose model <select id="setM"><option value="lite" ${m==='lite'?'selected':''}>Lite (fast, phones)</option><option value="full" ${m==='full'?'selected':''}>Full (more accurate)</option></select></label>
  <label style="margin:0">3D detail <select id="setQ">${['auto','high','medium','low'].map(x=>`<option ${q===x?'selected':''}>${x}</option>`).join('')}</select></label></div><p class="muted">Auto lowers 3D resolution / muscle update rate when the frame rate drops below 18 fps.</p></div>`; }
function bindSettings(){ const m=$('#setM'),q=$('#setQ'); if(m) m.onchange=()=>{ localStorage.setItem('bm_model',m.value); initPose(m.value); }; if(q) q.onchange=()=>{ localStorage.setItem('bm_q',q.value); if(ana) applyQ(); }; }
function applyQ(){ const q=localStorage.getItem('bm_q')||'auto'; ana.autoQ=q==='auto'; if(q!=='auto') ana.setQuality(q); }
async function patient(id){ stop(); curPat=patients.find(p=>p.id===id)||await store.get('patients',id); const ss=(await store.list('sessions')).filter(s=>s.patientId===id).sort((a,b)=>a.startedAt<b.startedAt?1:-1);
  view.innerHTML=`<button class="s" id="bk">← Dashboard</button><div class="card"><h2>${esc(curPat.name)} <span class="muted">${esc(curPat.code||'')}</span></h2><p class="muted">${[curPat.age&&curPat.age+' y',curPat.sex,curPat.height&&curPat.height+' cm',curPat.condition,curPat.side&&'affected: '+curPat.side].filter(Boolean).map(esc).join(' · ')}</p>
  <div class="row"><button class="g" id="live">📷 Live camera analysis</button><button class="b" id="up">⬆ Analyse a video</button><button class="r s" id="pdel">Delete patient</button></div></div>
  <div class="card"><h3>History</h3><table><tr><th>Date</th><th>Activity</th><th>Dur</th><th>Knee ROM L/R</th><th>Flags</th><th></th></tr>${ss.map(s=>`<tr><td>${new Date(s.startedAt).toLocaleString()}</td><td>${esc(ACT_LABEL[s.main]||s.main)}${s.isRef?' <span class="pill ok">reference</span>':''}</td><td>${f0(s.dur)} s</td><td>${f0(s.kneeL)}° / ${f0(s.kneeR)}°</td><td>${s.flags||0}</td><td><button class="b s" data-s="${s.id}">Review</button></td></tr>`).join('')||'<tr><td colspan=6 class="muted">No sessions yet.</td></tr>'}</table>
  <canvas id="trend" width="800" height="200" style="width:100%;margin-top:8px;${ss.length>1?'':'display:none'}"></canvas></div>`;
  $('#bk').onclick=home; $('#live').onclick=()=>capture(curPat); $('#up').onclick=()=>upload(curPat);
  $('#pdel').onclick=async()=>{ if(confirm('Delete patient and sessions?')){ for(const s of ss){ await store.del('sessions',s.id); if(s.mediaId) await store.del('media',s.mediaId);} await store.del('patients',id); home(); } };
  view.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>review(b.dataset.s));
  if(ss.length>1){ const c=$('#trend'),g=c.getContext('2d'); const r=ss.slice().reverse(); g.fillStyle='#0d0d0d'; g.fillRect(0,0,800,200); g.font='12px sans-serif'; g.fillStyle='#aaa'; g.fillText('Knee ROM trend (L yellow, R blue) – all sessions',8,14);
    for(const [k,col] of [['kneeL','#ffd400'],['kneeR','#0a84ff']]){ g.strokeStyle=col; g.lineWidth=2; g.beginPath(); r.forEach((s,i)=>{ const x=30+i*(760/(r.length-1)), y=190-(s[k]||0)/140*170; i?g.lineTo(x,y):g.moveTo(x,y); }); g.stroke(); } } }
// ---------- 3D toolbar ----------
function toolbarHTML(){ return `<div class="row tb">${['skeleton','muscles','ligaments','nerves','landmarks','bos','ghost'].map(k=>`<label class="tg"><input type="checkbox" data-layer="${k}" ${['skeleton','muscles','ligaments','bos'].includes(k)?'checked':''}>${k==='bos'?'COM/BOS':k}</label>`).join('')}</div>
  <div class="row tb">${[['anterior','Front'],['posterior','Back'],['latR','Right'],['latL','Left'],['superior','Top'],['oblique','3/4']].map(([v,l])=>`<button class="s" data-view="${v}">${l}</button>`).join('')}<span class="muted grow" id="q3d"></span></div>
  <div class="legend"><span style="color:${ROLEC.agonist}">■ agonist</span> <span style="color:${ROLEC.antagonist}">■ antagonist</span> <span style="color:${ROLEC.synergist}">■ synergist</span> <span style="color:${ROLEC.stabiliser}">■ stabiliser</span> · ligament strain <span style="background:linear-gradient(90deg,#2c6,#ec3,#e33);padding:0 18px"></span> low→high (estimate)</div>
  <div id="info" class="card" style="display:none"></div>`; }
function bindToolbar(){ view.querySelectorAll('[data-layer]').forEach(c=>{ const k=c.dataset.layer; if(k==='ghost'){ ana.ghostOn=c.checked; c.onchange=()=>{ ana.ghostOn=c.checked; ana.layers.ghost.visible=c.checked; }; } else { ana.setLayer(k,c.checked); c.onchange=()=>ana.setLayer(k,c.checked); } });
  view.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>ana.view(b.dataset.view));
  ana.onPick=info=>{ const el=$('#info'); if(!info){ el.style.display='none'; return; } el.style.display=''; el.innerHTML=infoHTML(info); el.querySelector('#unIso').onclick=()=>{ ana.isolate(null); el.style.display='none'; }; }; }
function infoHTML(u){ const k=u.kind, d=(INFO[k]||{})[u.id]; let h=`<div class="row"><b class="grow">${esc(typeof d==='object'&&d?d.n:(u.name||u.id))}${u.side?' ('+u.side+')':''}</b><span class="pill">${k}</span><button class="s" id="unIso">Show all</button></div>`;
  if(d&&typeof d==='object'){ for(const [f,l] of [['o','Origin'],['i','Insertion'],['a','Action / function'],['nv','Innervation'],['c','Clinical']]) if(d[f]) h+=`<div><span class="muted">${l}:</span> ${esc(d[f])}</div>`; }
  else if(typeof d==='string') h+=`<div>${esc(d)}</div>`;
  const st=window.__lastR; if(st&&u.side){ const key=u.id+u.side; const m=st.muscles?.[key]; if(m) h+=`<div style="margin-top:4px">Now (estimated): <b style="color:${ROLEC[m.role]}">${m.role}</b>, ${m.type}, demand ${f0(m.I*100)}%</div>`; const l=st.ligaments?.[key]; if(l!=null) h+=`<div style="margin-top:4px">Loading index now (estimated): <b>${f0(l*100)}</b>/100</div>`; }
  return h; }
function draw2D(cv,I,vw,vh){ if(cv.width!==vw){ cv.width=vw; cv.height=vh; } const g=cv.getContext('2d'); g.clearRect(0,0,vw,vh); if(!I) return; g.lineWidth=Math.max(2,vw/220);
  for(const [a,b] of SK){ if(I[a][2]<.3||I[b][2]<.3) continue; g.strokeStyle=(a%2===1&&a>10)||(a>=23&&a%2===1)?'#ffd400':'#0af'; g.beginPath(); g.moveTo(I[a][0]*vw,I[a][1]*vh); g.lineTo(I[b][0]*vw,I[b][1]*vh); g.stroke(); }
  g.fillStyle='#fff'; for(const p of I) if(p[2]>.3){ g.beginPath(); g.arc(p[0]*vw,p[1]*vh,vw/200+1,0,7); g.fill(); } }
function panelsHTML(r){ if(!r) return '<p class="muted">Waiting for a person in view…</p>';
  const ang=[['Knee flex','knee'],['Hip flex','hipFlex'],['Hip abd','hipAbd'],['Ankle DF','ankle'],['Knee valgus','valgus'],['Shoulder flex','shFlex'],['Shoulder abd','shAbd'],['Elbow flex','elbow']].map(([l,k])=>`<tr><td>${l}</td><td>${f0(r.a[k+'L'])}°</td><td>${f0(r.a[k+'R'])}°</td></tr>`).join('');
  const top=Object.entries(r.muscles).sort((a,b)=>b[1].I-a[1].I).slice(0,8).map(([k,m])=>`<div><span style="color:${ROLEC[m.role]}">■</span> ${esc(mName(k))} <span class="muted">${m.role}, ${m.type}</span> <span class="bar"><i style="width:${f0(m.I*100)}%;background:${ROLEC[m.role]}"></i></span></div>`).join('');
  const lig=Object.entries(r.ligaments).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`<div>${esc(mName(k))} <span class="bar"><i style="width:${f0(v*100)}%;background:hsl(${120-120*v},80%,50%)"></i></span> ${f0(v*100)}</div>`).join('');
  return `<div class="pgrid"><div><h3>Joint angles (3D, est.)</h3><table><tr><th></th><th>L</th><th>R</th></tr>${ang}<tr><td>Trunk flex / lean</td><td colspan=2>${f0(r.a.trunkFlex)}° / ${f0(r.a.trunkLat)}°</td></tr><tr><td>Pelvic obliquity</td><td colspan=2>${f0(r.a.pelvicObl)}°</td></tr></table>
  <h3>Balance</h3><div>COM margin in BOS: <b class="${r.margin<0?'bad':'ok'}">${f1(r.margin*100)} cm</b></div><div>Weight bearing L/R: ${f0(r.wb.L*100)}% / ${f0(r.wb.R*100)}%</div><div>Sway: ${f1(r.sway)} cm · Contact: ${r.contact.L?'L':''}${r.contact.R?'R':''}</div>${r.cadence?`<div>Cadence: ${f0(r.cadence)} steps/min</div>`:''}</div>
  <div><h3>Muscles (estimated from movement – not EMG)</h3>${top||'<span class="muted">low demand</span>'}<h3>Ligament / tendon loading index (est.)</h3>${lig}
  <h3>Flags</h3>${r.flags.length?r.flags.map(f=>`<div class="warn">⚠ ${esc(f)}</div>`).join(''):'<span class="ok">none</span>'}</div></div><div class="note" style="margin-top:6px"><b>${esc(ACT_LABEL[r.act])}${r.phase?' – '+esc(r.phase):''}:</b> ${esc(r.explain||'')}</div>`; }
// ---------- live capture ----------
async function capture(pat){ stop(); view.innerHTML=`<button class="s" id="bk">← Back</button>
  <div class="row"><span id="act" class="act">Loading pose model…</span><span id="conf" class="muted"></span><select id="ovr"><option value="">Auto-detect activity</option>${Object.entries(ACT_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
  <div class="split" id="split"><div id="stage"><video id="vid" playsinline muted></video><canvas id="ov"></canvas></div><canvas id="c3d" class="c3d"></canvas></div>
  <div class="row"><button class="g" id="rec">● Record</button><button class="s" id="flip">⇄ Camera</button><button class="s" id="lay">Side-by-side / overlay</button><span class="muted grow" id="recst"></span></div>
  ${toolbarHTML()}<div id="panels" class="card"></div>`;
  $('#bk').onclick=()=>pat?patient(pat.id):home();
  ana=new Anatomy($('#c3d')); applyQ(); bindToolbar(); window.__app.ana=ana;
  const vid=$('#vid'), ov=$('#ov'); let facing=localStorage.getItem('bm_face')||'environment';
  $('#lay').onclick=()=>$('#split').classList.toggle('overlay');
  async function cam(){ if(stream) stream.getTracks().forEach(t=>t.stop()); stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},audio:false}); vid.srcObject=stream; await vid.play(); }
  $('#flip').onclick=async()=>{ facing=facing==='user'?'environment':'user'; localStorage.setItem('bm_face',facing); await cam(); };
  try{ await cam(); }catch(e){ $('#act').textContent='Camera unavailable: '+e.message; return; }
  if(!await initPose()){ $('#act').textContent='Pose model failed to load'; return; }
  const an=new Analyzer(); let prev=null, rec=null, recFr=[], recT0=0, mr=null, chunks=[], lastUI=0;
  $('#ovr').onchange=()=>an.override=$('#ovr').value||null;
  $('#rec').onclick=()=>{ if(!rec){ rec=true; recFr=[]; recT0=performance.now(); chunks=[]; try{ mr=new MediaRecorder(stream,{mimeType:MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':MediaRecorder.isTypeSupported('video/webm')?'video/webm':'video/mp4',videoBitsPerSecond:1.5e6}); mr.ondataavailable=e=>e.data.size&&chunks.push(e.data); mr.start(500); }catch(e){ mr=null; }
      $('#rec').textContent='■ Stop & analyse'; $('#rec').className='r'; }
    else { rec=false; const fin=async()=>{ const blob=chunks.length?new Blob(chunks,{type:mr?.mimeType||'video/webm'}):null; stop(); await finish(pat,recFr,blob,'camera',null,an.override); }; if(mr&&mr.state!=='inactive'){ mr.onstop=fin; mr.stop(); } else fin(); } };
  const tick=()=>{ loopId=requestAnimationFrame(tick); if(vid.readyState<2) return; const d=detect(vid); const t=performance.now();
    if(d){ const P=smoothLm(prev,toP(d.W),0.6); prev=P; const r=an.push(rec?t-recT0:t,P,d.I); window.__lastR=r; ana.update(P,r); if(rec) recFr.push({t:t-recT0,W:d.W,I:d.I});
      draw2D(ov,d.I,vid.videoWidth,vid.videoHeight);
      if(t-lastUI>250){ lastUI=t; $('#act').textContent=ACT_LABEL[r.act]+(r.override?' (manual)':''); $('#conf').textContent=r.override?'':'confidence '+f0(r.conf*100)+'%'; $('#panels').innerHTML=panelsHTML(r); $('#q3d').textContent=`pose ${poseState} · 3D ${ana.quality} · ${f0(ana.fps)} fps`; if(rec) $('#recst').textContent='Recording '+f1((t-recT0)/1000)+' s · '+recFr.length+' frames'; window.__app.live=r; } }
    else { ana.render?.(); draw2D(ov,null,vid.videoWidth,vid.videoHeight); } };
  tick(); }
// ---------- upload ----------
async function upload(pat,file){ file=file||await pickFile('video/*'); if(!file) return; stop();
  view.innerHTML=`<div class="card"><h2>Analysing ${esc(file.name)}</h2><div id="prg">Loading pose model…</div><div class="bar" style="width:100%"><i id="pb" style="width:0%"></i></div><video id="vid" playsinline muted style="width:100%;max-height:300px"></video></div>`;
  if(!await initPose()){ $('#prg').textContent='Pose model failed'; return; }
  const vid=$('#vid'); vid.src=URL.createObjectURL(file); await new Promise(r=>vid.onloadeddata=r); const dur=vid.duration, fps=15, frs=[];
  for(let t=0;t<dur;t+=1/fps){ await new Promise(r=>{ vid.onseeked=r; vid.currentTime=t; }); const d=detect(vid); if(d) frs.push({t:t*1000,W:d.W,I:d.I}); $('#pb').style.width=(100*t/dur)+'%'; $('#prg').textContent=`Frame ${Math.round(t*fps)} / ${Math.round(dur*fps)} · person found in ${frs.length}`; }
  if(frs.length<5){ $('#prg').textContent='No person detected in this video.'; return; }
  await finish(pat,frs,file,'upload',file.name,null); }
// ---------- save + review ----------
async function finish(pat,frs,blob,source,fileName,override){ const sm=smoothFrames(frs); const res=relabelO(sm,override); const S=summarize(res);
  const sess={patientId:pat?.id||null,startedAt:new Date().toISOString(),source,fileName,frames:pack(frs),override:override||null,obs:'',main:S.main,dur:S.dur,kneeL:S.rom.kneeL?.rom,kneeR:S.rom.kneeR?.rom,flags:S.flags.length};
  if(blob&&store&&pat){ sess.mediaId='m'+Date.now().toString(36); await store.putMedia(sess.mediaId,blob); }
  if(store&&pat) await store.put('sessions',sess);
  return review(sess.id,{sess,blob}); }
async function review(id,pre){ stop(); const sess=pre?.sess||await store.get('sessions',id); const blob=pre?.blob||(sess.mediaId?await store.getMedia(sess.mediaId):null);
  const pat=sess.patientId?(patients.find(p=>p.id===sess.patientId)||await store.get('patients',sess.patientId)):{name:'(quick demo)'};
  const raw=unpack(sess.frames), sm=smoothFrames(raw); let res=relabelO(sm,sess.override), S=summarize(res);
  let refSess=null; async function loadRef(){ refSess=null; if(!store) return; const rid=await store.getSetting('ref_'+S.main,null); if(rid&&rid!==sess.id){ const rs=await store.get('sessions',rid); if(rs){ const rr=relabelO(smoothFrames(unpack(rs.frames)),rs.override); const RS=summarize(rr); const cyc=RS.cycles.find(c=>c.kind===S.main||(S.main==='walking'&&c.kind==='walking')); if(cyc) refSess={res:rr,cyc,name:new Date(rs.startedAt).toLocaleDateString()}; } } }
  await loadRef();
  view.innerHTML=`<button class="s" id="bk">← Back</button><div class="card"><div class="row"><h2 class="grow">${esc(pat.name)} · ${new Date(sess.startedAt).toLocaleString()}</h2><span class="pill">${esc(sess.source)}</span></div>
  <div class="row"><span class="act" id="act"></span><span class="muted" id="conf"></span><label style="margin:0">Activity: <select id="ovr"><option value="">Auto-detect</option>${Object.entries(ACT_LABEL).map(([k,v])=>`<option value="${k}" ${sess.override===k?'selected':''}>${v}</option>`).join('')}</select></label></div></div>
  <div class="split" id="split"><div id="stage">${blob?'<video id="vid" playsinline muted></video>':'<div id="novid" class="muted" style="padding:40px;text-align:center">No video stored</div>'}<canvas id="ov"></canvas></div><canvas id="c3d" class="c3d"></canvas></div>
  <div class="row"><button class="b s" id="pp">▶</button><button class="s" id="fb">◀|</button><button class="s" id="ff">|▶</button>${[0.25,0.5,1].map(s=>`<button class="s sp" data-sp="${s}">${s}×</button>`).join('')}<button class="s" id="lay">Side-by-side / overlay</button><span id="tm" class="muted grow"></span></div>
  <input type="range" id="scrub" min="0" max="${res.length-1}" value="0" style="width:100%"><canvas id="phase" height="26" style="width:100%;height:26px;display:block"></canvas><div class="muted" id="plg"></div>
  ${toolbarHTML()}<div id="panels" class="card"></div>
  <div class="card"><h3>Session summary</h3><div id="sum"></div></div>
  <div class="card"><h3>Comparison with normal reference</h3><div class="row"><select id="ck">${[...JOINTS.flatMap(([k,l])=>[[k+'R',l+' R'],[k+'L',l+' L']]),...AXIAL].map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select><span id="cnote" class="muted grow"></span></div><canvas id="cmp" width="800" height="260" style="width:100%"></canvas></div>
  <div class="card"><h3>Clinician observations</h3><textarea id="obs" rows="4" placeholder="Observations, clinical reasoning, plan…">${esc(sess.obs||'')}</textarea>
  <div class="row"><button class="g" id="save">Save</button><button class="y" id="pdf">PDF report</button><button class="b" id="xls">Excel (XLSX)</button><button class="s" id="mref">Use as normal reference for this activity</button><button class="s" id="snap">Save 3D image</button><button class="r s" id="sdel">Delete</button></div><p class="muted">${esc(DISCLAIMER)}</p></div>`;
  $('#bk').onclick=()=>sess.patientId?patient(sess.patientId):home();
  ana=new Anatomy($('#c3d')); applyQ(); bindToolbar(); window.__app.ana=ana;
  const vid=$('#vid'), ov=$('#ov'), scrub=$('#scrub'); let idx=0, playing=false, sp=0.5, lastUI=0, vw=640, vh=480;
  if(vid){ vid.src=URL.createObjectURL(blob); await new Promise(r=>{ vid.onloadeddata=r; vid.onerror=r; }); vw=vid.videoWidth||640; vh=vid.videoHeight||480; vid.playbackRate=sp; } else { ov.style.position='static'; ov.style.background='#111'; }
  $('#lay').onclick=()=>$('#split').classList.toggle('overlay');
  view.querySelectorAll('.sp').forEach(b=>{ b.classList.toggle('b',+b.dataset.sp===sp); b.onclick=()=>{ sp=+b.dataset.sp; if(vid) vid.playbackRate=sp; view.querySelectorAll('.sp').forEach(x=>x.classList.toggle('b',x===b)); }; });
  const findIdx=t=>{ let lo=0,hi=res.length-1; while(lo<hi){ const m=(lo+hi+1)>>1; if(res[m].t<=t) lo=m; else hi=m-1; } return lo; };
  let t0=0, pt0=0; const curT=()=>vid?vid.currentTime*1000:(playing?res[0].t+(performance.now()-pt0)*sp+t0:res[idx].t);
  $('#pp').onclick=()=>{ playing=!playing; $('#pp').textContent=playing?'❚❚':'▶'; if(vid){ playing?vid.play():vid.pause(); } else { pt0=performance.now(); t0=res[idx].t-res[0].t; } };
  const seekI=i=>{ idx=Math.max(0,Math.min(res.length-1,i)); if(vid) vid.currentTime=res[idx].t/1000; else t0=res[idx].t-res[0].t, pt0=performance.now(); show(idx,true); };
  $('#fb').onclick=()=>seekI(idx-1); $('#ff').onclick=()=>seekI(idx+1); scrub.oninput=()=>seekI(+scrub.value);
  if(vid) vid.onended=()=>{ playing=false; $('#pp').textContent='▶'; };
  function ghostFor(i){ const r=res[i]; const cyc=S.cycles.find(c=>i>=c.i0&&i<=c.i1); let G=null;
    if(cyc){ const p=(i-cyc.i0)/Math.max(1,cyc.i1-cyc.i0); if(refSess&&(refSess.cyc.kind===cyc.kind)){ const j=Math.round(refSess.cyc.i0+p*(refSess.cyc.i1-refSess.cyc.i0)); G=refSess.res[j]._P.map(v=>v.clone()); }
      else { const kind=cyc.kind==='stand_sit'?'stand_sit':cyc.kind; if(hasRef(kind)) G=refPose(kind,p); } }
    else if(hasRef(r.act)&&['walking','running'].includes(r.act)) G=refPose(r.act,((r.t/1000)%1.1)/1.1);
    if(!G) return null; const P=res[i]._P; const fr=frames(P), yaw=Math.atan2(fr.F.x,fr.F.z); const legP=P[23].distanceTo(P[25])+P[25].distanceTo(P[27]), legG=G[23].distanceTo(G[25])+G[25].distanceTo(G[27]); const sc=legP/(legG||1);
    const hipP=P[23].clone().add(P[24]).multiplyScalar(.5), hipG=G[23].clone().add(G[24]).multiplyScalar(.5); const fG=frames(G), yawG=Math.atan2(fG.F.x,fG.F.z); const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw-yawG);
    return G.map(v=>v.clone().sub(hipG).multiplyScalar(sc).applyQuaternion(q).add(new THREE.Vector3(hipP.x,hipP.y,hipP.z))); }
  function ghostAligned(i){ const G=ghostFor(i); if(!G) return null; const P=res[i]._P; const fp=Math.min(...[29,30,31,32].map(k=>P[k].y)), fg=Math.min(...[29,30,31,32].map(k=>G[k].y)); return G.map(v=>v.setY(v.y+(fp-fg))); }
  function show(i,force){ const r=res[i]; window.__lastR=r; ana.update(r._P,r); ana.setGhost(ana.ghostOn?ghostAligned(i):null); scrub.value=i; draw2D(ov,vid?r._I:r._I,vw,vh);
    const n=performance.now(); if(force||n-lastUI>200){ lastUI=n; $('#act').textContent=ACT_LABEL[r.act]+(sess.override?' (manual)':''); $('#conf').textContent=sess.override?'':'confidence '+f0(r.conf*100)+'%'; $('#tm').textContent=f1((r.t-res[0].t)/1000)+' / '+f1(S.dur)+' s · '+ana.quality+' · '+f0(ana.fps)+' fps'; $('#panels').innerHTML=panelsHTML(r); window.__app.idx=i; } }
  const ACOL={walking:'#0a84ff',running:'#5e5ce6',stair_up:'#64d2ff',stair_down:'#40c8e0',sts:'#30d158',stand_sit:'#ff9f0a',squat:'#ffd400',lunge:'#bf5af2',bend_lift:'#ff375f',overhead:'#ff6482',push:'#ac8e68',pull:'#8e8e93',transfer:'#66d4cf',lying:'#444',sitting:'#666',standing:'#999',other:'#333'};
  function drawPhase(){ const c=$('#phase'); c.width=c.clientWidth||800; const g=c.getContext('2d'), W=c.width, n=res.length; res.forEach((r,i)=>{ g.fillStyle=ACOL[r.act]||'#333'; g.fillRect(i/n*W,0,W/n+1,18); if(r.contact.L){ g.fillStyle='#ffd400'; g.fillRect(i/n*W,19,W/n+1,3);} if(r.contact.R){ g.fillStyle='#0a84ff'; g.fillRect(i/n*W,23,W/n+1,3);} });
    g.fillStyle='#fff'; for(const cy of S.cycles){ g.fillRect(cy.i0/n*W,0,2,18); }
    $('#plg').innerHTML=[...new Set(res.map(r=>r.act))].map(a=>`<span style="color:${ACOL[a]}">■</span> ${ACT_LABEL[a]}`).join(' ')+' · white ticks = cycle/rep start · lower bars = foot contact L (yellow) / R (blue)';
    c.onclick=e=>seekI(Math.round(e.offsetX/c.clientWidth*(n-1))); }
  function sumHTML(){ const rows=romRows(S).map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('');
    return `<p>${esc(summaryText(S))}</p><table><tr><th>Activity</th><th>Start</th><th>Dur</th><th>Conf</th></tr>${S.segments.map(s=>`<tr><td>${ACT_LABEL[s.act]}</td><td>${f1(s.t0/1000-res[0].t/1000)} s</td><td>${f1(s.dur)} s</td><td>${f0(s.conf*100)}%</td></tr>`).join('')}</table>
    ${S.gait?`<h3>Gait (estimated)</h3><div>Cadence ${f0(S.gait.cadence)} steps/min · stance L ${f0(S.gait.stanceL)}% / R ${f0(S.gait.stanceR)}% · cycles ${S.gait.cycles} · peak swing knee ${f0(S.gait.peakSwingKnee)}°</div>`:''}
    <h3>ROM (3D estimate)</h3><table><tr><th>Joint</th><th>L range</th><th>L ROM</th><th>R range</th><th>R ROM</th><th>Asym</th></tr>${rows}</table>
    <h3>Flags</h3>${S.flags.map(([k,v])=>`<div class="warn">⚠ ${esc(k)} <span class="muted">${f1(v)} s</span></div>`).join('')||'<span class="ok">none</span>'}
    <h3>Muscle demand ranking (estimated)</h3><table><tr><th>Muscle</th><th>% time agonist</th><th>Mean demand</th><th>Contraction</th></tr>${S.muscles.slice(0,10).map(m=>`<tr><td>${esc(mName(m.k))}</td><td>${f0(m.agPct)}%</td><td>${f0(m.meanI*100)}%</td><td>${esc(m.type)}</td></tr>`).join('')}</table>
    <h3>Peak ligament/tendon loading index (estimated)</h3><div>${S.ligaments.slice(0,6).map(l=>`${esc(mName(l.k))} <b>${f0(l.max*100)}</b>`).join(' · ')}</div><p class="note">${esc(S.explain)}</p>`; }
  function drawCmp(c,key){ const g=c.getContext('2d'),W=c.width,H=c.height; g.fillStyle='#fff'; g.fillRect(0,0,W,H); const kind=(S.cycles.find(x=>x.kind===S.main)||S.cycles[0])?.kind; const cyc=S.cycles.filter(x=>x.kind===kind);
    const pc=cyc.length?meanCurve(res,cyc,key):null; let rc=null, src='';
    if(refSess&&refSess.cyc.kind===kind){ rc=patientCurve(refSess.res,refSess.cyc,key); src='saved reference ('+refSess.name+')'; } else if(kind&&hasRef(kind)){ const k2=key; rc=refCurve(kind,k2); src='synthetic normal pattern'; }
    g.fillStyle='#000'; g.font='bold 13px sans-serif'; const lab=[...JOINTS.flatMap(([k,l])=>[[k+'R',l+' R'],[k+'L',l+' L']]),...AXIAL].find(x=>x[0]===key)?.[1]||key; g.fillText(lab+(kind?' – '+ACT_LABEL[kind]+' cycle (%)':''),40,16);
    if(!pc){ g.font='12px sans-serif'; g.fillText('No complete cycles/repetitions detected for comparison.',40,60); return {note:'No cycles detected.'}; }
    const all=[...pc,...(rc||[])]; let mn=Math.min(...all),mx=Math.max(...all); if(mx-mn<10){ mx+=5; mn-=5; } const L=40,B=H-24,T=26,X=i=>L+(W-L-10)*i/100,Y=v=>B-(B-T)*(v-mn)/(mx-mn);
    g.strokeStyle='#ddd'; g.fillStyle='#555'; g.font='11px sans-serif'; for(let k=0;k<=4;k++){ const v=mn+(mx-mn)*k/4; g.beginPath(); g.moveTo(L,Y(v)); g.lineTo(W-10,Y(v)); g.stroke(); g.fillText(Math.round(v)+'°',4,Y(v)+4); } for(let p=0;p<=100;p+=25) g.fillText(p+'%',X(p)-8,H-8);
    const line=(a,col,dash)=>{ g.strokeStyle=col; g.lineWidth=2.5; g.setLineDash(dash||[]); g.beginPath(); a.forEach((v,i)=>i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v))); g.stroke(); g.setLineDash([]); };
    if(rc) line(rc,'#999',[6,4]); line(pc,'#d93025'); g.fillStyle='#d93025'; g.fillText('Patient (mean of '+cyc.length+')',W-260,16); g.fillStyle='#777'; if(rc) g.fillText('Reference: '+src,W-150,30>H?16:30);
    const note=rc?`RMS difference vs ${src}: ${f1(rms(pc,rc))}°  ·  patient ROM ${f0(Math.max(...pc)-Math.min(...pc))}° vs reference ${f0(Math.max(...rc)-Math.min(...rc))}°`:'No reference for this activity.'; return {note}; }
  const redraw=()=>{ $('#sum').innerHTML=sumHTML(); drawPhase(); const n=drawCmp($('#cmp'),$('#ck').value); $('#cnote').textContent=n.note; scrub.max=res.length-1; };
  $('#ck').value=S.main==='walking'||S.main==='running'?'kneeR':['sts','stand_sit','squat'].includes(S.main)?'hipFlexR':'kneeR'; $('#ck').onchange=redraw;
  $('#ovr').onchange=async()=>{ sess.override=$('#ovr').value||null; res=relabelO(sm,sess.override); S=summarize(res); window.__app.S=S; window.__app.res=res; await loadRef(); redraw(); show(idx,true); };
  redraw(); show(0,true);
  const tick=()=>{ loopId=requestAnimationFrame(tick); if(playing||vid){ const t=curT(); const i=findIdx(vid?t:t); if(!vid&&res[res.length-1].t<t){ playing=false; $('#pp').textContent='▶'; } if(i!==idx||playing){ idx=i; show(i); } } else show(idx); };
  tick();
  const persist=async()=>{ if(!store||!sess.patientId){ alert('Quick demo sessions are not saved – open a patient first.'); return false; } sess.obs=$('#obs').value; sess.main=S.main; sess.flags=S.flags.length; sess.kneeL=S.rom.kneeL?.rom; sess.kneeR=S.rom.kneeR?.rom; await store.put('sessions',sess); return true; };
  $('#save').onclick=async()=>{ if(await persist()) $('#save').textContent='Saved ✓'; };
  $('#mref').onclick=async()=>{ if(!await persist()) return; await store.setSetting('ref_'+S.main,sess.id); sess.isRef=true; await store.put('sessions',sess); $('#mref').textContent='Reference set for '+ACT_LABEL[S.main]+' ✓'; };
  $('#sdel').onclick=async()=>{ if(sess.id&&confirm('Delete session?')){ await store.del('sessions',sess.id); if(sess.mediaId) await store.del('media',sess.mediaId); patient(sess.patientId); } };
  $('#snap').onclick=async()=>{ const u=ana.snapshot(); const b=await (await fetch(u)).blob(); shareOrDownload(b,'biomech-3d.jpg'); };
  async function shots(){ const out=[]; const keep=idx; const picks=[]; const byKnee=res.reduce((b,r,i)=>Math.max(r.a.kneeL,r.a.kneeR)>Math.max(res[b].a.kneeL,res[b].a.kneeR)?i:b,0); const byTrunk=res.reduce((b,r,i)=>r.a.trunkFlex>res[b].a.trunkFlex?i:b,0);
    picks.push([byKnee,'oblique','Peak knee flexion (3/4 view)'],[byKnee,'latR','Peak knee flexion (lateral)'],[byTrunk,'anterior','Peak trunk flexion (anterior)'],[Math.floor(res.length/2),'posterior','Mid-session (posterior)']);
    const cp=ana.cam.position.clone(); for(const [i,v,cap] of picks){ ana.view(v); show(i,true); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); out.push({url:ana.snapshot(),cap:cap+' – '+ACT_LABEL[res[i].act]+' t='+f1((res[i].t-res[0].t)/1000)+'s'}); }
    ana.cam.position.copy(cp); ana.ctl.update(); show(keep,true); return out; }
  const charts=()=>{ const out=[]; const keys=S.main==='walking'||S.main==='running'?['kneeR','hipFlexR','ankleR']:['hipFlexR','kneeR','trunkFlex']; for(const k of keys){ const c=document.createElement('canvas'); c.width=800; c.height=260; const n=drawCmp(c,k); out.push({url:c.toDataURL('image/jpeg',0.85),w:800,h:260,note:n.note}); } return out; };
  $('#pdf').onclick=async()=>{ $('#pdf').textContent='Building…'; const blob=makePDF({patient:pat,session:sess,S,shots:await shots(),charts:charts(),obs:$('#obs').value,clin:store?.profile.name}); $('#pdf').textContent='PDF report'; window.__app.pdfSize=blob.size; shareOrDownload(blob,`biomech_${(pat.name||'').replace(/\W+/g,'_')}_${sess.startedAt.slice(0,10)}.pdf`); };
  $('#xls').onclick=()=>{ const blob=makeXLSX({patient:pat,session:sess,S,res,obs:$('#obs').value}); window.__app.xlsSize=blob.size; shareOrDownload(blob,`biomech_${(pat.name||'').replace(/\W+/g,'_')}_${sess.startedAt.slice(0,10)}.xlsx`); };
  window.__app.S=S; window.__app.res=res; window.__app.seek=seekI; }
window.__app.upload=f=>upload(curPat,f);
login();
