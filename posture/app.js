import {FilesetResolver,PoseLandmarker} from "./vendor/vision_bundle.mjs";
const $=id=>document.getElementById(id);
const D2R=Math.PI/180,R2D=180/Math.PI;
// ---------- config ----------
const MODES={standing:{dyn:false,views:[["ant","Anterior"],["post","Posterior"],["rlat","Right lateral"],["llat","Left lateral"]]},
 sitting:{dyn:false,views:[["ant","Anterior"],["post","Posterior"],["rlat","Right lateral"],["llat","Left lateral"]]},
 running:{dyn:true,views:[["lat","Lateral"],["post","Posterior"],["ant","Anterior"]]},
 walking:{dyn:true,views:[["lat","Lateral"],["post","Posterior"],["ant","Anterior"]]}};
const HINTS={ant:"Patient faces camera. Camera at pelvis height, 2.5–3 m away, whole body in frame.",post:"Patient faces away. Camera at pelvis height, whole body in frame.",
 rlat:"Patient's RIGHT side to camera. Camera perpendicular, at pelvis height.",llat:"Patient's LEFT side to camera. Camera perpendicular, at pelvis height.",
 lat:"Side-on, camera perpendicular to the direction of travel / treadmill."};
const DEV={frontal:["Head tilt","Shoulder height asymmetry","Pelvic obliquity","Trunk lateral shift","Knee valgus","Knee varus","Foot position asymmetry (toe-in/out)","Scoliosis suspected"],
 lateral:["Forward head posture","Rounded / protracted shoulders","Increased thoracic kyphosis","Increased lumbar lordosis","Flat back","Sway back","Anterior pelvic tilt","Posterior pelvic tilt","Knee hyperextension","Knee flexion"],
 sitfrontal:["Head tilt","Shoulder height asymmetry","Pelvic obliquity (sitting)","Trunk lateral shift"],
 sitlateral:["Forward head posture","Rounded / protracted shoulders","Slumped / flexed trunk","Increased thoracic kyphosis","Posterior pelvic tilt (sacral sitting)","Anterior pelvic tilt"],
 dynlateral:["Excessive forward trunk lean","Overstriding","Reduced knee flexion at contact","Reduced hip extension","Low cadence"],
 dynfrontal:["Contralateral pelvic drop","Dynamic knee valgus","Excessive trunk lateral lean","Low cadence"]};
const BONES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32],[7,8],[0,7],[0,8]];
const LMNAME={0:"Nose",7:"L ear",8:"R ear",11:"L shoulder",12:"R shoulder",13:"L elbow",14:"R elbow",15:"L wrist",16:"R wrist",23:"L hip",24:"R hip",25:"L knee",26:"R knee",27:"L ankle",28:"R ankle",29:"L heel",30:"R heel",31:"L toe",32:"R toe"};
const USE=Object.keys(LMNAME).map(Number);
// ---------- state ----------
const S={mode:"standing",view:"ant",session:null,src:null,W:0,H:0,lm:null,custom:{pts:[],lines:[],angles:[]},plumb:null,grid:false,showPlumb:true,skel:true,tool:"move",pend:[],
 v:{s:1,tx:0,ty:0},live:false,clip:null,fi:0,series:null,undo:[],checks:{},notes:""};
window.__S=S;
// ---------- pose model ----------
let imgLM=null,vidLM=null,vts=0;
async function initPose(){
 const fs=await FilesetResolver.forVisionTasks(new URL("./vendor/wasm",location.href).href.replace(/\/$/,""));
 const mk=async(mode,del)=>PoseLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL("./vendor/pose_landmarker_lite.task",location.href).href,delegate:del},runningMode:mode,numPoses:1,minPoseDetectionConfidence:.4,minPosePresenceConfidence:.4,minTrackingConfidence:.4});
 for(const del of ["GPU","CPU"]){try{imgLM=await mk("IMAGE",del);vidLM=await mk("VIDEO",del);msg("Pose model ready ("+del+")");window.__poseReady=del;return}catch(e){console.warn("delegate",del,e)}}
 msg("Pose model failed to load – manual marking only");window.__poseReady="failed";
}
function toPx(res,w,h){const l=res&&res.landmarks&&res.landmarks[0];if(!l)return null;return l.map(p=>({x:p.x*w,y:p.y*h,v:p.visibility==null?1:p.visibility}))}
function detectImage(c){if(!imgLM)return null;try{return toPx(imgLM.detect(c),c.width,c.height)}catch(e){console.warn(e);return null}}
function detectVideo(el,w,h){if(!vidLM)return null;vts=Math.max(vts+1,performance.now());try{return toPx(vidLM.detectForVideo(el,vts),w,h)}catch(e){return null}}
// ---------- geometry ----------
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function tilt(a,b){let t=Math.atan2(b.y-a.y,b.x-a.x)*R2D;if(t>90)t-=180;if(t<-90)t+=180;return t}
function ang3(a,b,c){const v1=Math.atan2(a.y-b.y,a.x-b.x),v2=Math.atan2(c.y-b.y,c.x-b.x);let d=Math.abs(v1-v2)*R2D;return d>180?360-d:d}
const f1=x=>(Math.round(x*10)/10).toFixed(1);
function vtype(){const lat=/lat/.test(S.view);const dyn=MODES[S.mode].dyn;return dyn?(lat?"dynlateral":"dynfrontal"):S.mode==="sitting"?(lat?"sitlateral":"sitfrontal"):(lat?"lateral":"frontal")}
function nearSide(lm){if(S.view==="rlat")return "R";if(S.view==="llat")return "L";const r=[8,12,24,26,28].reduce((s,i)=>s+lm[i].v,0),l=[7,11,23,25,27].reduce((s,i)=>s+lm[i].v,0);return r>=l?"R":"L"}
function sideIdx(s){return s==="R"?{e:8,s:12,h:24,k:26,a:28,heel:30,t:32}:{e:7,s:11,h:23,k:25,a:27,heel:29,t:31}}
function facing(lm){const em=mid(lm[7],lm[8]);let d=lm[0].x-em.x;if(Math.abs(d)<2){const t=mid(lm[31],lm[32]),h=mid(lm[29],lm[30]);d=t.x-h.x}return d>=0?1:-1}
function personRight(lm){return Math.sign(lm[12].x-lm[11].x)||1} // image x-direction of person's right
function defaultPlumb(lm){const t=vtype();if(!lm)return S.W/2;if(/lateral/.test(t)){const n=sideIdx(nearSide(lm));return t==="sitlateral"?lm[n.h].x:lm[n.a].x}return t==="sitfrontal"?mid(lm[23],lm[24]).x:mid(lm[27],lm[28]).x}
function kneeFrontal(lm,h,k,a,midX){const dev=180-ang3(lm[h],lm[k],lm[a]);const t=(lm[k].y-lm[h].y)/((lm[a].y-lm[h].y)||1);const xl=lm[h].x+(lm[a].x-lm[h].x)*t;
 const medial=Math.abs(lm[k].x-midX)<Math.abs(xl-midX);return {dev,type:medial?"valgus":"varus"}}
function M(label,val,unit,flag,note,dev){return {label,val,unit,flag:!!flag,note:note||"",dev:flag?dev:null}}
function custByLabel(n){return S.custom.pts.find(p=>(p.label||"").toUpperCase()===n)}
function measure(lm){
 if(!lm)return [];const t=vtype(),out=[];
 if(t==="frontal"||t==="sitfrontal"){
  const pr=personRight(lm),side=(i,j)=>lm[i].y<lm[j].y; // i higher
  const ht=tilt(lm[7],lm[8]);out.push(M("Head tilt",f1(Math.abs(ht)),"°",Math.abs(ht)>3,"Ear line vs horizontal; lower ear on "+(lm[8].y>lm[7].y?"R":"L")+" side","Head tilt"));
  const sh=tilt(lm[11],lm[12]),sw=dist(lm[11],lm[12]);out.push(M("Shoulder height difference",f1(Math.abs(sh)),"°",Math.abs(sh)>2,(side(12,11)?"R":"L")+" shoulder higher by "+f1(Math.abs(lm[11].y-lm[12].y)/sw*100)+"% of shoulder width","Shoulder height asymmetry"));
  const pv=tilt(lm[23],lm[24]);out.push(M("Pelvic obliquity (hip level)",f1(Math.abs(pv)),"°",Math.abs(pv)>2,(side(24,23)?"R":"L")+" side higher (hip joint centres as proxy for iliac crests)",t==="sitfrontal"?"Pelvic obliquity (sitting)":"Pelvic obliquity"));
  const smid=mid(lm[11],lm[12]),base=t==="sitfrontal"?mid(lm[23],lm[24]):mid(lm[27],lm[28]);const sx=(smid.x-base.x)/sw*100;
  out.push(M("Trunk lateral shift",f1(Math.abs(sx)),"% sh.w",Math.abs(sx)>10,"Shoulder midpoint shifted toward "+(Math.sign(sx)===pr?"R":"L")+" relative to "+(t==="sitfrontal"?"pelvis":"feet"),"Trunk lateral shift"));
  const ux=defaultPlumbX();
  if(t==="frontal"){const mx=mid(lm[23],lm[24]).x;
   for(const [nm,h,k,a] of [["R",24,26,28],["L",23,25,27]]){const r=kneeFrontal(lm,h,k,a,mx);out.push(M(nm+" knee frontal angle",f1(r.dev),"° "+(r.dev>1?r.type:""),r.dev>5,"Hip–knee–ankle deviation from straight",r.type==="valgus"?"Knee valgus":"Knee varus"))}
   const hw=dist(lm[23],lm[24]);out.push(M("Stance width (ankles / hip width)",f1(dist(lm[27],lm[28])/hw),"×",false,"Base of support"));
   const fa=(heel,toe)=>{const lat=Math.sign(lm[heel].x-mx);return Math.atan2((lm[toe].x-lm[heel].x)*lat,Math.abs(lm[toe].y-lm[heel].y)+1e-3)*R2D};
   const fr=fa(30,32),fl=fa(29,31);out.push(M("Foot turn-out R / L",f1(fr)+" / "+f1(fl),"°",Math.abs(fr-fl)>15,"Low reliability in 2D; + = toe-out","Foot position asymmetry (toe-in/out)"))}
 } else if(t==="lateral"||t==="sitlateral"){
  const n=sideIdx(nearSide(lm)),d=facing(lm),P=i=>lm[i],px=S.plumb??defaultPlumb(lm);
  const H=t==="lateral"?(P(n.a).y-P(n.e).y):(P(n.h).y-P(n.e).y);const off=i=>(P(i).x-px)*d/H*100;
  out.push(M("Side analysed",nearSide(lm)==="R"?"Right":"Left","",false,"Facing image "+(d>0?"right":"left")));
  const es=(P(n.e).x-P(n.s).x)*d/H*100;out.push(M("Ear anterior to shoulder",f1(es),"% ht",es>3,"Forward head indicator","Forward head posture"));
  const cva=Math.atan2(P(n.s).y-P(n.e).y,(P(n.e).x-P(n.s).x)*d)*R2D;out.push(M("Craniovertebral angle (proxy)",f1(cva),"°",cva<50,"Ear–shoulder line vs horizontal (shoulder used as C7 proxy); lower = more forward head","Forward head posture"));
  out.push(M("Ear offset from plumb line",f1(off(n.e)),"% ht",false,"+ anterior / − posterior"));
  const so=off(n.s);out.push(M("Shoulder offset from plumb line",f1(so),"% ht",t==="lateral"?so>4:so>6,"Acromion should lie near the plumb line; anterior suggests protraction","Rounded / protracted shoulders"));
  const esh=ang3(P(n.e),P(n.s),P(n.h));out.push(M("Ear–shoulder–hip angle",f1(esh),"°",esh<165,"Lower = more flexed upper trunk (kyphosis / forward head indication)","Increased thoracic kyphosis"));
  const ti=Math.atan2((P(n.s).x-P(n.h).x)*d,P(n.h).y-P(n.s).y)*R2D;
  if(t==="lateral"){
   const ho=off(n.h);out.push(M("Hip (greater trochanter) offset from plumb",f1(ho),"% ht",ho>4&&ti<0,"Hip anterior with trunk behind = sway-back pattern","Sway back"));
   out.push(M("Trunk inclination",f1(ti),"°",Math.abs(ti)>6,"Shoulder vs hip from vertical (+ forward)",ti>0?"Increased thoracic kyphosis":"Sway back"));
   const kd=180-ang3(P(n.h),P(n.k),P(n.a));const tt=(P(n.k).y-P(n.h).y)/((P(n.a).y-P(n.h).y)||1),xl=P(n.h).x+(P(n.a).x-P(n.h).x)*tt;const post=(P(n.k).x-xl)*d<0;
   out.push(M("Knee sagittal angle",f1(kd),"° "+(kd>1?(post?"hyperextension":"flexion"):""),kd>5,"Hip–knee–ankle deviation from straight",post?"Knee hyperextension":"Knee flexion"));
   out.push(M("Knee offset from plumb line",f1(off(n.k)),"% ht",false,"Plumb line ideally slightly anterior to knee axis"));
  } else {
   out.push(M("Trunk inclination (sitting)",f1(ti),"°",Math.abs(ti)>10,"Shoulder vs hip from vertical (+ forward / − reclined)","Slumped / flexed trunk"));
   out.push(M("Hip angle (trunk–thigh)",f1(ang3(P(n.s),P(n.h),P(n.k))),"°",false,"Shoulder–hip–knee"));
   out.push(M("Knee angle",f1(ang3(P(n.h),P(n.k),P(n.a))),"°",false,"Hip–knee–ankle"));
  }
  const as=custByLabel("ASIS"),ps=custByLabel("PSIS");
  if(as&&ps){const pt=Math.atan2(as.y-ps.y,Math.abs(as.x-ps.x))*R2D;out.push(M("Pelvic tilt (ASIS–PSIS, manual)",f1(pt),"° "+(pt>=0?"anterior":"posterior"),pt>15||pt<0,"Normal ~7–15° anterior",pt>15?"Anterior pelvic tilt":"Posterior pelvic tilt"))}
  else out.push(M("Pelvic tilt / lumbar lordosis","—","",false,"Not measurable from pose landmarks: add points labelled ASIS and PSIS (Point tool) or use the Angle tool"));
 } else {const f=frameMetrics(lm);for(const k in f)out.push(M(SER[k][0],f1(f[k]),SER[k][1],false,"This frame"))}
 return out;
}
function defaultPlumbX(){return S.plumb}
// ---------- dynamic ----------
const SER={trunk:["Trunk forward lean","°"],kneeF:["Knee flexion (near leg)","°"],hipExt:["Hip extension (near leg)","°"],over:["Ankle ahead of hip","% leg"],
 pdrop:["Pelvic tilt (frontal)","°"],tlat:["Trunk lateral lean","°"],valR:["R knee valgus","°"],valL:["L knee valgus","°"]};
function frameMetrics(lm){if(!lm)return null;const lat=/lat/.test(S.view);
 if(lat){const n=sideIdx(nearSide(lm)),d=facing(lm),P=i=>lm[i],leg=dist(P(n.h),P(n.k))+dist(P(n.k),P(n.a));
  return {trunk:Math.atan2((P(n.s).x-P(n.h).x)*d,P(n.h).y-P(n.s).y)*R2D,kneeF:180-ang3(P(n.h),P(n.k),P(n.a)),hipExt:-Math.atan2((P(n.k).x-P(n.h).x)*d,P(n.k).y-P(n.h).y)*R2D,over:(P(n.a).x-P(n.h).x)*d/leg*100}}
 const mx=mid(lm[23],lm[24]).x,v=(h,k,a)=>{const r=kneeFrontal(lm,h,k,a,mx);return r.type==="valgus"?r.dev:-r.dev};
 const sm=mid(lm[11],lm[12]),hm=mid(lm[23],lm[24]);
 return {pdrop:tilt(lm[23],lm[24]),tlat:Math.atan2(sm.x-hm.x,hm.y-sm.y)*R2D*personRight(lm),valR:v(24,26,28),valL:v(23,25,27)}}
function peaks(a,minGap){const p=[];for(let i=1;i<a.length-1;i++){if(a[i]==null)continue;if(a[i]>=(a[i-1]??-1e9)&&a[i]>(a[i+1]??-1e9)){if(p.length&&i-p[p.length-1]<minGap){if(a[i]>a[p[p.length-1]])p[p.length-1]=i}else p.push(i)}}return p}
function cadence(lms,fps){const d=lms.map(l=>l?l[27].y-l[28].y:null);let c=0,last=null,lastI=-99;const gap=Math.max(2,Math.round(fps*.18));
 d.forEach((v,i)=>{if(v==null)return;const s=Math.sign(v);if(last!=null&&s!==0&&s!==last&&i-lastI>=gap){c++;lastI=i}if(s)last=s});
 const valid=d.filter(v=>v!=null).length;if(valid<fps*1.5||c<2)return null;return c/(valid/fps)*60}
function clipSummary(){const c=S.clip;if(!c||!c.lm)return [];const lat=/lat/.test(S.view),run=S.mode==="running",fps=c.fps;
 const ser={};c.lm.forEach((l,i)=>{const m=frameMetrics(l);for(const k in m){(ser[k]=ser[k]||new Array(c.lm.length).fill(null))[i]=m[k]}});S.series=ser;
 const vals=k=>(ser[k]||[]).filter(v=>v!=null),mean=a=>a.reduce((s,x)=>s+x,0)/(a.length||1),max=a=>Math.max(...a),out=[];
 const det=c.lm.filter(Boolean).length;out.push(M("Frames with pose detected",det+" / "+c.lm.length,"",det<c.lm.length*.6,"Low detection reduces reliability"));
 if(!det)return out;
 if(lat){const tr=vals("trunk");out.push(M("Mean forward trunk lean",f1(mean(tr)),"°",run?mean(tr)>15:mean(tr)>8,run?"Running typical ~5–15°":"Walking typical <~8°","Excessive forward trunk lean"));
  const ov=ser.over,pk=peaks(ov.map(v=>v==null?null:v),Math.round(fps*.25));
  if(pk.length){const ovc=mean(pk.map(i=>ov[i])),kf=mean(pk.map(i=>ser.kneeF[i]));
   out.push(M("Ankle ahead of hip at contact (est.)",f1(ovc),"% leg",run?ovc>15:ovc>30,"Overstride indicator; contacts = frames of max forward foot ("+pk.length+")","Overstriding"));
   out.push(M("Knee flexion at contact (est.)",f1(kf),"°",run?kf<15:kf<0,run?"Running typical ~15–25°":"Walking: ~0–10° at heel strike","Reduced knee flexion at contact"))}
  const he=vals("hipExt");out.push(M("Peak hip extension",f1(max(he)),"°",run?max(he)<10:max(he)<10,"Thigh behind vertical at toe-off; typical ≥10–20°","Reduced hip extension"));
  out.push(M("Peak knee flexion",f1(max(vals("kneeF"))),"°",false,"Swing phase"));
 } else {const pd=vals("pdrop").map(Math.abs);out.push(M("Peak pelvic drop (frontal tilt)",f1(max(pd)),"°",max(pd)>(run?7:5),"Contralateral pelvic drop indicator","Contralateral pelvic drop"));
  const vr=max(vals("valR")),vl=max(vals("valL"));out.push(M("Peak dynamic knee valgus R / L",f1(vr)+" / "+f1(vl),"°",Math.max(vr,vl)>10,"Frontal-plane projection angle","Dynamic knee valgus"));
  const tl=vals("tlat").map(Math.abs);out.push(M("Peak trunk lateral lean",f1(max(tl)),"°",max(tl)>(run?6:8),"","Excessive trunk lateral lean"))}
 const cad=cadence(c.lm,fps);out.push(M("Cadence (est.)",cad?Math.round(cad):"—","steps/min",cad!=null&&(run?cad<160:cad<90),cad?"From ankle crossing count over "+f1(c.lm.length/fps)+" s":"Clip too short / feet not tracked (need ≥2 steps)","Low cadence"));
 return out}
// ---------- canvas / view ----------
const cv=$("stage"),ctx=cv.getContext("2d"),video=$("video");let dpr=1;
function resize(){dpr=window.devicePixelRatio||1;cv.width=cv.clientWidth*dpr;cv.height=cv.clientHeight*dpr;fit();draw()}
function fit(){if(!S.W)return;const cw=cv.clientWidth,ch=cv.clientHeight,s=Math.min(cw/S.W,ch/S.H);S.v={s,tx:(cw-S.W*s)/2,ty:(ch-S.H*s)/2}}
window.addEventListener("resize",resize);
function msg(t){$("stageMsg").textContent=t}
function setSource(canvas,lm){S.src=canvas;S.W=canvas.width;S.H=canvas.height;S.lm=lm;fit();if(S.plumb==null||!S.keepPlumb)S.plumb=defaultPlumb(lm);update()}
function update(){draw();renderFindings()}
function draw(lmOverride){const c=ctx;c.setTransform(1,0,0,1,0,0);c.fillStyle="#0a0a0a";c.fillRect(0,0,cv.width,cv.height);
 const src=S.live?video:S.src;if(!src)return;const v=S.v,s=v.s;c.setTransform(dpr*s,0,0,dpr*s,dpr*v.tx,dpr*v.ty);c.drawImage(src,0,0,S.W,S.H);
 const lw=1/s,lm=lmOverride||S.lm;
 if(S.grid){c.strokeStyle="rgba(0,255,255,.35)";c.lineWidth=lw;const st=S.H/20;for(let x=(S.plumb||0)%st;x<S.W;x+=st){c.beginPath();c.moveTo(x,0);c.lineTo(x,S.H);c.stroke()}for(let y=0;y<S.H;y+=st){c.beginPath();c.moveTo(0,y);c.lineTo(S.W,y);c.stroke()}}
 if(S.showPlumb&&S.plumb!=null&&!S.live){c.strokeStyle="#ff2d55";c.lineWidth=2.5*lw;c.setLineDash([10*lw,6*lw]);c.beginPath();c.moveTo(S.plumb,0);c.lineTo(S.plumb,S.H);c.stroke();c.setLineDash([]);
  c.fillStyle="#ff2d55";c.beginPath();c.arc(S.plumb,14*lw,9*lw,0,7);c.fill();c.font=(12*lw)+"px system-ui";c.fillText("plumb",S.plumb+12*lw,18*lw)}
 if(lm&&S.skel){c.lineCap="round";c.lineWidth=3*lw;
  for(const [a,b] of BONES){if(lm[a].v<.2||lm[b].v<.2)continue;c.strokeStyle=(a%2&&b%2)?"#0a84ff":(!(a%2)&&!(b%2))?"#ffd400":"#fff";c.beginPath();c.moveTo(lm[a].x,lm[a].y);c.lineTo(lm[b].x,lm[b].y);c.stroke()}
  // reference lines frontal
  const t=vtype();if(!S.live&&/frontal/.test(t)){c.strokeStyle="rgba(48,209,88,.9)";c.lineWidth=2*lw;for(const [a,b] of [[7,8],[11,12],[23,24]]){const dx=lm[b].x-lm[a].x,dy=lm[b].y-lm[a].y;c.beginPath();c.moveTo(lm[a].x-dx*.3,lm[a].y-dy*.3);c.lineTo(lm[b].x+dx*.3,lm[b].y+dy*.3);c.stroke()}}
  for(const i of USE){const p=lm[i];c.beginPath();c.arc(p.x,p.y,(S.live?4:6)*lw,0,7);c.fillStyle=i%2?"#0a84ff":i===0?"#fff":"#ffd400";c.globalAlpha=p.v<.5?.5:1;c.fill();c.globalAlpha=1;c.strokeStyle="#000";c.lineWidth=1.5*lw;c.stroke()}}
 drawCustom(c,lw);
 if(S.mag){const m=S.mag,R=70,z=3;c.setTransform(dpr,0,0,dpr,0,0);const sx=m.x*s+v.tx,lx=sx<cv.clientWidth/2?cv.clientWidth-R-10:R+10,ly=R+10;
  c.save();c.beginPath();c.arc(lx,ly,R,0,7);c.clip();c.fillStyle="#000";c.fill();const k=s*z;c.setTransform(dpr*k,0,0,dpr*k,dpr*(lx-m.x*k),dpr*(ly-m.y*k));c.drawImage(src,0,0,S.W,S.H);
  if(lm&&S.skel){for(const i of USE){const p=lm[i];c.beginPath();c.arc(p.x,p.y,3/k,0,7);c.fillStyle="#ffd400";c.fill()}}drawCustom(c,1/k);
  c.setTransform(dpr,0,0,dpr,0,0);c.strokeStyle="#ff3b30";c.lineWidth=1;c.beginPath();c.moveTo(lx-R,ly);c.lineTo(lx+R,ly);c.moveTo(lx,ly-R);c.lineTo(lx,ly+R);c.stroke();c.restore();
  c.setTransform(dpr,0,0,dpr,0,0);c.beginPath();c.arc(lx,ly,R,0,7);c.strokeStyle="#fff";c.lineWidth=3;c.stroke()}
}
function drawCustom(c,lw){const C=S.custom,P=C.pts;c.lineWidth=2.5*lw;c.strokeStyle="#bf5af2";c.fillStyle="#bf5af2";c.font="bold "+(13*lw)+"px system-ui";
 for(const [a,b] of C.lines){const p=P[a],q=P[b];c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();const t=Math.abs(tilt(p,q));c.fillText(f1(t)+"° to horiz",(p.x+q.x)/2+6*lw,(p.y+q.y)/2)}
 for(const [a,b,d] of C.angles){const p=P[a],q=P[b],r=P[d];c.strokeStyle="#64d2ff";c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.lineTo(r.x,r.y);c.stroke();c.fillStyle="#64d2ff";c.fillText(f1(ang3(p,q,r))+"°",q.x+8*lw,q.y-8*lw);c.fillStyle="#bf5af2";c.strokeStyle="#bf5af2"}
 for(const p of P){c.beginPath();c.arc(p.x,p.y,6*lw,0,7);c.fill();if(p.label)c.fillText(p.label,p.x+8*lw,p.y-6*lw)}
 for(const p of S.pend){c.beginPath();c.arc(p.x,p.y,5*lw,0,7);c.fillStyle="#fff";c.fill()}}
// ---------- pointer: pan / pinch / drag ----------
const ptrs=new Map();let G=null;
const toImg=(x,y)=>({x:(x-S.v.tx)/S.v.s,y:(y-S.v.ty)/S.v.s});
function local(e){const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}}
function hit(p){const th=22/S.v.s;let best=null,bd=th;
 S.custom.pts.forEach((q,i)=>{const d=dist(q,p);if(d<bd){bd=d;best={k:"c",i}}});
 if(S.lm&&S.skel)for(const i of USE){const d=dist(S.lm[i],p);if(d<bd){bd=d;best={k:"l",i}}}
 if(!best&&S.showPlumb&&S.plumb!=null&&Math.abs(p.x-S.plumb)<14/S.v.s)best={k:"p"};return best}
function pushUndo(){S.undo.push(JSON.stringify({lm:S.lm,custom:S.custom,plumb:S.plumb}));if(S.undo.length>40)S.undo.shift()}
cv.addEventListener("pointerdown",e=>{if(!S.src||S.live)return;e.preventDefault();cv.setPointerCapture(e.pointerId);const l=local(e);ptrs.set(e.pointerId,l);
 if(ptrs.size===2){const [a,b]=[...ptrs.values()];G={type:"pinch",d0:dist(a,b),m0:mid(a,b),s0:S.v.s,t0:{x:S.v.tx,y:S.v.ty}};S.mag=null;return}
 const ip=toImg(l.x,l.y),h=S.tool==="move"||S.tool==="point"?hit(ip):null;
 if(h){pushUndo();G={type:"drag",h};S.mag=ip}else G={type:"pan",start:l,t0:{x:S.v.tx,y:S.v.ty},moved:false};draw()});
cv.addEventListener("pointermove",e=>{if(!ptrs.has(e.pointerId)||!G)return;e.preventDefault();const l=local(e);ptrs.set(e.pointerId,l);
 if(G.type==="pinch"&&ptrs.size>=2){const [a,b]=[...ptrs.values()],m=mid(a,b),s=Math.min(12,Math.max(.2,G.s0*dist(a,b)/G.d0));const ip={x:(G.m0.x-G.t0.x)/G.s0,y:(G.m0.y-G.t0.y)/G.s0};S.v={s,tx:m.x-ip.x*s,ty:m.y-ip.y*s};draw();return}
 if(G.type==="drag"){const ip=toImg(l.x,l.y);ip.x=Math.max(0,Math.min(S.W,ip.x));ip.y=Math.max(0,Math.min(S.H,ip.y));
  if(G.h.k==="c")Object.assign(S.custom.pts[G.h.i],ip);else if(G.h.k==="l"){S.lm[G.h.i].x=ip.x;S.lm[G.h.i].y=ip.y;S.lm[G.h.i].v=1;if(S.clip&&S.clip.lm)S.clip.lm[S.fi]=S.lm}else S.plumb=ip.x;
  S.mag=ip;draw();return}
 if(G.type==="pan"){const dx=l.x-G.start.x,dy=l.y-G.start.y;if(Math.hypot(dx,dy)>6)G.moved=true;if(G.moved){S.v.tx=G.t0.x+dx;S.v.ty=G.t0.y+dy;draw()}}});
function endPtr(e){if(!ptrs.has(e.pointerId))return;const l=ptrs.get(e.pointerId);ptrs.delete(e.pointerId);
 if(G&&G.type==="pan"&&!G.moved&&ptrs.size===0)tap(toImg(l.x,l.y));
 if(G&&G.type==="drag"){S.mag=null;update()}
 if(ptrs.size===0)G=null;else if(G&&G.type==="pinch")G={type:"pan",start:[...ptrs.values()][0],t0:{x:S.v.tx,y:S.v.ty},moved:true};draw()}
cv.addEventListener("pointerup",endPtr);cv.addEventListener("pointercancel",endPtr);
cv.addEventListener("wheel",e=>{if(!S.src||S.live)return;e.preventDefault();const l=local(e),ip=toImg(l.x,l.y),s=Math.min(12,Math.max(.2,S.v.s*Math.exp(-e.deltaY*.0015)));S.v={s,tx:l.x-ip.x*s,ty:l.y-ip.y*s};draw()},{passive:false});
function snap(p){const th=18/S.v.s;let bi=-1,bd=th;S.custom.pts.forEach((q,i)=>{const d=dist(q,p);if(d<bd){bd=d;bi=i}});if(bi>=0)return bi;
 if(S.lm)for(const i of USE){if(dist(S.lm[i],p)<th){S.custom.pts.push({x:S.lm[i].x,y:S.lm[i].y,label:""});return S.custom.pts.length-1}}
 S.custom.pts.push({x:p.x,y:p.y,label:""});return S.custom.pts.length-1}
function tap(p){if(S.tool==="point"){pushUndo();const lb=prompt("Label for this landmark (e.g. ASIS, PSIS, C7, tragus):","")||"";S.custom.pts.push({x:p.x,y:p.y,label:lb.trim()});update()}
 else if(S.tool==="line"||S.tool==="angle"){if(!S.pend.length)pushUndo();S.pend.push(p);const need=S.tool==="line"?2:3;
  if(S.pend.length===need){const idx=S.pend.map(snap);(S.tool==="line"?S.custom.lines:S.custom.angles).push(idx);S.pend=[]}update()}}
// ---------- tools ----------
[...$("tools").querySelectorAll("[data-t]")].forEach(b=>b.onclick=()=>{S.tool=b.dataset.t;S.pend=[];$("tools").querySelectorAll("[data-t]").forEach(x=>x.classList.toggle("on",x===b));draw()});
const tog=(id,k)=>{$(id).classList.toggle("on",S[k]);$(id).onclick=()=>{S[k]=!S[k];$(id).classList.toggle("on",S[k]);if(k==="showPlumb"&&S.plumb==null)S.plumb=defaultPlumb(S.lm);draw()}};
tog("plumbBtn","showPlumb");tog("gridBtn","grid");tog("skelBtn","skel");
$("fitBtn").onclick=()=>{fit();draw()};
$("undoBtn").onclick=()=>{const u=S.undo.pop();if(!u)return;const o=JSON.parse(u);S.lm=o.lm;S.custom=o.custom;S.plumb=o.plumb;S.pend=[];update()};
$("redetBtn").onclick=()=>{if(!S.src)return;pushUndo();S.lm=detectImage(S.src);S.plumb=defaultPlumb(S.lm);msg(S.lm?"Landmarks re-detected":"No person detected – mark manually");update()};
// ---------- camera / capture ----------
let stream=null,rec=null;
function stopCam(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}S.live=false}
$("liveBtn").onclick=async()=>{if(S.live){stopCam();msg("Camera stopped");draw();return}
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false})}catch(e){msg("Camera error: "+e.name+" – use Upload");return}
 video.srcObject=stream;await video.play().catch(()=>{});await new Promise(r=>video.videoWidth?r():video.onloadedmetadata=r);
 S.live=true;S.W=video.videoWidth;S.H=video.videoHeight;S.src=null;fit();$("liveBtn").textContent="Stop camera";$("capBtn").textContent=MODES[S.mode].dyn?"Record 4 s":"Capture";msg("Live – skeleton overlay");liveLoop()};
function liveLoop(){if(!S.live)return;const lm=detectVideo(video,S.W,S.H);if(rec&&rec.frames.length<rec.max&&performance.now()-rec.last>=1000/rec.fps-2){rec.last=performance.now();rec.frames.push(grab(video,640))}
 if(rec&&rec.frames.length>=rec.max)finishRec();draw(lm);if(lm){S.liveLm=lm}requestAnimationFrame(liveLoop)}
function grab(src,maxW){const w=src.videoWidth||src.naturalWidth||src.width,h=src.videoHeight||src.naturalHeight||src.height,k=Math.min(1,(maxW||4000)/Math.max(w,h));const c=document.createElement("canvas");c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext("2d").drawImage(src,0,0,c.width,c.height);return c}
$("capBtn").onclick=()=>{if(!S.live){msg("Start the live camera first (or Upload)");return}
 if(MODES[S.mode].dyn){rec={frames:[],fps:15,max:60,last:0};$("rec").style.display="block";return}
 const c=grab(video,1600);stopCam();$("liveBtn").textContent="Live camera";S.clip=null;showClipUI(false);S.custom={pts:[],lines:[],angles:[]};S.undo=[];
 const lm=detectImage(c);msg(lm?"Captured – landmarks detected. Drag to correct, pinch to zoom.":"Captured – no person detected, mark manually");setSource(c,lm);prefill()};
function finishRec(){const r=rec;rec=null;$("rec").style.display="none";stopCam();$("liveBtn").textContent="Live camera";loadClip(r.frames,r.fps)}
$("upBtn").onclick=()=>$("file").click();
$("file").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(!f)return;stopCam();$("liveBtn").textContent="Live camera";S.custom={pts:[],lines:[],angles:[]};S.undo=[];
 if(f.type.startsWith("video")){msg("Extracting frames…");const frames=await videoFrames(URL.createObjectURL(f),15,8);loadClip(frames,15)}
 else{const im=new Image();im.src=URL.createObjectURL(f);await im.decode();loadImage(im)}};
function loadImage(im){const c=grab(im,1600);S.clip=null;showClipUI(false);const lm=detectImage(c);msg(lm?"Landmarks detected. Drag to correct, pinch to zoom.":"No person detected – mark manually");setSource(c,lm);prefill()}
window.__loadImage=loadImage;
async function videoFrames(url,fps,maxSec){const v=document.createElement("video");v.muted=true;v.playsInline=true;v.src=url;await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j});
 const dur=Math.min(v.duration||maxSec,maxSec),out=[];for(let t=0;t<dur;t+=1/fps){v.currentTime=t;await new Promise(r=>v.onseeked=r);out.push(grab(v,640))}return out}
window.__videoFrames=videoFrames;
function showClipUI(on){$("clipRow").style.display=on?"flex":"none";$("graphs").style.display=on&&S.series?"block":"none"}
function loadClip(frames,fps){if(!frames.length){msg("No frames");return}S.clip={frames,fps,lm:null};S.series=null;S.fi=0;$("scrub").max=frames.length-1;$("scrub").value=0;showClipUI(true);
 setSource(frames[0],detectImage(frames[0]));msg(frames.length+" frames – tap Analyze clip, scrub to inspect, pick a key frame");setFrame(0)}
window.__loadClip=loadClip;
function setFrame(i){const c=S.clip;if(!c)return;S.fi=i;S.src=c.frames[i];S.lm=c.lm?c.lm[i]:S.lm;$("frameLbl").textContent=(i+1)+"/"+c.frames.length+" · "+f1(i/c.fps)+"s";update();if(S.series)drawGraphs()}
$("scrub").oninput=e=>setFrame(+e.target.value);
let playT=null;$("playBtn").onclick=()=>{if(playT){clearInterval(playT);playT=null;$("playBtn").textContent="▶";return}$("playBtn").textContent="❚❚";playT=setInterval(()=>{const n=(S.fi+1)%S.clip.frames.length;$("scrub").value=n;setFrame(n)},1000/S.clip.fps)};
$("anaBtn").onclick=async()=>{const c=S.clip;if(!c)return;msg("Analysing "+c.frames.length+" frames…");await new Promise(r=>setTimeout(r,30));
 c.lm=c.frames.map(f=>{const w=f.width,h=f.height;return detectVideo(f,w,h)});clipSummary();$("graphs").style.display="block";setFrame(S.fi);prefill();msg("Clip analysed – "+c.lm.filter(Boolean).length+" frames with pose")};
window.__analyze=()=>$("anaBtn").onclick();
function drawGraphs(){const g=$("graphs"),c=g.getContext("2d"),W=g.width=g.clientWidth*dpr,H=g.height=g.clientHeight*dpr;c.fillStyle="#0a0a0a";c.fillRect(0,0,W,H);if(!S.series)return;
 const keys=Object.keys(S.series),cols=["#ffd400","#0a84ff","#30d158","#ff3b30"],n=S.clip.lm.length;let vals=keys.flatMap(k=>S.series[k].filter(v=>v!=null));if(!vals.length)return;
 let lo=Math.min(...vals,0),hi=Math.max(...vals,0);const pad=24*dpr,X=i=>pad+i/(n-1||1)*(W-2*pad),Y=v=>H-pad-(v-lo)/(hi-lo||1)*(H-2*pad);
 c.strokeStyle="#444";c.lineWidth=dpr;c.beginPath();c.moveTo(pad,Y(0));c.lineTo(W-pad,Y(0));c.stroke();c.font=(11*dpr)+"px system-ui";c.fillStyle="#888";c.fillText(f1(hi)+"°",2,pad);c.fillText(f1(lo),2,H-pad);
 keys.forEach((k,j)=>{c.strokeStyle=cols[j%4];c.lineWidth=2*dpr;c.beginPath();let st=false;S.series[k].forEach((v,i)=>{if(v==null){st=false;return}st?c.lineTo(X(i),Y(v)):c.moveTo(X(i),Y(v));st=true});c.stroke();c.fillStyle=cols[j%4];c.fillText(SER[k][0]+" ("+SER[k][1]+")",pad+j*0+4,14*dpr*(j+1))});
 c.strokeStyle="#fff";c.beginPath();c.moveTo(X(S.fi),pad/2);c.lineTo(X(S.fi),H-pad/2);c.stroke();c.fillStyle="#888";c.fillText("time →",W-60*dpr,H-4)}
// ---------- findings & notes ----------
let curMeasures=[];
function renderFindings(){const ms=measure(S.lm),dyn=MODES[S.mode].dyn&&S.clip&&S.clip.lm?clipSummary():[];curMeasures=dyn.length?[...dyn.map(m=>({...m,label:"[clip] "+m.label})),...ms.map(m=>({...m,label:"[frame] "+m.label}))]:ms;
 if(!S.lm&&!curMeasures.length){$("findings").innerHTML="<p style='color:#666'>"+(S.src?"No landmarks – use Re-detect or mark manually with the Point tool.":"Capture or upload an image to analyse.")+"</p>";}
 else{const fl=curMeasures.filter(m=>m.flag);let h=fl.length?"<p style='color:#ff9f0a;margin:4px 0'><b>"+fl.length+" possible deviation(s):</b> "+[...new Set(fl.map(m=>m.dev))].join(", ")+"</p>":"<p style='color:#30d158;margin:4px 0'>No deviations flagged by automatic screening.</p>";
  h+="<table class='m'>"+curMeasures.map(m=>"<tr class='"+(m.flag?"flag":"")+"'><td>"+m.label+"<br><small style='color:#888'>"+m.note+"</small></td><td class='v'>"+m.val+" "+m.unit+"</td></tr>").join("")+"</table>";
  const C=S.custom;if(C.angles.length||C.lines.length){h+="<table class='m'>"+C.angles.map((a,i)=>"<tr><td>Manual angle "+(i+1)+"</td><td class='v'>"+f1(ang3(C.pts[a[0]],C.pts[a[1]],C.pts[a[2]]))+"°</td></tr>").join("")+C.lines.map((l,i)=>"<tr><td>Manual line "+(i+1)+" vs horizontal</td><td class='v'>"+f1(Math.abs(tilt(C.pts[l[0]],C.pts[l[1]])))+"°</td></tr>").join("")+"</table>"}
  $("findings").innerHTML=h}
 renderChecks()}
function renderChecks(){const list=DEV[vtype()];$("checks").innerHTML=list.map((d,i)=>"<label><input type='checkbox' data-d='"+d+"' "+(S.checks[d]?"checked":"")+">"+d+(S.auto&&S.auto.includes(d)?" <small style='color:#ff9f0a'>(app)</small>":"")+"</label>").join("");
 $("checks").querySelectorAll("input").forEach(x=>x.onchange=()=>{S.checks[x.dataset.d]=x.checked})}
function prefill(){renderFindings();S.auto=[...new Set(curMeasures.filter(m=>m.flag&&m.dev).map(m=>m.dev))];S.auto.forEach(d=>{if(S.checks[d]==null)S.checks[d]=true});renderChecks()}
$("notes").oninput=e=>S.notes=e.target.value;
// ---------- IndexedDB ----------
const dbp=new Promise((res,rej)=>{const r=indexedDB.open("posture-db",1);r.onupgradeneeded=()=>r.result.createObjectStore("sessions",{keyPath:"id"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function tx(mode,fn){const db=await dbp;return new Promise((res,rej)=>{const t=db.transaction("sessions",mode),st=t.objectStore("sessions");let out;Promise.resolve(fn(st)).then(v=>out=v);t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error)})}
const reqP=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function allSessions(){return tx("readonly",st=>reqP(st.getAll()))}
async function putSession(s){return tx("readwrite",st=>{st.put(s)})}
async function delSession(id){return tx("readwrite",st=>{st.delete(id)})}
window.__db={allSessions};
// ---------- session flow ----------
$("date").value=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
function renderViews(){const vs=MODES[S.mode].views;$("views").innerHTML=vs.map(([k,n])=>"<button data-v='"+k+"' class='"+(k===S.view?"on ":"")+(S.session&&S.session.views[k]?"done":"")+"'>"+n+"</button>").join("");
 $("views").querySelectorAll("button").forEach(b=>b.onclick=()=>goView(b.dataset.v));$("viewHint").textContent=(MODES[S.mode].dyn?"Dynamic: record ~4 s or upload a video. ":"")+HINTS[S.view];
 $("sessInfo").textContent=S.session?("Session: "+(S.session.pt||"(no ID)")+" · "+S.session.date+" · "+S.session.mode+" · "+Object.keys(S.session.views).length+"/"+vs.length+" views saved"):"No active session – fill in details and tap New session (or open one below).";
 $("capBtn").textContent=MODES[S.mode].dyn?"Record 4 s":"Capture"}
$("mode").onchange=()=>{if(S.session&&S.session.mode!==$("mode").value){S.session=null}S.mode=$("mode").value;S.view=MODES[S.mode].views[0][0];resetView();renderViews()};
$("newSess").onclick=async()=>{S.mode=$("mode").value;S.session={id:Date.now(),pt:$("pt").value.trim().toUpperCase(),date:$("date").value,mode:S.mode,views:{}};await putSession(S.session);S.view=MODES[S.mode].views[0][0];resetView();renderViews();listSessions()};
function resetView(){stopCam();S.src=null;S.lm=null;S.clip=null;S.series=null;S.custom={pts:[],lines:[],angles:[]};S.plumb=null;S.checks={};S.notes="";S.auto=[];S.undo=[];$("notes").value="";showClipUI(false);$("liveBtn").textContent="Live camera";draw();renderFindings()}
async function goView(k){S.view=k;resetView();renderViews();const sv=S.session&&S.session.views[k];if(sv){const im=new Image();im.src=URL.createObjectURL(sv.img);await im.decode();const c=grab(im);
 S.custom=sv.custom;S.checks=sv.checks||{};S.notes=sv.notes||"";$("notes").value=S.notes;S.plumb=sv.plumb;S.keepPlumb=true;S.series=sv.series||null;setSource(c,sv.lm);S.keepPlumb=false;S.auto=sv.auto||[];
 if(sv.summary){curMeasures=sv.measures}renderFindings();msg("Saved view loaded – edit and Save again to update")}}
const step=d=>{const vs=MODES[S.mode].views.map(v=>v[0]),i=vs.indexOf(S.view);goView(vs[(i+d+vs.length)%vs.length])};
$("prevV").onclick=()=>step(-1);$("nextV").onclick=()=>step(1);
function annotated(maxW){const k=Math.min(1,(maxW||1000)/Math.max(S.W,S.H)),c=document.createElement("canvas");c.width=S.W*k;c.height=S.H*k;const o={cv:cv,dpr,v:S.v,mag:S.mag};
 const x=c.getContext("2d");const sv={...S.v};S.v={s:k,tx:0,ty:0};S.mag=null;const realCtx=ctx;
 // render via temporary swap
 drawTo(x,c,k);S.v=sv;S.mag=o.mag;return c}
function drawTo(x,c,k){const sCv=cv.width,sCh=cv.height;const tmp=document.createElement("canvas");
 // reuse draw() by drawing on main canvas sized to output, then copy
 const ow=cv.width,oh=cv.height,od=dpr;cv.width=c.width;cv.height=c.height;dpr=1;draw();x.drawImage(cv,0,0);cv.width=ow;cv.height=oh;dpr=od;draw()}
$("saveView").onclick=async()=>{if(!S.session){alert("Start a New session first (patient initials/ID + date).");return}if(!S.src){alert("Capture or upload an image first.");return}
 const img=await new Promise(r=>grab(S.src,1600).toBlob(r,"image/jpeg",.9));const ann=await new Promise(r=>annotated(1000).toBlob(r,"image/jpeg",.88));
 let graph=null;if(S.series){drawGraphs();graph=await new Promise(r=>$("graphs").toBlob(r,"image/png"))}
 renderFindings();S.session.views[S.view]={img,ann,graph,lm:S.lm,custom:S.custom,plumb:S.plumb,measures:curMeasures,checks:S.checks,notes:S.notes,auto:S.auto,series:S.series,summary:!!S.series,saved:new Date().toISOString()};
 await putSession(S.session);renderViews();listSessions();msg("View saved ✓")};
async function listSessions(){const ss=(await allSessions()).sort((a,b)=>b.id-a.id);if(!ss.length){$("sessList").innerHTML="<p style='color:#666'>No sessions yet.</p>";return}
 $("sessList").innerHTML="<table class='sess' style='width:100%;border-collapse:collapse'>"+ss.map(s=>"<tr><td>"+esc(s.pt||"—")+"<br><small style='color:#888'>"+s.date+" · "+s.mode+" · "+Object.keys(s.views).length+" views</small></td><td style='text-align:right;white-space:nowrap'><button data-o='"+s.id+"'>Open</button> <button data-r='"+s.id+"' class='b'>Report</button> <button data-x='"+s.id+"' class='r'>✕</button></td></tr>").join("")+"</table>";
 $("sessList").querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>openSess(+b.dataset.o));$("sessList").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>report(+b.dataset.r));
 $("sessList").querySelectorAll("[data-x]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this session and its images?")){await delSession(+b.dataset.x);if(S.session&&S.session.id===+b.dataset.x)S.session=null;renderViews();listSessions()}})}
async function openSess(id){const s=(await allSessions()).find(x=>x.id===id);if(!s)return;S.session=s;S.mode=s.mode;$("mode").value=s.mode;$("pt").value=s.pt;$("date").value=s.date;await goView(MODES[s.mode].views[0][0]);renderViews();scrollTo(0,0)}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>"&#"+c.charCodeAt(0)+";");
const VN=(m,k)=>(MODES[m].views.find(v=>v[0]===k)||[k,k])[1];
async function report(id){const s=id?(await allSessions()).find(x=>x.id===id):S.session;if(!s){alert("Open or create a session first.");return}
 let h="<h1>Postural Analysis Report</h1><p><b>Patient:</b> "+esc(s.pt||"—")+" &nbsp; <b>Date:</b> "+esc(s.date)+" &nbsp; <b>Assessment:</b> "+(MODES[s.mode].dyn?"Dynamic – ":"Static – ")+s.mode+"</p><p style='font-size:11px'>Automatic measurements are screening estimates from 2D images (pose landmarks) and depend on camera position; they were reviewed by the therapist. Not a diagnosis.</p>";
 for(const [k] of MODES[s.mode].views){const v=s.views[k];h+="<div class='view'><h2>"+VN(s.mode,k)+" view</h2>";if(!v){h+="<p><i>Not recorded.</i></p></div>";continue}
  h+="<img src='"+URL.createObjectURL(v.ann||v.img)+"'>"+(v.graph?"<img src='"+URL.createObjectURL(v.graph)+"' style='max-height:220px'>":"");
  h+="<table><tr><th>Measure</th><th>Value</th><th>Flag</th><th>Note</th></tr>"+(v.measures||[]).map(m=>"<tr><td>"+esc(m.label)+"</td><td>"+esc(m.val+" "+m.unit)+"</td><td class='fl'>"+(m.flag?"⚠ "+esc(m.dev):"")+"</td><td>"+esc(m.note)+"</td></tr>").join("")+"</table>";
  const ch=Object.keys(v.checks||{}).filter(x=>v.checks[x]);h+="<p><b>Deviations noted:</b> "+(ch.length?ch.map(esc).join(", "):"none")+"</p><p><b>Notes:</b> "+esc(v.notes||"—")+"</p></div>"}
 h+="<p style='font-size:11px'>Generated "+new Date().toLocaleString()+" · Physio Posture Analysis</p><p class='noprint'><button onclick='window.print()'>Print / Save PDF</button> <button onclick=\"document.body.classList.remove('printing')\">Close report</button></p>";
 $("report").innerHTML=h;document.body.classList.add("printing");scrollTo(0,0);await Promise.all([...$("report").querySelectorAll("img")].map(i=>i.decode().catch(()=>{})));setTimeout(()=>{try{window.print()}catch(e){}},300)}
window.addEventListener("afterprint",()=>{});
$("repBtn").onclick=()=>report();
$("csvBtn").onclick=async()=>{const ss=await allSessions();const rows=[["Session","Patient","Date","Mode","View","Measure","Value","Unit","Flagged","Deviation","Therapist deviations","Notes"]];
 ss.forEach(s=>Object.entries(s.views).forEach(([k,v])=>{const ch=Object.keys(v.checks||{}).filter(x=>v.checks[x]).join("; ");(v.measures||[]).forEach(m=>rows.push([s.id,s.pt,s.date,s.mode,VN(s.mode,k),m.label,m.val,m.unit,m.flag?"yes":"",m.dev||"",ch,v.notes||""]))}));
 if(rows.length<2){alert("No saved views yet.");return}const q=x=>'"'+String(x??"").replace(/"/g,'""')+'"';const b=new Blob(["\ufeff"+rows.map(r=>r.map(q).join(",")).join("\r\n")],{type:"text/csv"});
 const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="posture_"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),1000)};
// ---------- init ----------
resize();renderViews();renderFindings();listSessions();initPose();
