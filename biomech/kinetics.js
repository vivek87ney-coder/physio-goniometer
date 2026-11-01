// Kinematics + kinetics from 3D camera pose (BlazePose world landmarks -> y up, +z anterior, metres).
// Segment inertial parameters: de Leva (1996) adjustments of Zatsiorsky–Seluyanov (male values; Winter 2009 for definitions).
// Sagittal-plane 2D inverse dynamics. Arms: top-down from free hand (exact apart from pose error). Stance legs: bottom-up from an
// ESTIMATED ground reaction force (body mass × COM acceleration, shared by weight-bearing ratio, applied under the COM on the foot).
import * as THREE from 'three';
export const DELEVA={ // mass fraction, COM from proximal (fraction of length), sagittal radius of gyration (fraction)
 head:[0.0694,0.5002,0.303], trunk:[0.4346,0.5138,0.328], uarm:[0.0271,0.5772,0.285], farm:[0.0162,0.4574,0.276], hand:[0.0061,0.79,0.628],
 thigh:[0.1416,0.4095,0.329], shank:[0.0433,0.4459,0.255], foot:[0.0137,0.4415,0.257] };
export const TAG={cam:'camera-estimated',inst:'requires instrument'};
const G=9.81;
// muscle moment arms (m) – typical adult literature values; used for force = moment / arm
export const ARMS={ elbowF:[0.035,'Elbow flexors (biceps/brachialis)'], elbowE:[0.02,'Triceps brachii'], shF:[0.03,'Anterior deltoid'], shE:[0.03,'Latissimus / post. deltoid'],
 hipE:[0.06,'Gluteus max / hamstrings'], hipF:[0.035,'Iliopsoas / rectus femoris'], kneeE:[0.045,'Quadriceps (patellar tendon)'], kneeF:[0.03,'Hamstrings'], ankP:[0.05,'Triceps surae (Achilles)'], ankD:[0.04,'Tibialis anterior'] };
const LEVER={ elbowF:['3rd class','effort (biceps) between elbow axis and load → favours speed/ROM'], elbowE:['1st class','axis between triceps (olecranon) and load'],
 shF:['3rd class','deltoid inserts close to the axis'], shE:['3rd class',''], hipE:['3rd class','(open chain); 1st class in stance'], hipF:['3rd class',''],
 kneeE:['3rd class','patellar tendon close to axis; patella increases the moment arm'], kneeF:['3rd class',''], ankP:['2nd class (heel raise)','load between MTP axis and Achilles'], ankD:['3rd class (open chain)',''] };
const FLEX={hip:1,knee:-1,ankle:1,sh:1,elbow:1};
const cr=(a,b)=>a[0]*b[1]-a[1]*b[0];
export class Kinetics{
 constructor(){ this.h=[]; this.mass=70; this.loadKg=0; this.trail={}; this.ang={}; }
 frame(P){ const up=new THREE.Vector3(0,1,0); const r=P[24].clone().sub(P[23]); r.y=0; if(r.lengthSq()<1e-6) r.set(-1,0,0); r.normalize(); const f=up.clone().cross(r).normalize(); return f; }
 push(t,P,o={}){ if(o.mass) this.mass=o.mass; if(o.loadKg!=null) this.loadKg=o.loadKg; const f=this.frame(P); const pr=i=>[P[i].dot(f),P[i].y];
  const pts={}; for(const i of [0,11,12,13,14,15,16,19,20,23,24,25,26,27,28,29,30,31,32]) pts[i]=pr(i);
  const pv=this.h.at(-1); if(pv) for(const i in pts){ pts[i]=[pv.pts[i][0]*0.5+pts[i][0]*0.5,pv.pts[i][1]*0.5+pts[i][1]*0.5]; }
  const mid=(a,b)=>[(pts[a][0]+pts[b][0])/2,(pts[a][1]+pts[b][1])/2];
  const segs={}; const S=(k,p,d,type,c)=>{ const [mf,cf,rg]=DELEVA[type]; const pp=pts[p]||p, dd=pts[d]||d; const L=Math.hypot(dd[0]-pp[0],dd[1]-pp[1]); segs[k]={p:pp,d:dd,c:[pp[0]+(dd[0]-pp[0])*cf,pp[1]+(dd[1]-pp[1])*cf],m:mf*this.mass,I:mf*this.mass*(rg*L)**2,th:Math.atan2(dd[1]-pp[1],dd[0]-pp[0]),L}; };
  for(const [s,sh,el,wr,hi,kn,an,he,to] of [['L',11,13,15,23,25,27,29,31],['R',12,14,16,24,26,28,30,32]]){
   S('uarm'+s,sh,el,'uarm'); S('farm'+s,el,wr,'farm'); S('hand'+s,wr,s==='L'?19:20,'hand'); S('thigh'+s,hi,kn,'thigh'); S('shank'+s,kn,an,'shank'); S('foot'+s,he,to,'foot'); }
  const hipM=mid(23,24), shM=mid(11,12); S('trunk',hipM,shM,'trunk'); S('head',shM,0,'head');
  // whole-body COM
  let M=0,cx=0,cy=0; for(const k in segs){ M+=segs[k].m; cx+=segs[k].m*segs[k].c[0]; cy+=segs[k].m*segs[k].c[1]; } const com=[cx/M,cy/M];
  const fr={t,pts,segs,com}; this.h.push(fr); while(this.h.length>12) this.h.shift();
  // derivatives (central difference over ~100 ms)
  const H=this.h, n=H.length; const back=k=>{ for(let i=n-1;i>=0;i--) if(t-H[i].t>=k) return H[i]; return H[0]; };
  const h1=back(80), h2=back(160); const dt1=(t-h1.t)/1000||1, dt2=(h1.t-h2.t)/1000||1;
  const acc=(g)=>{ if(n<4||dt1<0.03||dt2<0.03) return [0,0]; const a=g(fr),b=g(h1),c=g(h2); return [((a[0]-b[0])/dt1-(b[0]-c[0])/dt2)/((dt1+dt2)/2),((a[1]-b[1])/dt1-(b[1]-c[1])/dt2)/((dt1+dt2)/2)]; };
  const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x)); const alpha=k=>{ if(n<4||dt1<0.03||dt2<0.03) return 0; const a=fr.segs[k].th,b=h1.segs[k].th,c=h2.segs[k].th; return (wrap(a-b)/dt1-wrap(b-c)/dt2)/((dt1+dt2)/2); };
  const lim=(v,m)=>Math.max(-m,Math.min(m,v));
  for(const k in segs){ const a=acc(F=>F.segs[k].c); segs[k].a=[lim(a[0],30),lim(a[1],30)]; segs[k].al=lim(alpha(k),40); }
  const aCom=acc(F=>F.com).map(v=>lim(v,15)); this.aCom=this.aCom?[this.aCom[0]*0.7+aCom[0]*0.3,this.aCom[1]*0.7+aCom[1]*0.3]:aCom;
  // GRF estimate
  const contact=o.contact||{L:true,R:true}, wb=o.wb||{L:.5,R:.5}; const grf=[this.mass*this.aCom[0],this.mass*(G+this.aCom[1])];
  const out={com, aCom:this.aCom, grf:{x:grf[0],y:grf[1],bw:grf[1]/(this.mass*G),tag:TAG.inst+' (force plates) – value shown is an estimate'}, joints:{}, mass:this.mass, f};
  const solve=(chain,Fd0,Pd0,dyn)=>{ // chain distal→proximal: [segKey,jointName]
   let Fd=Fd0, Pd=Pd0, Md=0; const res={};
   for(const [k,j] of chain){ const sg=segs[k]; const a=dyn?sg.a:[0,0], al=dyn?sg.al:0; const Fp=[sg.m*a[0]-Fd[0], sg.m*(a[1]+G)-Fd[1]];
    const rp=[sg.p[0]-sg.c[0],sg.p[1]-sg.c[1]], rd=[Pd[0]-sg.c[0],Pd[1]-sg.c[1]]; const Mp=sg.I*al-Md-cr(rp,Fp)-cr(rd,Fd);
    res[j]=Mp; Fd=[-Fp[0],-Fp[1]]; Pd=sg.p; Md=-Mp; } return res; };
  for(const s of ['L','R']){
   const load=[0,-this.loadKg*G]; const armC=[['hand'+s,'wrist'],['farm'+s,'elbow'],['uarm'+s,'sh']];
   const ad=solve(armC,load,segs['hand'+s].d,true), as=solve(armC,load,segs['hand'+s].d,false);
   let Fg=[0,0],Pg=segs['foot'+s].d; if(contact[s]){ const he=segs['foot'+s].p, to=segs['foot'+s].d; const lo=Math.min(he[0],to[0]),hi=Math.max(he[0],to[0]); const ux=com[0]; out.bos=out.bos||{}; out.bos[s]=com[0]<lo-0.03?'behind heel':com[0]>hi+0.03?'ahead of toes':'over foot'; /* static balance: COP lies under COM; if pose depth puts COM outside the foot, flag it rather than clamp (clamping zeroes the knee moment) */ Pg=[ux,Math.min(he[1],to[1])]; Fg=[grf[0]*(wb[s]||0),grf[1]*(wb[s]||0)]; }
   const legC=[['foot'+s,'ankle'],['shank'+s,'knee'],['thigh'+s,'hip']]; const ld=solve(legC,Fg,Pg,true), ls=solve(legC,Fg,Pg,false);
   for(let [j,Md,Ms] of [['elbow',ad.elbow,as.elbow],['sh',ad.sh,as.sh],['ankle',ld.ankle,ls.ankle],['knee',ld.knee,ls.knee],['hip',ld.hip,ls.hip]]){
    const sk=j+s; this.sm=this.sm||{}; Md=this.sm[sk]==null?Md:this.sm[sk]*0.6+Md*0.4; this.sm[sk]=Md; this.smS=this.smS||{}; Ms=this.smS[sk]==null?Ms:this.smS[sk]*0.6+Ms*0.4; this.smS[sk]=Ms;
    const fl=FLEX[j]*Md; const key={elbow:fl>0?'elbowF':'elbowE',sh:fl>0?'shF':'shE',hip:fl>0?'hipF':'hipE',knee:fl>0?'kneeF':'kneeE',ankle:fl>0?'ankD':'ankP'}[j];
    const [arm,mus]=ARMS[key]; const segL=j==='elbow'?segs['farm'+s].L*0.6:j==='knee'?segs['shank'+s].L*0.6:j==='hip'?segs['thigh'+s].L*0.5:j==='ankle'?segs['foot'+s].L*0.6:segs['uarm'+s].L;
    const extArm=Math.abs(Ms)/Math.max(1,Math.abs(j==='elbow'||j==='sh'?(segs['farm'+s].m+segs['hand'+s].m+this.loadKg)*G:grf[1]*(wb[s]||0)||1));
    out.joints[j+s]={ internal:Md, internalKg:Md/this.mass, external:-Ms, kind:(fl>0?'flexor':'extensor')+(j==='ankle'?(fl>0?' (dorsiflexor)':' (plantarflexor)'):''), muscle:mus, arm, force:Math.abs(Md)/arm, forceBW:Math.abs(Md)/arm/(this.mass*G),
     lever:LEVER[key][0], leverNote:LEVER[key][1], MA:arm/Math.max(arm,extArm||segL), stance:(j==='elbow'||j==='sh')?false:!!contact[s] };
   }
  }
  // kinematics on joint angles (from bio.computeAngles in o.a)
  if(o.a){ const pa=this.pa; out.kin={}; for(const k in o.a){ const v=o.a[k]; if(typeof v!=='number') continue; const q=this.ang[k]||(this.ang[k]={v,w:0,al:0,min:v,max:v,start:v});
    if(pa){ const dt=(t-pa.t)/1000; if(dt>0.005){ const w=(v-q.v)/dt; const wS=q.w*0.6+w*0.4; q.al=q.al*0.6+((wS-q.w)/dt)*0.4; q.w=wS; } } q.v=v; q.min=Math.min(q.min,v); q.max=Math.max(q.max,v); out.kin[k]={v,w:q.w,al:q.al,rom:q.max-q.min,disp:v-q.start}; } this.pa={t}; }
  // trajectories (sagittal) – last 3 s
  for(const [k,i] of [['wristR',16],['wristL',15],['ankleR',28],['ankleL',27],['com',null]]){ const tr=this.trail[k]||(this.trail[k]=[]); tr.push([t,...(i==null?com:pts[i])]); while(tr.length&&t-tr[0][0]>3000) tr.shift(); }
  out.trail=this.trail;
  // alignment
  const th=k=>segs[k].th*180/Math.PI; out.align={ trunkVsShank:Math.abs(((90-th('trunk'))-(90-(th('shankR')+180)%360))%180), kneeOverToe:{L:(pts[25][0]-pts[31][0])*100,R:(pts[26][0]-pts[32][0])*100} };
  this.last=out; return out; }
 reset(){ this.sm={}; this.smS={}; this.ang={}; this.trail={}; this.h=[]; }
}
