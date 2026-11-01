// ===== Pose + exercise engine (rep counting, scoring, compensations) =====
import {FilesetResolver,PoseLandmarker} from "./vendor/vision_bundle.mjs";
const R2D=180/Math.PI;
let vidLM=null,vts=0;export let poseState="loading";
export async function initPose(){if(vidLM)return true;
 const fs=await FilesetResolver.forVisionTasks(new URL("./vendor/wasm",location.href).href.replace(/\/$/,""));
 for(const del of ["GPU","CPU"]){try{vidLM=await PoseLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL("./vendor/pose_landmarker_lite.task",location.href).href,delegate:del},runningMode:"VIDEO",numPoses:1,minPoseDetectionConfidence:.4,minPosePresenceConfidence:.4,minTrackingConfidence:.4});poseState=del;window.__poseReady=del;return true}catch(e){console.warn("delegate",del,e)}}
 poseState="failed";window.__poseReady="failed";return false}
export function detect(el,w,h){if(!vidLM)return null;vts=Math.max(vts+1,performance.now());try{const r=vidLM.detectForVideo(el,vts);const l=r&&r.landmarks&&r.landmarks[0];if(!l)return null;return l.map(p=>({x:p.x*w,y:p.y*h,v:p.visibility==null?1:p.visibility}))}catch(e){return null}}
// geometry
export const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function ang3(a,b,c){const v1=Math.atan2(a.y-b.y,a.x-b.x),v2=Math.atan2(c.y-b.y,c.x-b.x);let d=Math.abs(v1-v2)*R2D;return d>180?360-d:d}
const angV=(u,v)=>{const d=(u.x*v.x+u.y*v.y)/((Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y))||1);return Math.acos(Math.max(-1,Math.min(1,d)))*R2D};
const SIDE={L:{e:7,s:11,el:13,w:15,h:23,k:25,a:27,heel:29,t:31},R:{e:8,s:12,el:14,w:16,h:24,k:26,a:28,heel:30,t:32}};
// metrics: f(P,side) -> degrees; idx = landmarks needed (for visibility side choice)
export const METRICS={
 knee:{label:"Knee flexion angle (hip-knee-ankle)",idx:["h","k","a"],f:(P,S)=>ang3(P[S.h],P[S.k],P[S.a])},
 hip:{label:"Hip angle (shoulder-hip-knee)",idx:["s","h","k"],f:(P,S)=>ang3(P[S.s],P[S.h],P[S.k])},
 hipFlex:{label:"Hip flexion, leg raise (180 − shoulder-hip-ankle)",idx:["s","h","a"],f:(P,S)=>180-ang3(P[S.s],P[S.h],P[S.a])},
 hipAbd:{label:"Hip abduction (trunk line vs leg)",idx:["h","a"],f:(P,S)=>{const t={x:mid(P[23],P[24]).x-mid(P[11],P[12]).x,y:mid(P[23],P[24]).y-mid(P[11],P[12]).y};return angV(t,{x:P[S.a].x-P[S.h].x,y:P[S.a].y-P[S.h].y})}},
 shoulder:{label:"Shoulder elevation (hip-shoulder-elbow)",idx:["h","s","el"],f:(P,S)=>ang3(P[S.h],P[S.s],P[S.el])},
 elbow:{label:"Elbow angle (shoulder-elbow-wrist)",idx:["s","el","w"],f:(P,S)=>ang3(P[S.s],P[S.el],P[S.w])},
 heel:{label:"Heel raise (heel-toe line vs floor)",idx:["heel","t"],f:(P,S)=>Math.atan2(P[S.t].y-P[S.heel].y,Math.abs(P[S.t].x-P[S.heel].x)+1e-6)*R2D},
 kneeMin:{label:"Front knee angle (smaller of both knees)",idx:["k"],both:true,f:P=>Math.min(ang3(P[23],P[25],P[27]),ang3(P[24],P[26],P[28]))},
};
export const COMP_LABEL={trunk:"Trunk lean",hipHike:"Hip hike",shrug:"Shoulder shrug",valgus:"Knee valgus (knee caving in)",lumbar:"Lumbar extension / back arching",fast:"Moving too fast",incomplete:"Incomplete range"};
export const LIB=[
 {key:"squat",name:"Squat",metric:"knee",start:170,end:95,tempo:3,view:"side or front",trunkMax:45,comps:["trunk","valgus","fast","incomplete"],steps:["Feet shoulder-width apart","Sit back, chest up","Knees over toes, not inwards","Stand fully upright"],reps:10,sets:3,rest:60},
 {key:"sts",name:"Sit-to-stand",metric:"knee",start:95,end:165,tempo:3,view:"side",trunkMax:50,comps:["trunk","valgus","fast","incomplete"],steps:["Sit at front of a firm chair","Feet back, lean forward","Stand up fully without hands","Sit down slowly"],reps:10,sets:2,rest:60},
 {key:"shflex",name:"Shoulder flexion",metric:"shoulder",start:25,end:150,tempo:4,view:"side",trunkMax:12,comps:["trunk","lumbar","shrug","fast","incomplete"],steps:["Stand tall, thumb up","Raise arm forwards and up","Do not arch your back","Lower slowly"],reps:10,sets:2,rest:45},
 {key:"shabd",name:"Shoulder abduction",metric:"shoulder",start:25,end:150,tempo:4,view:"front",trunkMax:10,comps:["trunk","shrug","fast","incomplete"],steps:["Stand facing the camera","Raise arm out to the side","Keep shoulder down, no shrug","Lower slowly"],reps:10,sets:2,rest:45},
 {key:"elflex",name:"Elbow flexion",metric:"elbow",start:155,end:55,tempo:3,view:"side",trunkMax:12,comps:["trunk","shrug","fast","incomplete"],steps:["Elbow by your side","Bend elbow fully","Straighten fully","Keep upper arm still"],reps:12,sets:2,rest:45},
 {key:"knext",name:"Seated knee extension",metric:"knee",start:95,end:165,tempo:4,view:"side",trunkMax:25,comps:["trunk","fast","incomplete"],steps:["Sit tall on a chair","Straighten knee fully","Hold 2 seconds","Lower slowly"],reps:10,sets:2,rest:45},
 {key:"slr",name:"Straight leg raise",metric:"hipFlex",start:5,end:40,tempo:4,view:"side (lying)",trunkMax:0,comps:["fast","incomplete"],steps:["Lie on back, other knee bent","Tighten thigh, knee straight","Lift leg to the other knee height","Lower slowly"],reps:10,sets:2,rest:45},
 {key:"hipabd",name:"Standing hip abduction",metric:"hipAbd",start:4,end:25,tempo:3,view:"front",trunkMax:10,comps:["trunk","hipHike","fast","incomplete"],steps:["Stand tall, hold a support","Lift leg out to the side","Toes forward, trunk upright","Lower slowly"],reps:10,sets:2,rest:45},
 {key:"heel",name:"Heel raise",metric:"heel",start:5,end:22,tempo:3,view:"side",trunkMax:12,comps:["trunk","fast","incomplete"],steps:["Stand holding a support","Rise up onto your toes","Hold 1 second","Lower slowly"],reps:15,sets:2,rest:45},
 {key:"lunge",name:"Lunge",metric:"kneeMin",start:165,end:100,tempo:3,view:"side",trunkMax:20,comps:["trunk","valgus","fast","incomplete"],steps:["Step forward","Lower back knee towards floor","Front knee over ankle","Push back up"],reps:8,sets:2,rest:60},
 {key:"bridge",name:"Bridge",metric:"hip",start:125,end:165,tempo:3,view:"side (lying)",trunkMax:0,comps:["lumbar","fast","incomplete"],steps:["Lie on back, knees bent","Squeeze buttocks","Lift hips in line with knees","Do not over-arch, lower slowly"],reps:10,sets:2,rest:45},
 {key:"minisq",name:"Mini-squat",metric:"knee",start:170,end:135,tempo:3,view:"side or front",trunkMax:30,comps:["trunk","valgus","fast","incomplete"],steps:["Hold a support","Bend knees slightly","Knees over toes","Stand up straight"],reps:12,sets:2,rest:45},
];
export function pickSide(P,metric,pref){if(pref==="L"||pref==="R")return pref;const m=METRICS[metric];if(m.both)return "R";
 const sc=s=>m.idx.reduce((a,k)=>a+P[SIDE[s][k]].v,0);return sc("R")>=sc("L")?"R":"L"}
export function measure(P,metric,side){const m=METRICS[metric];const s=pickSide(P,metric,side);const S=SIDE[s];
 const vis=m.both?Math.min(P[25].v,P[26].v,P[23].v,P[24].v):Math.min(...m.idx.map(k=>P[S[k]].v));return {v:m.f(P,S),side:s,vis}}
// view: frontal if shoulder width is a good fraction of torso length
export function isFrontal(P){const sw=dist(P[11],P[12]),tl=dist(mid(P[11],P[12]),mid(P[23],P[24]));return sw/(tl||1)>0.55}
export function baseline(P){return {es:(dist(P[7],P[11])+dist(P[8],P[12]))/2/(dist(P[11],P[12])||1),pel:Math.atan2(P[24].y-P[23].y,P[24].x-P[23].x)*R2D}}
export function compFrame(P,ex,base){const out=[],fr=isFrontal(P);const sm=mid(P[11],P[12]),hm=mid(P[23],P[24]);
 const ta=Math.abs(Math.atan2(sm.x-hm.x,hm.y-sm.y))*R2D; // trunk from vertical
 const w=ex.comps||[];
 if(w.includes("trunk")&&ex.trunkMax>0&&ta>ex.trunkMax)out.push("trunk");
 if(fr&&base){
  if(w.includes("shrug")){const es=(dist(P[7],P[11])+dist(P[8],P[12]))/2/(dist(P[11],P[12])||1);if(es<base.es*0.8)out.push("shrug")}
  if(w.includes("hipHike")){let p=Math.atan2(P[24].y-P[23].y,P[24].x-P[23].x)*R2D;let d=Math.abs(p-base.pel);if(d>180)d=360-d;if(d>6)out.push("hipHike")}
 }
 if(fr&&w.includes("valgus")){const mx=hm.x;for(const s of ["L","R"]){const S=SIDE[s],h=P[S.h],k=P[S.k],a=P[S.a];const L=dist(h,a)||1;const t=(k.y-h.y)/((a.y-h.y)||1);const lx=h.x+(a.x-h.x)*t;
   const inward=(k.x-lx)*Math.sign(mx-h.x||1);if(ang3(h,k,a)<160&&inward/L>0.12){out.push("valgus");break}}}
 if(w.includes("lumbar")){if(ex.metric==="hip"){ // bridge: hips pushed above shoulder-knee line
   for(const s of ["L","R"]){const S=SIDE[s];if(P[S.h].v<.4)continue;const a=P[S.s],b=P[S.k],h=P[S.h];const lineY=a.y+(b.y-a.y)*((h.x-a.x)/((b.x-a.x)||1));if((lineY-h.y)/(dist(a,b)||1)>0.12){out.push("lumbar");break}}}
  else{const em=mid(P[7],P[8]);const f=Math.sign(P[0].x-em.x)||1;if((sm.x-hm.x)*f<0&&ta>8)out.push("lumbar")}}
 return out}
// hysteresis state machine on normalised progress p=(v-start)/(end-start)
export class RepCounter{
 constructor(start,end,o={}){this.s=start;this.e=end;this.enter=o.enter??.3;this.exit=o.exit??.15;this.full=o.full??.85;this.alpha=o.alpha??.5;this.reset()}
 reset(){this.state="rest";this.sm=null;this.cur=null;this.reps=[];this.partials=0}
 p(v){return (v-this.s)/((this.e-this.s)||1)}
 update(v,t){this.sm=this.sm==null?v:this.sm+this.alpha*(v-this.sm);const p=this.p(this.sm);let ev=null;
  if(this.state==="rest"){if(p>this.enter){this.state="move";this.cur={t0:t,samples:[],peakP:p,peak:this.sm,low:this.sm,comps:new Set(),topSaid:false}}}
  if(this.state==="move"){const c=this.cur;c.samples.push({t,v:this.sm});if(p>c.peakP){c.peakP=p;c.peak=this.sm}
   if(Math.abs(this.sm-this.s)<Math.abs(c.low-this.s))c.low=this.sm;
   if(!c.topSaid&&p>=this.full){c.topSaid=true;ev={type:"top"}}
   if(p<this.exit){this.state="rest";c.t1=t;c.dur=(t-c.t0)/1000;c.complete=c.peakP>=this.full;if(c.complete)this.reps.push(c);else this.partials++;ev={type:"rep",rep:c};this.cur=null}
   else if(t-c.t0>30000){this.state="rest";this.cur=null}}
  return {p,ev}}
}
function resample(arr,n){if(!arr.length)return new Array(n).fill(0);const out=[];for(let i=0;i<n;i++){const x=i*(arr.length-1)/(n-1),a=Math.floor(x),b=Math.min(arr.length-1,a+1);out.push(arr[a]+(arr[b]-arr[a])*(x-a))}return out}
export function dtw(a,b){const n=a.length,m=b.length,W=Math.max(6,Math.round(n*.25));const D=Array.from({length:n+1},()=>new Float64Array(m+1).fill(Infinity));D[0][0]=0;
 for(let i=1;i<=n;i++)for(let j=Math.max(1,i-W);j<=Math.min(m,i+W);j++){const c=Math.abs(a[i-1]-b[j-1]);D[i][j]=c+Math.min(D[i-1][j],D[i][j-1],D[i-1][j-1])}return D[n][m]/(n+m)}
export function normCurve(samples,start,end){return resample(samples.map(s=>(s.v-start)/((end-start)||1)),40)}
// reference from a demo trajectory [{t(ms),v}]
export function buildReference(traj,start,end){const rc=new RepCounter(start,end);for(const s of traj)rc.update(s.v,s.t);
 if(!rc.reps.length)return null;const curves=rc.reps.map(r=>normCurve(r.samples,start,end));const avg=curves[0].map((_,i)=>curves.reduce((a,c)=>a+c[i],0)/curves.length);
 return {curve:avg,dur:rc.reps.reduce((a,r)=>a+r.dur,0)/rc.reps.length,peak:rc.reps.reduce((a,r)=>a+r.peak,0)/rc.reps.length,reps:rc.reps.length}}
export function defaultReference(ex){return {curve:resample(Array.from({length:40},(_,i)=>Math.sin(Math.PI*i/39)),40),dur:ex.tempo||3,peak:ex.end,synthetic:true}}
// per-rep score: 50% DTW shape vs reference, 30% ROM achievement, 20% tempo; −5 per compensation type
export function scoreRep(rep,ex,ref){const curve=normCurve(rep.samples,ex.start,ex.end);const d=dtw(curve,ref.curve);const shape=Math.max(0,100*(1-d/0.35));
 const target=ex.targetRom||Math.abs(ex.end-ex.start);const rom=Math.abs(rep.peak-rep.low);const romAch=Math.min(1,Math.abs(rep.peak-ex.start)/Math.abs(ex.end-ex.start));
 const r=rep.dur/(ref.dur||3);const tempo=r>=0.7&&r<=1.6?100:r<0.7?Math.max(0,100*r/0.7):Math.max(0,100-(r-1.6)*60);
 const comps=new Set(rep.comps);if(r<0.6)comps.add("fast");if(!rep.complete)comps.add("incomplete");
 const acc=Math.max(0,Math.min(100,0.5*shape+0.3*romAch*100+0.2*tempo-5*[...comps].filter(c=>c!=="incomplete"&&c!=="fast").length));
 return {acc:Math.round(acc),shape:Math.round(shape),romPct:Math.round(romAch*100),tempo:Math.round(tempo),rom:Math.round(rom),peak:Math.round(rep.peak),dur:+rep.dur.toFixed(1),comps:[...comps],target}}
export const SKEL=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32]];
