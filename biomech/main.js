// Integrated screen: camera + region 3D anatomy + analysis. No login; optional anonymous local save (PIN-encrypted if a PIN is set).
import * as THREE from 'three';
import { Atlas, LAYERS, PEEL, regions } from './atlas.js';
import { Arthro, AJ, AJ_FOR } from './arthro.js';
import { Kinetics, TAG } from './kinetics.js';
import { MOTIONS, REG_MOTIONS, ROLE_COL, ROLE_N, liveMotion, matchRoles } from './kb2.js';
import { Analyzer, toVecs, smoothLm, ACT_LABEL } from './bio.js';
const $=s=>document.querySelector(s), f0=v=>v==null||isNaN(v)?'–':Math.round(v), f1=v=>v==null||isNaN(v)?'–':(+v).toFixed(1), f2=v=>v==null||isNaN(v)?'–':(+v).toFixed(2);
const C='<span class="tag tc">camera-estimated</span>', IN=t=>`<span class="tag ti">requires ${t||'instrument'}</span>`;
const S={facing:'user',stream:null,view:'–',pose:null,r:null,k:null,tab:'kin',region:'elbow',side:'R',motion:'auto',mass:+localStorage.getItem('bm2_mass')||70,load:0,arLive:true};
window.__b2=S;
// ---------- start ----------
document.querySelectorAll('#start [data-cam]').forEach(b=>b.onclick=()=>start(b.dataset.cam));
async function start(mode){ $('#start').style.display='none'; $('#app').style.display='flex'; await initUI(); if(mode==='user'||mode==='environment'){ S.facing=mode; await openCam(); } else if(mode==='file') $('#vidPick').click(); else { $('#pcam').style.opacity=.5; } }
$('#vidPick').onchange=e=>{ const f=e.target.files[0]; if(!f) return; stopCam(); const v=$('#vid'); v.srcObject=null; v.src=URL.createObjectURL(f); v.loop=true; v.classList.remove('mir'); S.mirror=false; v.play(); runPose(); };
function stopCam(){ if(S.stream){ S.stream.getTracks().forEach(t=>t.stop()); S.stream=null; } }
async function openCam(){ stopCam(); const v=$('#vid'); try{ S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:S.facing},width:{ideal:1280},height:{ideal:720}},audio:false}); }
  catch(e){ $('#hud').innerHTML='<span class="pill" style="background:#600">Camera unavailable: '+e.name+'</span>'; return; }
  const tr=S.stream.getVideoTracks()[0], st=tr.getSettings?.()||{}; S.camLabel=tr.label; S.actualFacing=st.facingMode||S.facing;
  S.mirror=(st.facingMode||S.facing)==='user'; v.classList.toggle('mir',S.mirror); v.srcObject=S.stream; await v.play().catch(()=>{}); runPose(); }
$('#camT').onclick=async()=>{ S.facing=S.facing==='user'?'environment':'user'; await openCam(); hud(); };
// ---------- pose loop ----------
let an=new Analyzer(), kin=window.__kin=new Kinetics(), prevP=null, running=false;
async function runPose(){ if(running) return; running=true; $('#poseP').textContent='pose: loading…'; const {initPose,detect}=await import('./pose.js'); const ok=await initPose(); $('#poseP').textContent=ok?'pose: ready':'pose: failed';
  const v=$('#vid'); let last=0; const tick=()=>{ requestAnimationFrame(tick); if(v.readyState<2||v.paused&&!v.srcObject) return; const t=performance.now(); if(t-last<30) return; last=t; const d=detect(v); if(!d){ S.r=null; drawOv(null); return; }
   const P=smoothLm(prevP,toVecs(d.W.map(a=>({x:a[0],y:a[1],z:a[2]}))),0.6); prevP=P; const r=an.push(t,P,d.I); S.r=r; S.I=d.I; S.view=detectView(d.I); S.wbDbg=[r.contact,r.wb]; S.k=kin.push(t,P,{mass:S.mass,loadKg:S.load,contact:r.contact,wb:r.wb,a:r.a}); S.frames=(S.frames||0)+1;
   drawOv(d.I); live(); }; tick(); }
// view auto-detect from image landmarks (raw, un-mirrored frame): person's left shoulder appears on image right when facing the camera
function detectView(I){ const sw=Math.abs(I[11][0]-I[12][0]), th=Math.abs((I[11][1]+I[12][1])/2-(I[23][1]+I[24][1])/2)||.2; const ratio=sw/th;
  let v; if(ratio<0.38){ const noseX=I[0][0], shX=(I[11][0]+I[12][0])/2; const faceRight=noseX>shX; /* image right */ v='lateral-'+(faceRight?'R':'L')+'side'; v=faceRight?'lateral (left side to camera)':'lateral (right side to camera)'; if(!faceRight) S.camSide='R'; else S.camSide='L'; S.vk='lat'; }
  else { const ant=I[11][0]>I[12][0]; v=ant?'anterior':'posterior'; S.vk=ant?'ant':'post'; S.camSide=null; }
  S.vhist=(S.vhist||[]).concat(v).slice(-15); const cnt={}; S.vhist.forEach(x=>cnt[x]=(cnt[x]||0)+1); return Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0]; }
const EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32]];
function drawOv(I){ const c=$('#ov'), v=$('#vid'); const w=c.clientWidth,h=c.clientHeight; if(c.width!==w) c.width=w; if(c.height!==h) c.height=h; const g=c.getContext('2d'); g.clearRect(0,0,w,h); if(!I||!v.videoWidth) return;
  const s=Math.min(w/v.videoWidth,h/v.videoHeight), ox=(w-v.videoWidth*s)/2, oy=(h-v.videoHeight*s)/2; const X=p=>ox+(S.mirror?1-p[0]:p[0])*v.videoWidth*s, Y=p=>oy+p[1]*v.videoHeight*s;
  g.lineWidth=3; for(const [a,b] of EDGES){ const L=[11,13,15,23,25,27,29,31].includes(a)&&[11,13,15,23,25,27,29,31].includes(b); g.strokeStyle=a===11&&b===12||a===23&&b===24?'#fff':L?'#30d158':'#ff9f0a'; g.beginPath(); g.moveTo(X(I[a]),Y(I[a])); g.lineTo(X(I[b]),Y(I[b])); g.stroke(); }
  g.font='bold 13px system-ui'; g.fillStyle='#30d158'; g.fillText('L',X(I[11])+6,Y(I[11])); g.fillStyle='#ff9f0a'; g.fillText('R',X(I[12])+6,Y(I[12]));
  const j=jointIdx(); if(j){ g.fillStyle='#ffd60a'; g.beginPath(); g.arc(X(I[j]),Y(I[j]),8,0,7); g.fill(); g.fillStyle='#000'; g.fillText(f0(curAngle())+'°',X(I[j])-10,Y(I[j])+4); g.fillStyle='#fff'; g.fillText(f0(curAngle())+'°',X(I[j])+10,Y(I[j])-10); } }
function hud(){ $('#hud').innerHTML=`<span class="pill">${S.stream?(S.mirror?'front (mirrored view, anatomical L/R kept)':'rear camera'):'video'}</span><span class="pill">view: ${S.view}</span>${S.r?`<span class="pill">${ACT_LABEL[S.r.act]||S.r.act}</span>`:''}`; $('#viewP').textContent='view: '+S.view; }
// ---------- region / atlas ----------
let atlas, arthro, REG;
const JOINT_ANG={elbow:'elbow',gh:'shFlex',rul:null,rc:null,hip:'hipFlex',tf:'knee',tc:'ankle',spine:'trunkFlex'};
const JIDX={elbow:[13,14],gh:[11,12],rul:[13,14],rc:[15,16],hip:[23,24],tf:[25,26],tc:[27,28],spine:null};
function jointKey(){ return REG?.regions?.[S.region]?.joint||'elbow'; }
function jointIdx(){ const j=JIDX[jointKey()]; return j?j[S.side==='L'?0:1]:null; }
function curMotion(){ const j=REG_MOTIONS[S.region]||['elbow']; if(S.motion!=='auto'){ const [jj,mm]=S.motion.split('.'); return {j:jj,m:mm,mot:MOTIONS[jj]?.[mm]}; }
  for(const jj of j){ const mm=S.r?liveMotion(jj,S.r.w,S.r.a,S.side):null; if(mm) return {j:jj,m:mm,mot:MOTIONS[jj][mm],live:true}; } const jj=j[0], mm=Object.keys(MOTIONS[jj])[0]; return {j:jj,m:mm,mot:MOTIONS[jj][mm]}; }
function curAngle(){ const m=curMotion().mot; const key=m?.live; if(!key||!S.r) return null; return S.r.a[['trunkFlex','trunkLat','trunkRot','neck'].includes(key)?key:key+S.side]; }
async function initUI(){ if(atlas) return; REG=await regions().catch(()=>({regions:{}})); const sel=$('#reg'); const gs={}; for(const [k,r] of Object.entries(REG.regions)) (gs[r.group]=gs[r.group]||[]).push([k,r.name]);
  sel.innerHTML=Object.entries(gs).map(([g,a])=>`<optgroup label="${g}">${a.map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</optgroup>`).join(''); sel.value=S.region;
  $('#lic').innerHTML='3D anatomy: '+(REG.license||'')+' <a href="https://creativecommons.org/licenses/by-sa/4.0/" style="color:#79a" target="_blank">CC BY-SA 4.0</a>';
  atlas=new Atlas($('#atl')); atlas.onSelect=u=>showSel(u); window.__atlas=atlas;
  sel.onchange=()=>{ S.region=sel.value; loadRegion(); }; $('#side').onchange=()=>{ S.side=$('#side').value; loadRegion(); }; $('#mot').onchange=()=>{ S.motion=$('#mot').value; S.hlKey=null; live(true); };
  document.querySelectorAll('#mtabs button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('#mtabs button').forEach(x=>x.classList.toggle('on',x===b)); document.querySelectorAll('.pn').forEach(p=>p.classList.toggle('show',p.id===b.dataset.p)); atlas.resize(); arthro?.resize(); });
  tabs(); await loadRegion(); setInterval(()=>{ hud(); renderTab(); },400); }
async function loadRegion(){ const r=REG.regions[S.region]; $('#ltools').innerHTML='<span class="muted">Loading '+(r?.name||S.region)+' model'+(r?` (${(r.bytes/1e6).toFixed(1)} MB, cached after first load)`:'')+'…</span>';
  const res=await atlas.load(S.region,S.side); S.real=res.real; const js=REG_MOTIONS[S.region]||[]; $('#mot').innerHTML='<option value="auto">Motion: auto (live)</option>'+js.map(j=>Object.entries(MOTIONS[j]).map(([k,m])=>`<option value="${j}.${k}">${m.n}</option>`).join('')).join(''); S.motion='auto'; S.hlKey=null;
  const aj=AJ_FOR[S.region]||['hu']; if(arthro&&!aj.includes(arthro.k)) arthro.build(aj[0]); tools(); live(true); }
function tools(){ const T=$('#ltools'); T.innerHTML=`<div><button id="peel" class="y">Peel next layer</button><button id="unpeel">Undo peel</button><button id="rest">Restore</button>
  <input id="q" placeholder="Search structure…" style="width:150px"><span id="qr"></span></div>
  <div><button data-v="anterior">Ant</button><button data-v="posterior">Post</button><button data-v="lateral">Lat</button><button data-v="medial">Med</button>
  Section <select id="sec"><option value="">off</option><option value="x">sagittal</option><option value="y">transverse</option><option value="z">coronal</option></select><input type="range" id="secf" min="0" max="1" step="0.01" value="0.5"> <label><input type="checkbox" id="hlOn" checked> movement highlight</label></div>
  <div id="lays">${LAYERS.map(([k,n])=>`<div class="lr"><input type="checkbox" data-l="${k}" checked><span>${n} <small class="muted">(${atlas.meshes.filter(m=>m.userData.layer===k).length})</small></span><input type="range" min="0.05" max="1" step="0.05" data-o="${k}" value="${atlas.layer[k].op}"></div>`).join('')}</div>
  <div class="muted">${S.real?'Real anatomy model (Z-Anatomy / BodyParts3D derived) · '+atlas.meshes.length+' structures':'Model not available offline yet – procedural fallback shown'}</div>`;
  const sync=()=>T.querySelectorAll('[data-l]').forEach(c=>c.checked=atlas.layer[c.dataset.l].on);
  $('#peel').onclick=()=>{ atlas.peel(); sync(); }; $('#unpeel').onclick=()=>{ atlas.unpeel(); sync(); }; $('#rest').onclick=()=>{ atlas.restore(); sync(); $('#sec').value=''; };
  T.querySelectorAll('[data-l]').forEach(c=>c.onchange=()=>atlas.setLayer(c.dataset.l,c.checked)); T.querySelectorAll('[data-o]').forEach(c=>c.oninput=()=>atlas.setLayer(c.dataset.o,null,+c.value));
  T.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>atlas.view(b.dataset.v));
  const sec=()=>atlas.setSection($('#sec').value||null,+$('#secf').value); $('#sec').onchange=sec; $('#secf').oninput=sec; $('#hlOn').onchange=()=>{ S.hlKey=null; live(true); };
  $('#q').oninput=()=>{ const r=atlas.find($('#q').value).slice(0,12); $('#qr').innerHTML=r.map(u=>`<button class="qs" data-id="${u.id}" style="font-size:11px;padding:2px 6px">${u.name}</button>`).join(''); $('#qr').querySelectorAll('.qs').forEach(b=>b.onclick=()=>{ atlas.select(b.dataset.id); atlas.focus([b.dataset.id]); }); }; }
function showSel(u){ const b=$('#selbox'); if(!u){ b.style.display='none'; return; } const role=S.roles?.[u.id]; const L=LAYERS.find(l=>l[0]===u.layer);
  b.innerHTML=`<b>${u.name}</b><br><span class="muted">${L?L[1]:u.layer} · ${u.side==='M'?'midline':S.side==='L'&&u.side==='R'?'left (mirrored)':u.side==='R'?'right':'left'} · ${u.region}</span>${role?`<br><span class="role" style="background:${ROLE_COL[role.role]}"></span>${ROLE_N[role.role]}: ${role.txt}`:''}
  <div><button id="isoB">Isolate</button><button id="hideB">Hide</button><button id="allB">Show all</button></div>`; b.style.display='block';
  $('#isoB').onclick=()=>atlas.isolate([u.id]); $('#hideB').onclick=()=>{ atlas.hide(u.id); b.style.display='none'; }; $('#allB').onclick=()=>{ atlas.isolate([]); atlas.hidden=null; atlas.apply(); }; }
// ---------- live linking ----------
function live(force){ const cm=curMotion(); const key=cm.j+'.'+cm.m+($('#hlOn')?.checked===false?'off':''); if(atlas&&(force||key!==S.hlKey)){ S.hlKey=key; S.cm=cm; const map={}; S.roles=$('#hlOn')?.checked===false?{}:matchRoles(cm.mot,atlas.names()); for(const id in S.roles) map[id]={col:ROLE_COL[S.roles[id].role],k:1}; atlas.highlight(map); osteo(cm); }
  if(arthro&&S.arLive&&S.r){ const J=arthro.J; if(J.live){ const v=S.r.a[J.live+S.side]; if(v!=null) arthro.set(Math.max(J.range[0],Math.min(J.range[1],v))); } } }
// osteokinematics: plane + axis drawn at the joint
function osteo(cm){ const g=atlas.extra; g.clear(); if(!cm?.mot||!atlas.box) return; const [x0,x1,y0,y1,z0,z1]=atlas.box; const c=new THREE.Vector3((x0+x1)/2,(y0+y1)/2,(z0+z1)/2); const s=Math.max(x1-x0,y1-y0)*0.7;
  const pl=cm.mot.plane.toLowerCase(); const mat=new THREE.MeshBasicMaterial({color:'#0a84ff',transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}); const mk=(rx,ry)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s),mat); m.rotation.set(rx,ry,0); m.position.copy(c); g.add(m); };
  const axm=new THREE.MeshBasicMaterial({color:'#ffd60a'}); const ax=(v)=>{ const m=new THREE.Mesh(new THREE.CylinderGeometry(s*.006,s*.006,s*1.1,8),axm); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v); m.position.copy(c); g.add(m); };
  if(pl.startsWith('sagittal')){ mk(0,Math.PI/2); ax(new THREE.Vector3(1,0,0)); } else if(pl.startsWith('frontal')){ mk(0,0); ax(new THREE.Vector3(0,0,1)); } else if(pl.startsWith('transverse')){ mk(Math.PI/2,0); ax(new THREE.Vector3(0,1,0)); }
  else { const cone=new THREE.Mesh(new THREE.ConeGeometry(s*.35,s*.7,32,1,true),new THREE.MeshBasicMaterial({color:'#bf5af2',wireframe:true,transparent:true,opacity:.35})); cone.position.copy(c); cone.position.y-=s*.35; g.add(cone); } }
// ---------- analysis tabs ----------
const TABS=[['kin','Kinematics'],['osteo','Osteo'],['arthro','Arthro'],['kinet','Kinetics'],['str','Structures'],['sess','Session']];
function tabs(){ $('#tabs').innerHTML=TABS.map(([k,n])=>`<button data-t="${k}" class="${k===S.tab?'on':''}">${n}</button>`).join(''); $('#tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{ S.tab=b.dataset.t; tabs(); renderTab(true); }); }
function viewNote(){ const v=S.vk; if(!v) return '<p class="muted">Stand fully in frame; view is detected automatically.</p>'; return v==='lat'?`<p class="muted">Lateral view (${S.camSide==='R'?'right':'left'} side nearer camera) → sagittal angles & sagittal kinetics most reliable; frontal-plane values (valgus, abduction, lateral flexion) down-weighted.${S.camSide&&S.camSide!==S.side?' <b>Tip:</b> analysed side is away from camera – switch side to '+(S.camSide==='R'?'Right':'Left')+'.':''}</p>`:`<p class="muted">${v==='ant'?'Anterior':'Posterior'} view → frontal-plane values (valgus, abduction, pelvic obliquity, lateral flexion) most reliable; sagittal angles rely on depth estimate.</p>`; }
const PLANE_OK=(pl)=>!S.vk?'':S.vk==='lat'?(pl==='Sagittal'?'high':'low'):(pl==='Frontal'?'high':pl==='Sagittal'?'medium':'low');
const LBL={elbow:'Elbow flexion',shFlex:'Shoulder flexion',shAbd:'Shoulder abduction',hipFlex:'Hip flexion',hipAbd:'Hip abduction',knee:'Knee flexion',ankle:'Ankle dorsiflexion',valgus:'Knee valgus',trunkFlex:'Trunk flexion',trunkLat:'Trunk lateral flexion',trunkRot:'Trunk rotation',neck:'Neck flexion',pelvicObl:'Pelvic obliquity'};
const PLANE={elbow:'Sagittal',shFlex:'Sagittal',shAbd:'Frontal',hipFlex:'Sagittal',hipAbd:'Frontal',knee:'Sagittal',ankle:'Sagittal',valgus:'Frontal',trunkFlex:'Sagittal',trunkLat:'Frontal',trunkRot:'Transverse',neck:'Sagittal',pelvicObl:'Frontal'};
const REG_ANG={gh:['shFlex','shAbd','elbow'],elbow:['elbow','shFlex'],rul:['elbow'],rc:['elbow'],hip:['hipFlex','hipAbd','knee','pelvicObl'],tf:['knee','valgus','hipFlex','ankle'],tc:['ankle','knee'],spine:['trunkFlex','trunkLat','trunkRot','neck','pelvicObl']};
let lastTab=0;
function renderTab(force){ const t=performance.now(); if(!force&&t-lastTab<350) return; const ae=document.activeElement; if(!force&&ae&&ae.closest&&ae.closest('#tbody')&&/INPUT|SELECT/.test(ae.tagName)&&ae.type!=='range'&&ae.type!=='checkbox') return; lastTab=t; const B=$('#tbody'); const k=S.k, r=S.r;
 if(S.tab==='kin'){ const keys=REG_ANG[jointKey()]||['elbow']; const rows=keys.map(a=>{ const kk=['trunkFlex','trunkLat','trunkRot','neck','pelvicObl'].includes(a)?a:a+S.side; const q=k?.kin?.[kk]; return `<tr><td>${LBL[a]} ${kk.endsWith(S.side)?S.side:''}</td><td><b>${f0(q?.v)}°</b></td><td>${f0(q?.rom)}°</td><td>${f0(q?.disp)}°</td><td>${f0(q?.w)}°/s</td><td>${f0(q?.al)}°/s²</td><td>${PLANE[a]} <small class="muted">${PLANE_OK(PLANE[a])}</small></td></tr>`; }).join('');
  B.innerHTML=`${viewNote()}<table><tr><th>Joint</th><th>Angle</th><th>ROM</th><th>Disp.</th><th>ω</th><th>α</th><th>Plane / conf.</th></tr>${rows}</table><p>${C} angles from 3D pose (±5–10° typical vs goniometer). <button id="kr">Reset ROM</button></p>
  <canvas id="traj" width="360" height="170" style="width:100%;background:#07080b;border-radius:8px"></canvas><p class="muted">Sagittal trajectories (last 3 s): <span style="color:#ff9f0a">wrist</span>, <span style="color:#30d158">ankle</span>, <span style="color:#fff">COM</span> ${C}</p>
  ${k?`<p>Segment alignment: trunk vs shank angle diff ${f0(k.align.trunkVsShank)}° · knee ahead of toe L ${f1(k.align.kneeOverToe.L)} / R ${f1(k.align.kneeOverToe.R)} cm ${C}</p>`:''}`;
  $('#kr').onclick=()=>kin.reset(); drawTraj(); }
 else if(S.tab==='osteo'){ const cm=curMotion(); const js=REG_MOTIONS[S.region]||[]; B.innerHTML=viewNote()+js.map(j=>`<h4 style="margin:6px 0">${{elbow:'Elbow',rul:'Radio-ulnar',gh:'Shoulder (GH)',rc:'Wrist',hand:'Hand',hip:'Hip',tf:'Knee',tc:'Ankle',spine:'Spine / trunk'}[j]}</h4><table><tr><th>Motion</th><th>Plane</th><th>Axis</th><th>Live</th></tr>${Object.entries(MOTIONS[j]).map(([kk,m])=>`<tr style="${cm.j===j&&cm.m===kk?'background:#102a44':''}"><td>${m.n}</td><td>${m.plane}</td><td>${m.axis}</td><td>${m.live?(S.r?f0(S.r.a[['trunkFlex','trunkLat','trunkRot','neck'].includes(m.live)?m.live:m.live+S.side])+'° '+C:'–'):IN('goniometer / IMU (not tracked by pose)')}</td></tr>`).join('')}</table>`).join('')+'<p class="muted">The highlighted motion’s plane (blue) and axis (yellow) are drawn on the 3D model; circumduction is shown as a cone. Pick a motion in the toolbar to lock it.</p>'; }
 else if(S.tab==='arthro'){ if(!B.querySelector('#arc')){ const aj=AJ_FOR[S.region]||['hu']; B.innerHTML=`<div><select id="aj">${Object.entries(AJ).map(([kk,j])=>`<option value="${kk}" ${aj.includes(kk)?'':'style="color:#888"'}>${j.n}</option>`).join('')}</select><label><input type="checkbox" id="arL" ${S.arLive?'checked':''}> drive from live angle</label><button id="arA">▶ Animate</button></div><canvas id="arc"></canvas><input type="range" id="ars" style="width:100%"><div id="ari"></div>`;
   if(!arthro){ arthro=new Arthro($('#arc')); window.__arthro=arthro; } else { $('#arc').replaceWith(arthro.cv); arthro.resize(); }
   if(!aj.includes(arthro.k)) arthro.build(aj[0]); $('#aj').value=arthro.k; const sl=()=>{ const J=arthro.J; $('#ars').min=J.range[0]; $('#ars').max=J.range[1]; $('#ars').value=arthro.theta; };
   $('#aj').onchange=()=>{ arthro.build($('#aj').value); sl(); }; $('#ars').oninput=()=>{ S.arLive=false; $('#arL').checked=false; arthro.auto=false; arthro.set(+$('#ars').value); }; $('#arL').onchange=()=>S.arLive=$('#arL').checked; $('#arA').onclick=()=>{ arthro.auto=!arthro.auto; S.arLive=false; $('#arL').checked=false; }; sl(); }
  const st=arthro.state(), J=st.J; B.querySelector('#ari').innerHTML=`<p><b>${J.n} – ${J.mot}: ${f0(st.theta)}°</b> ${J.live&&S.arLive&&S.r?C+' live':'<span class="muted">(slider/animation)</span>'}</p>
   <p><span style="color:#ff6b6b">● roll (${J.roll})</span> · <span style="color:#4da3ff">● glide (${J.glide})</span> · <span style="color:#30d158">● contact</span> · <span style="color:#ffd60a">axis</span>${J.spin?' · <span style="color:#bf5af2">spin axis</span>':''}</p><p>${J.rule}</p>
   <p><b>Moving:</b> ${J.moving}<br><b>Fixed:</b> ${J.fixed}</p><p><b>Accessory motions:</b><br>${J.acc.map(a=>'• '+a).join('<br>')}</p>
   <p><b>Restraints:</b><br>${J.res.map((x,i)=>`• ${x[0]} – <b>${st.strain[i]>0.02?'tensioning':'slack'}</b> (${f0(Math.max(0,st.strain[i])*100)}% schematic elongation)`).join('<br>')}</p><p class="muted">Close-packed: ${J.close} · Loose-packed: ${J.loose}. Surface geometry is schematic; in-vivo roll/glide magnitudes ${IN('imaging (fluoroscopy / MRI)')}.</p>`; }
 else if(S.tab==='kinet'){ const js=jointKey()==='tf'||jointKey()==='hip'||jointKey()==='tc'||jointKey()==='spine'?['hip','knee','ankle']:['sh','elbow']; const N={sh:'Shoulder',elbow:'Elbow',hip:'Hip',knee:'Knee',ankle:'Ankle'};
  const rows=k?['L','R'].flatMap(s=>js.map(j=>{ const q=k.joints[j+s]; return `<tr><td>${N[j]} ${s}${q.stance?' <small class="muted">stance</small>':''}</td><td>${f1(q.external)}</td><td><b>${f1(q.internal)}</b><br><small>${f2(q.internalKg)} Nm/kg</small></td><td>${q.kind}</td><td>${f0(q.force)} N<br><small>${f1(q.forceBW)}×BW · ${q.muscle}</small></td><td>${q.lever}<br><small>MA ${f2(q.MA)}</small></td></tr>`; })).join(''):'';
  B.innerHTML=`<div>Body mass <input id="ms" type="number" value="${S.mass}" style="width:70px"> kg · hand load <input id="ld" type="number" value="${S.load}" style="width:60px"> kg</div>${viewNote()}
  ${k?`<table><tr><th>Joint</th><th>Ext. moment Nm</th><th>Int. (net) moment</th><th>Type</th><th>Muscle force (moment-arm est.)</th><th>Lever</th></tr>${rows}</table>
  <p>${C} Sagittal 2D inverse dynamics, de Leva (1996) segment parameters, mass ${S.mass} kg. Arms: top-down from free hand. Legs in stance: bottom-up from <b>estimated</b> GRF. Muscle force = net moment / typical moment arm (ignores co-contraction → lower bound).</p>
  <table><tr><td>Est. vertical GRF</td><td><b>${f0(k.grf.y)} N</b> (${f2(k.grf.bw)}×BW)</td><td>${IN('force plates')} – estimate from COM acceleration</td></tr>
  <tr><td>COM height</td><td>${f2(k.com[1]+1)} (rel.)</td><td>${C}</td></tr><tr><td>COM vertical accel.</td><td>${f2(k.aCom[1])} m/s²</td><td>${C}</td></tr>
  <tr><td>Sagittal COM vs foot (pose)</td><td>${S.k?.bos?Object.entries(S.k.bos).map(([k,v])=>k+': '+v).join(', '):'–'}</td><td>${C} – COP assumed under COM; 'behind heel' means pose depth error, moments less reliable</td></tr><tr><td>Stability margin (COM to BOS edge)</td><td>${r?f1(r.margin*100)+' cm':'–'}</td><td>${C}${r&&r.margin<0?' <b style="color:#ff6b6b">outside BOS</b>':''}</td></tr>
  <tr><td>Sway</td><td>${r?f1(r.sway)+' cm':'–'}</td><td>${C}</td></tr><tr><td>Joint contact forces, COP, EMG</td><td>–</td><td>${IN('force plates / EMG')}</td></tr></table>
  <p class="muted">Gravity loading: external moment = segment weight (+load) × horizontal distance to the joint. Lever class & mechanical advantage (MA = muscle moment arm / load moment arm) from typical anatomy.</p>`:'<p class="muted">Kinetics appear once a person is tracked by the camera.</p>'}`;
  $('#ms').onchange=()=>{ S.mass=+$('#ms').value||70; localStorage.setItem('bm2_mass',S.mass); }; $('#ld').onchange=()=>S.load=+$('#ld').value||0; }
 else if(S.tab==='str'){ const cm=S.cm||curMotion(); const items=Object.entries(S.roles||{}); const by={}; for(const [id,x] of items) (by[x.role]=by[x.role]||[]).push([id,x]);
  const act=r?.muscles||{};
  B.innerHTML=`<p><b>${cm.mot?.n||''}</b> ${cm.live?C+' detected live':'<span class="muted">(choose motion or move)</span>'}</p>`+['ag','sy','an','st','re','nv'].filter(x=>by[x]).map(x=>`<h4 style="margin:6px 0"><span class="role" style="background:${ROLE_COL[x]}"></span>${ROLE_N[x]}</h4>`+[...new Map(by[x].map(([id,y])=>[y.txt,id])).entries()].map(([txt,id])=>`<div><a href="#" data-id="${id}" style="color:#cde">${txt}</a></div>`).join('')).join('')+
  `<p class="muted">Roles from the knowledge base; muscle activation level ${IN('EMG')}. Click to locate in 3D.</p>${r?`<p class="muted">Activity estimate: ${ACT_LABEL[r.act]||r.act} · seated/lying → leg muscles not shown as gravity-active.</p>`:''}`;
  B.querySelectorAll('[data-id]').forEach(a=>a.onclick=e=>{ e.preventDefault(); atlas.select(a.dataset.id); atlas.focus([a.dataset.id]); }); }
 else if(S.tab==='sess'){ if(force) sessTab(B); }
}
function drawTraj(){ const c=$('#traj'); if(!c||!S.k) return; const g=c.getContext('2d'); g.clearRect(0,0,c.width,c.height); const T=S.k.trail; const all=Object.values(T).flat(); if(!all.length) return;
 const xs=all.map(p=>p[1]), ys=all.map(p=>p[2]); const x0=Math.min(...xs)-.05,x1=Math.max(...xs)+.05,y0=Math.min(...ys)-.05,y1=Math.max(...ys)+.05; const s=Math.min(c.width/(x1-x0),c.height/(y1-y0));
 for(const [k,col] of [['wrist'+S.side,'#ff9f0a'],['ankle'+S.side,'#30d158'],['com','#fff']]){ const tr=T[k]; if(!tr) continue; g.strokeStyle=col; g.lineWidth=2; g.beginPath(); tr.forEach((p,i)=>{ const X=(p[1]-x0)*s, Y=c.height-(p[2]-y0)*s; i?g.lineTo(X,Y):g.moveTo(X,Y); }); g.stroke(); } }
// ---------- optional anonymous session save ----------
function anonId(){ let id=localStorage.getItem('bm2_anon'); if(!id){ id='anon-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36); localStorage.setItem('bm2_anon',id); } return id; }
async function key(pin,salt){ const b=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']); return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt']); }
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))), ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function saveSession(pin){ const sum={id:anonId(),at:new Date().toISOString(),region:S.region,side:S.side,view:S.view,frames:S.frames||0,kin:S.k?.kin||{},kinetics:S.k?Object.fromEntries(Object.entries(S.k.joints).map(([j,q])=>[j,{internal:q.internal,force:q.force}])):{},mass:S.mass};
 let rec; if(pin){ const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12)); const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(pin,salt),new TextEncoder().encode(JSON.stringify(sum))); rec={enc:1,salt:b64(salt),iv:b64(iv),ct:b64(ct),at:sum.at,region:sum.region}; } else rec={enc:0,...sum};
 const all=JSON.parse(localStorage.getItem('bm2_sessions')||'[]'); all.push(rec); localStorage.setItem('bm2_sessions',JSON.stringify(all.slice(-50))); return rec; }
async function openRec(rec,pin){ if(!rec.enc) return rec; const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(rec.iv)},await key(pin,ub64(rec.salt)),ub64(rec.ct)); return JSON.parse(new TextDecoder().decode(pt)); }
function sessTab(B){ const all=JSON.parse(localStorage.getItem('bm2_sessions')||'[]'); B.innerHTML=`<p>Anonymous ID: <b>${anonId()}</b> (local only, no account).</p><div>Optional PIN <input id="pin" type="password" inputmode="numeric" style="width:90px"> <button id="sv" class="b">Save snapshot</button></div>
 <p class="muted">Saving is optional. With a PIN the snapshot is AES-GCM encrypted (PBKDF2) on this device. For full patient records, video & PDF/Excel reports use <a href="patients.html" style="color:#9cf">Patient tools</a>.</p>
 <table>${all.map((s,i)=>`<tr><td>${new Date(s.at).toLocaleString()}</td><td>${s.region}</td><td>${s.enc?'🔒':''}</td><td><button data-i="${i}" class="op">Open</button></td></tr>`).join('')}</table><pre id="so" style="white-space:pre-wrap;font-size:11px"></pre>`;
 $('#sv').onclick=async()=>{ await saveSession($('#pin').value); sessTab(B); }; B.querySelectorAll('.op').forEach(b=>b.onclick=async()=>{ try{ $('#so').textContent=JSON.stringify(await openRec(all[+b.dataset.i],$('#pin').value),null,1).slice(0,3000); }catch(e){ $('#so').textContent='Wrong PIN'; } }); }
$('#saveB').onclick=()=>{ S.tab='sess'; tabs(); renderTab(true); if(innerWidth<760) document.querySelector('#mtabs [data-p=pana]').click(); };
window.__saveSession=saveSession; window.__openRec=openRec;
