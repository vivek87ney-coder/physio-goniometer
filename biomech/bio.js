// Biomechanics engine: joint angles, COM/BOS, activity recognition, phases, muscle-role & ligament-strain ESTIMATES.
// All outputs are estimates derived from camera pose, not EMG or direct measurement.
import * as THREE from 'three';
import { frames } from './anatomy.js';
import { EXPLAIN, ACT_LABEL } from './kb.js';
export { ACT_LABEL };
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z), D=180/Math.PI, UP=V(0,1,0);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)); const ramp=(x,a,b)=>clamp((x-a)/(b-a));
const ang=(a,b)=>Math.acos(clamp(a.clone().normalize().dot(b.clone().normalize()),-1,1))*D;
const ang3=(a,b,c)=>ang(a.clone().sub(b),c.clone().sub(b));
const hz=v=>{const w=v.clone(); w.y=0; return w.lengthSq()<1e-8?V(0,0,1):w.normalize();};

export function toVecs(world){ return world.map(p=>V(p.x,-p.y,-p.z)); }
export function smoothLm(prev,cur,alpha){ if(!prev) return cur.map(v=>v.clone()); return cur.map((v,i)=>prev[i].clone().lerp(v,alpha)); }

export function computeAngles(P){
  const fr=frames(P); const {F,U,Xp,Ut,Ft,Xt,H,N}=fr; const a={};
  const Fh=hz(F), Xh=hz(Xp);
  a.trunkFlex=Math.atan2(Ut.dot(Fh),Ut.y)*D; a.trunkLat=Math.atan2(Ut.dot(Xh),Ut.y)*D; a.trunkTilt=ang(Ut,UP);
  const xs=hz(Xt), xp=Xh; a.trunkRot=Math.atan2(xp.clone().cross(xs).y,xp.dot(xs))*D;
  a.pelvicObl=Math.asin(clamp((P[24].y-P[23].y)/Math.max(0.05,P[23].distanceTo(P[24])),-1,1))*D;
  const head=P[7].clone().add(P[8]).multiplyScalar(.5); const hv=head.clone().sub(N); a.neck=Math.atan2(hv.dot(Ft),hv.dot(Ut))*D;
  for(const s of ['L','R']){ const i=s==='L'?0:1, sg=s==='R'?1:-1; const Xo=Xp.clone().multiplyScalar(sg), Xto=Xt.clone().multiplyScalar(sg);
    const hip=P[23+i],knee=P[25+i],ank=P[27+i],heel=P[29+i],toe=P[31+i],sh=P[11+i],el=P[13+i],wr=P[15+i];
    const T=knee.clone().sub(hip); a['hipFlex'+s]=Math.atan2(T.dot(F),-T.dot(U))*D; a['hipAbd'+s]=Math.atan2(T.dot(Xo),-T.dot(U))*D;
    a['knee'+s]=180-ang3(hip,knee,ank);
    const m=hip.clone().lerp(ank,.5); const off=knee.clone().sub(m).dot(Xo); const ll=hip.distanceTo(ank)||0.8; a['valgus'+s]=Math.atan2(-off,ll*0.5)*D*(a['knee'+s]>15?1:0.5);
    a['ankle'+s]=90-ang(knee.clone().sub(ank),toe.clone().sub(heel));
    const A=el.clone().sub(sh); a['shFlex'+s]=Math.atan2(A.dot(Ft),-A.dot(Ut))*D; a['shAbd'+s]=Math.atan2(A.dot(Xto),-A.dot(Ut))*D; a['shElev'+s]=ang(A,Ut.clone().negate());
    a['elbow'+s]=180-ang3(sh,el,wr);
    a['eThigh'+s]=ang(T,UP.clone().negate()); a['eShank'+s]=ang(ank.clone().sub(knee),UP.clone().negate()); a['eArm'+s]=ang(A,UP.clone().negate()); a['eFore'+s]=ang(wr.clone().sub(el),UP.clone().negate()); a['eFoot'+s]=ang(toe.clone().sub(heel),UP.clone().negate());
  }
  return a;
}
export const JOINTS=[['hipFlex','Hip flexion(+)/extension(-)'],['hipAbd','Hip abduction(+)/adduction(-)'],['knee','Knee flexion'],['valgus','Knee valgus(+)/varus(-)'],['ankle','Ankle dorsiflexion(+)/plantarflexion(-)'],['shFlex','Shoulder flexion(+)/extension(-)'],['shAbd','Shoulder abduction'],['elbow','Elbow flexion']];
export const AXIAL=[['trunkFlex','Trunk flexion(+)/extension(-)'],['trunkLat','Trunk lateral lean (+R)'],['trunkRot','Trunk rotation'],['pelvicObl','Pelvic obliquity (+R up)'],['neck','Head/neck flexion (rel.)']];

// segment masses (Winter/Dempster) for COM
function com(P){ const m=(a,b,t)=>P[a].clone().lerp(P[b],t);
  const head=P[7].clone().add(P[8]).multiplyScalar(.5); const Hc=P[23].clone().add(P[24]).multiplyScalar(.5), Nc=P[11].clone().add(P[12]).multiplyScalar(.5);
  const parts=[[head,.081],[Hc.clone().lerp(Nc,.5),.497]];
  for(const i of [0,1]){ parts.push([m(11+i,13+i,.436),.028],[m(13+i,15+i,.43),.016],[m(15+i,19+i,.5),.006],[m(23+i,25+i,.433),.1],[m(25+i,27+i,.433),.0465],[m(29+i,31+i,.5),.0145]); }
  const c=V(); parts.forEach(([p,w])=>c.addScaledVector(p,w)); return c; }
function hull(pts){ pts=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]); if(pts.length<3) return pts; const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); const lo=[],up=[];
  for(const p of pts){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p);} for(const p of pts.slice().reverse()){ while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p);} up.pop(); lo.pop(); return lo.concat(up); }
function margin(h,p){ if(h.length<3) return -1; let inside=true, md=1e9; for(let i=0;i<h.length;i++){ const a=h[i],b=h[(i+1)%h.length]; const ex=b[0]-a[0],ez=b[1]-a[1]; const cr=ex*(p[1]-a[1])-ez*(p[0]-a[0]); if(cr<0) inside=false; const L2=ex*ex+ez*ez; const t=clamp(((p[0]-a[0])*ex+(p[1]-a[1])*ez)/L2); const d=Math.hypot(a[0]+ex*t-p[0],a[1]+ez*t-p[1]); md=Math.min(md,d);} return inside?md:-md; }

// ---------- muscle function DOFs ----------
const Q=['rect_fem','vast_lat','vast_med'], HAM=['hams_lat','hams_med'];
const DOF=[
 {a:'hipFlex',lim:true,pos:['iliopsoas','rect_fem'],neg:['glute_max',...HAM],seg:'eThigh',mf:.7,def:1,cc:-1},
 {a:'hipAbd',lim:true,pos:['glute_med'],neg:['adductors'],seg:'eThigh',mf:.3,def:1},
 {a:'knee',lim:true,pos:[...HAM,'gastroc'],neg:Q,seg:'eShank',mf:.4,def:-1,cc:-1},
 {a:'ankle',lim:true,pos:['tib_ant'],neg:['gastroc','soleus'],seg:'eFoot',mf:.15,def:1,cc:-1},
 {a:'shFlex',lim:true,arm:1,pos:['delt_ant','pec_major','biceps'],neg:['latissimus','delt_post','triceps'],seg:'eArm',mf:.5,def:1},
 {a:'shAbd',lim:true,arm:1,pos:['delt_mid','supraspin'],neg:['pec_major','latissimus'],seg:'eArm',mf:.4,def:1},
 {a:'elbow',lim:true,arm:1,pos:['biceps'],neg:['triceps'],seg:'eFore',mf:.3,def:1},
];
const PRI={agonist:4,synergist:3,stabiliser:2,antagonist:1};
function setRole(M,key,role,I,type){ const c=M[key]; I=clamp(I); if(!c||PRI[role]>PRI[c.role]||(PRI[role]===PRI[c.role]&&I>c.I)) M[key]={role,I,type:type||c?.type}; }

export class Analyzer{
  constructor(){ this.h=[]; this.prev=null; this.dir={}; this.label='other'; this.cand=null; this.candT=0; this.override=null; this.ground=null; this.contactS={L:true,R:true}; }
  push(t,P,I){
    const a=computeAngles(P); const prev=this.prev; const dt=prev?Math.max(0.01,(t-prev.t)/1000):0.066;
    const w={}; for(const k in a){ const raw=prev?(a[k]-prev.a[k])/dt:0; w[k]=prev?prev.w[k]*0.6+raw*0.4:0; }
    // contact & ground
    const low={L:Math.min(P[29].y,P[31].y),R:Math.min(P[30].y,P[32].y)}; const g0=Math.min(low.L,low.R); this.ground=this.ground==null?g0:Math.min(g0,this.ground*0.9+g0*0.1);
    const contact={}; for(const s of ['L','R']){ const d=low[s]-g0; contact[s]=this.contactS[s]?d<0.05:d<0.03; this.contactS[s]=contact[s]; }
    const c=com(P); const fr=frames(P); const lat=hz(fr.Xp);
    const pts=[]; const fc={};
    for(const s of ['L','R']){ const i=s==='L'?0:1; const he=P[29+i],to=P[31+i]; fc[s]=[(he.x+to.x)/2,(he.z+to.z)/2]; if(!contact[s]) continue;
      for(const [p,wd] of [[he,.035],[to,.045]]) for(const sg of [-1,1]) pts.push([p.x+lat.x*wd*sg,p.z+lat.z*wd*sg]); }
    const bos=hull(pts); const cxz=[c.x,c.z]; const mg=margin(bos,cxz);
    let wb={L:0,R:0}; if(contact.L&&contact.R){ const dL=Math.hypot(cxz[0]-fc.L[0],cxz[1]-fc.L[1]), dR=Math.hypot(cxz[0]-fc.R[0],cxz[1]-fc.R[1]); wb={L:dR/(dL+dR+1e-6),R:dL/(dL+dR+1e-6)}; } else if(contact.L) wb={L:1,R:0}; else if(contact.R) wb={L:0,R:1};
    const bc=bos.length?bos.reduce((s,p)=>[s[0]+p[0]/bos.length,s[1]+p[1]/bos.length],[0,0]):cxz;
    const legLen=(P[23].distanceTo(P[27])+P[24].distanceTo(P[28]))/2||0.8;
    const stepDiff=P[27].clone().sub(P[28]).dot(hz(fr.F))/legLen;
    const headTop=Math.max(P[0].y,P[7].y,P[8].y)+0.08; const wristUp=Math.max(P[15].y,P[16].y)-headTop;
    const imgHip=I?((I[23][1]+I[24][1])/2):0, imgTorso=I?Math.abs((I[11][1]+I[12][1])/2-imgHip)||0.2:0.2;
    const r={t,a,w,contact,wb,com:c,bos,margin:mg,bosC:bc,stepDiff,wristUp,imgHip,imgTorso,legLen};
    this.h.push(r); while(this.h.length&&t-this.h[0].t>3000) this.h.shift();
    // sway
    const hs=this.h.filter(x=>t-x.t<3000); const rel=hs.map(x=>[x.com.x-x.bosC[0],x.com.z-x.bosC[1]]); const mx=rel.reduce((s,p)=>s+p[0],0)/rel.length, mz=rel.reduce((s,p)=>s+p[1],0)/rel.length;
    r.sway=Math.sqrt(rel.reduce((s,p)=>s+(p[0]-mx)**2+(p[1]-mz)**2,0)/rel.length)*100;
    this.classify(r); this.phase(r); this.muscles(r); this.ligaments(r); this.flags(r);
    this.prev=r; return r;
  }
  classify(r){
    const h=this.h; const n=h.length; const S={};
    if(n<6){ r.scores={other:1}; r.act=this.override||this.label; r.conf=0.3; return; }
    const dur=Math.max(0.5,(h[n-1].t-h[0].t)/1000);
    let zc=0,st=0; for(const x of h){ const s=x.stepDiff>0.06?1:x.stepDiff<-0.06?-1:0; if(s&&st&&s!==st) zc++; if(s) st=s; }
    const cad=zc/dur; const sd=h.map(x=>x.stepDiff); const stepAmp=Math.max(...sd)-Math.min(...sd);
    const km=x=>(x.a.kneeL+x.a.kneeR)/2, hm=x=>(x.a.hipFlexL+x.a.hipFlexR)/2;
    const k0=Math.max(1,Math.round(n*0.15)); const avg=(arr,f)=>arr.reduce((s,x)=>s+f(x),0)/arr.length;
    const kS=avg(h.slice(0,k0),km), kE=avg(h.slice(-k0),km), hfE=avg(h.slice(-k0),hm);
    const kMax=Math.max(...h.map(km)), kfMax=Math.max(...h.map(x=>Math.max(x.a.kneeL,x.a.kneeR))), hfMax=Math.max(...h.map(x=>Math.max(x.a.hipFlexL,x.a.hipFlexR)));
    const tfMax=Math.max(...h.map(x=>x.a.trunkFlex)); const tiltS=avg(h.slice(0,k0),x=>x.a.trunkTilt), tiltE=avg(h.slice(-k0),x=>x.a.trunkTilt), tiltM=avg(h,x=>x.a.trunkTilt);
    const asym=avg(h,x=>Math.abs(x.a.kneeL-x.a.kneeR)); const sep=avg(h,x=>Math.abs(x.stepDiff));
    const kRec=h.filter(x=>r.t-x.t<1000).map(km); const motK=Math.max(...kRec)-Math.min(...kRec);
    const dy=(avg(h.slice(-k0),x=>x.imgHip)-avg(h.slice(0,k0),x=>x.imgHip))/avg(h,x=>x.imgTorso);
    const wU=Math.max(...h.map(x=>x.wristUp)); const shF=avg(h,x=>Math.max(x.a.shFlexL,x.a.shFlexR));
    const eS=avg(h.slice(0,k0),x=>Math.min(x.a.elbowL,x.a.elbowR)), eE=avg(h.slice(-k0),x=>Math.min(x.a.elbowL,x.a.elbowR));
    const flight=h.filter(x=>!x.contact.L&&!x.contact.R).length/n;
    const lying=ramp(tiltM,55,70);
    const gait=ramp(cad,0.5,1.0)*ramp(stepAmp,0.2,0.4)*(1-lying);
    S.transfer=ramp(tiltS,50,65)*ramp(tiltS-tiltE,20,40); S.lying=lying*(1-S.transfer);
    S.running=gait*Math.max(ramp(cad,2.4,3),ramp(flight,0.08,0.25));
    S.stair_up=gait*ramp(hfMax,50,70)*(1-S.running);
    S.stair_down=gait*ramp(dy,0.15,0.4)*ramp(kfMax,55,75)*(1-S.stair_up);
    S.walking=gait*(1-S.running)*(1-S.stair_up)*(1-S.stair_down);
    const ng=(1-gait)*(1-lying);
    S.sts=ramp(kS-kE,35,60)*ramp(kS,60,80)*ng;
    S.stand_sit=ramp(kE-kS,35,60)*ramp(kE,60,80)*ng;
    S.squat=ramp(kMax-Math.max(kS,kE),35,60)*(1-ramp(sep,0.25,0.4))*(1-ramp(asym,15,30))*ng;
    S.lunge=ramp(kfMax,50,70)*ramp(sep,0.25,0.4)*ng;
    S.sitting=ramp(kE,55,75)*ramp(hfE,50,70)*(1-ramp(motK,10,25))*ng; r.seatP=S.sitting;
    S.bend_lift=ramp(tfMax,40,65)*ng*(1-0.6*S.squat)*(1-S.sitting);
    S.overhead=ramp(wU,-0.02,0.08)*(1-lying);
    const armF=ramp(shF,45,70)*(1-ramp(shF,130,150))*(1-S.overhead);
    S.push=armF*ramp(eS-eE,20,45); S.pull=armF*ramp(eE-eS,20,45);
    S.standing=ramp(30-kE,0,15)*(1-ramp(motK,10,25))*ng*(1-ramp(tfMax,30,45))*(1-S.overhead);
    S.other=0.12;
    const tot=Object.values(S).reduce((a,b)=>a+b,0); const ranked=Object.entries(S).sort((a,b)=>b[1]-a[1]);
    r.scores=Object.fromEntries(ranked.slice(0,3).map(([k,v])=>[k,v/tot])); r.feat={cad,stepAmp,kS,kE,kMax,tfMax,hfMax,sep,asym,wU,shF};
    const top=ranked[0][0];
    if(top!==this.label){ if(this.cand!==top){ this.cand=top; this.candT=r.t; } else if(r.t-this.candT>500) { this.label=top; this.cand=null; } } else this.cand=null;
    r.auto=this.label; r.act=this.override||this.label; r.conf=this.override?1:(S[this.label]||0)/tot; r.cadence=cad*60;
  }
  phase(r){ const a=r.a,w=r.w; const act=r.act; const km=(a.kneeL+a.kneeR)/2, kw=(w.kneeL+w.kneeR)/2; let ph='-';
    if(['walking','running','stair_up','stair_down'].includes(act)){ ph=`R ${r.contact.R?'stance':'swing'} / L ${r.contact.L?'stance':'swing'}`; r.gaitPh={L:r.contact.L?'stance':'swing',R:r.contact.R?'stance':'swing'}; }
    else if(act==='sts'||act==='sitting'&&kw<-30){ ph= km>60&&w.trunkFlex>8&&kw>-25?'I Flexion-momentum': kw<-35&&km>40?'II Momentum transfer (seat-off)': km>18&&kw<-10?'III Extension':'IV Stabilisation'; }
    else if(act==='stand_sit'){ ph=kw>12?'Descent (eccentric)':km>60?'Seated':'Preparation'; }
    else if(act==='squat'||act==='lunge'){ const kk=act==='lunge'?Math.max(a.kneeL,a.kneeR):km, ww=act==='lunge'?(a.kneeL>a.kneeR?w.kneeL:w.kneeR):kw; ph=ww>15?'descent':ww<-15?'ascent':kk>50?'bottom':'top'; }
    else if(act==='bend_lift'){ ph=w.trunkFlex>10?'Lowering (eccentric)':w.trunkFlex<-10?'Lifting (concentric)':'Hold'; }
    else if(['overhead','push','pull'].includes(act)){ const e=Math.max(Math.abs(w.shFlexL),Math.abs(w.shFlexR),Math.abs(w.elbowL),Math.abs(w.elbowR)); ph=e>25?'Moving':'Hold'; }
    r.phase=ph; const E=EXPLAIN[act]||EXPLAIN.other; const key=r.gaitPh?(r.gaitPh.R):ph;
    r.explain=(E[key]||'')+(E[key]?' ':'')+E._; }
  muscles(r){ const a=r.a,w=r.w,M={},types={};
    for(const s of ['L','R']) for(const d of DOF){
      const th=a[d.a+s], om=w[d.a+s]; const el=a[d.seg+s], elw=r.w[d.seg+s]; const closed=!d.arm&&d.cc&&r.contact[s]&&r.wb[s]>0.15 && r.act!=='sitting'&&r.act!=='lying';
      let dirAG, base;
      if(closed){ dirAG=d.cc; const wbf=clamp(r.wb[s]*1.6);
        base=d.a==='knee'?wbf*(0.2+Math.sin(clamp(th,0,120)/D)):d.a==='hipFlex'?wbf*(0.2+0.8*Math.sin(clamp(th+Math.max(0,a.trunkFlex)*0.6,0,120)/D)):wbf*(0.45+ramp(th,0,30)*0.4);
      } else { const key=d.a+s; if(Math.abs(om)>20&&Math.abs(elw)>8) this.dir[key]=Math.sign(elw*om); dirAG=this.dir[key]??d.def; base=Math.sin(clamp(el,0,180)/D)*d.mf*1.4; if(d.a==='hipAbd') base*=0.6;
        // seated/lying: thigh is supported by the seat, shank hangs passively -> no gravity-driven isometric hold
        const seated=['sitting','lying'].includes(r.act)||(r.seatP||0)>0.5; if(seated&&!d.arm){ if(d.a==='hipFlex'||d.a==='hipAbd') base=0; else if(Math.abs(om)<18) base=Math.min(base,0.08); } }
      const I=clamp(base*(1+Math.abs(om)/250));
      const grp=g=>(g>0?d.pos:d.neg).map(m=>m+s);
      let act,type;
      if(Math.abs(om)>18){ const ms=Math.sign(om); if(ms===dirAG){ act=grp(ms); type='concentric'; } else { act=grp(dirAG); type='eccentric'; } }
      else if(base>0.15){ act=grp(dirAG); type='isometric'; }
      if(act){ const opp=act===grp(1)?grp(-1):grp(1); act.forEach(m=>setRole(M,m,'agonist',I,type)); opp.forEach(m=>setRole(M,m,'antagonist',I*0.3,'co-contraction'));
        types[d.a+s]={type,muscles:act,I}; }
      if(closed&&d.a==='knee'&&act&&act[0].startsWith('rect')){ setRole(M,'glute_max'+s,'synergist',I*0.6,type); setRole(M,'soleus'+s,'synergist',I*0.5,type); HAM.forEach(m=>setRole(M,m+s,'stabiliser',I*0.4,'co-contraction')); }
      if(d.a==='shFlex'&&a['shElev'+s]>30){ const e=a['shElev'+s]; ['supraspin','infraspin','subscap'].forEach(m=>setRole(M,m+s,'stabiliser',0.25+0.5*Math.sin(clamp(e,0,180)/D),'isometric')); if(e>60) setRole(M,'trapezius'+s,'synergist',ramp(e,60,150),'concentric'); if(e>90) setRole(M,'trap_upper'+s,'synergist',ramp(e,90,160),'concentric'); }
    }
    // single-limb support
    for(const s of ['L','R']){ const o=s==='L'?'R':'L'; if(r.contact[s]&&!r.contact[o]) setRole(M,'glute_med'+s,'stabiliser',0.75,'isometric'); if(r.contact[s]&&r.wb[s]>0.2&&!['sitting','lying'].includes(r.act)) setRole(M,'soleus'+s,'stabiliser',0.35,'isometric'); }
    // trunk
    const tf=a.trunkFlex, tw=w.trunkFlex; const tI=clamp(Math.sin(Math.abs(clamp(tf,-90,90))/D)*1.3*(1+Math.abs(tw)/200));
    if(!['lying'].includes(r.act)){ const ext=tf>-5; let type=Math.abs(tw)<12?'isometric':(ext?(tw<0?'concentric':'eccentric'):(tw>0?'concentric':'eccentric'));
      const ag=ext?['erector']:['rect_abd','obliques']; const an=ext?['rect_abd','obliques']:['erector'];
      for(const s of ['L','R']){ ag.forEach(m=>setRole(M,m+s,tI>0.12?'agonist':'stabiliser',Math.max(0.2,tI),type)); an.forEach(m=>setRole(M,m+s,['bend_lift','push','pull','squat','sts'].includes(r.act)?'stabiliser':'antagonist',tI*0.5,'co-contraction')); }
      types.trunk={type,muscles:ag,I:tI};
      if(Math.abs(a.trunkLat)>5){ const s=a.trunkLat>0?'L':'R'; setRole(M,'obliques'+s,'agonist',ramp(Math.abs(a.trunkLat),5,25),'isometric'); setRole(M,'erector'+s,'synergist',ramp(Math.abs(a.trunkLat),5,25)*0.7,'isometric'); }
    } else { const lt=r.act==='transfer'; if(lt) for(const s of ['L','R']){ setRole(M,'rect_abd'+s,'agonist',0.7,'concentric'); setRole(M,'obliques'+s,'synergist',0.5,'concentric'); setRole(M,'iliopsoas'+s,'synergist',0.4,'concentric'); setRole(M,'triceps'+s,'synergist',0.4,'concentric'); } }
    r.muscles=M; r.motions=types; }
  ligaments(r){ const a=r.a,M=r.muscles,L={};
    for(const s of ['L','R']){ const k=a['knee'+s], v=a['valgus'+s], df=a['ankle'+s], wb=r.wb[s];
      const qI=Math.max(...['rect_fem','vast_lat','vast_med'].map(m=>M[m+s]?.role==='agonist'?M[m+s].I:0));
      const pI=Math.max(...['gastroc','soleus'].map(m=>M[m+s]?.role==='agonist'?M[m+s].I:0));
      L['acl'+s]=clamp(0.55*ramp(30-k,0,30)*qI+0.35*ramp(v,3,15)+0.15*ramp(-k,0,5));
      L['pcl'+s]=clamp(ramp(k,60,110)*wb*1.2+ramp(k,60,110)*0.6*pI*0);
      const wbk=0.3+0.7*clamp(wb*1.5); L['mcl'+s]=ramp(v,4,18)*wbk; L['lcl'+s]=ramp(-v,4,18)*wbk;
      L['patellar'+s]=clamp(qI*ramp(k,5,90)*(0.4+0.6*wb)+0.35*ramp(k,30,100)*wb);
      L['achilles'+s]=clamp(0.7*pI+0.3*ramp(df,0,20));
      L['atfl'+s]=clamp(0.7*ramp(-df,10,35)*(0.4+0.6*wb));
      L['iliofemoral'+s]=ramp(-a['hipFlex'+s],0,20);
      const e=a['shElev'+s]; L['capsule'+s]=ramp(e,80,150); L['coracoacromial'+s]=clamp(1-Math.abs(e-90)/30)*0.9;
    }
    // load index 0-1 (relative, not % strain); temporal smoothing avoids frame-to-frame flicker
    const P=this.Ls||{}; for(const k in L){ L[k]=P[k]==null?L[k]:P[k]*0.7+L[k]*0.3; } this.Ls={...L}; r.ligaments=L; }
  flags(r){ const a=r.a,f=[]; const act=r.act; const wbAct=['squat','sts','stand_sit','lunge','stair_up','stair_down','walking','running'];
    for(const s of ['L','R']){ if(wbAct.includes(act)&&r.contact[s]&&a['valgus'+s]>10&&a['knee'+s]>20) f.push('Dynamic knee valgus '+s); }
    const gaitA=['walking','running','stair_up','stair_down'];
    if((gaitA.includes(act)||['sts','squat'].includes(act))&&Math.abs(a.trunkLat)>10) f.push('Trunk lateral lean '+(a.trunkLat>0?'R':'L')+' (hip abductor weakness / antalgic?)');
    if(gaitA.includes(act)&&(r.contact.L!==r.contact.R)&&Math.abs(a.pelvicObl)>6) f.push('Pelvic drop (Trendelenburg-type)');
    if(['sts','squat','stand_sit'].includes(act)&&a.trunkFlex>55) f.push('Excessive trunk flexion');
    if(['sts','squat','stand_sit','standing'].includes(act)&&r.contact.L&&r.contact.R&&Math.abs(r.wb.L-r.wb.R)>0.3) f.push('Weight-bearing asymmetry ('+(r.wb.L>r.wb.R?'L':'R')+' loaded)');
    if(['standing','squat','lunge','bend_lift','overhead'].includes(act)&&r.margin<-0.02) f.push('COM outside base of support');
    if(act==='standing'&&r.sway>3) f.push('Increased postural sway');
    if(act==='bend_lift'&&a.trunkFlex>60&&Math.max(a.kneeL,a.kneeR)<25) f.push('Stoop lift pattern (little knee flexion)');
    if(['overhead','push','pull'].includes(act)&&Math.abs(a.trunkLat)>10) f.push('Trunk lean compensation during arm task');
    if(act==='overhead'&&Math.max(a.shElevL,a.shElevR)<140&&r.wristUp>0) f.push('Limited shoulder elevation (<140 deg)');
    r.flags=f; }
}

// ---------- session processing & summary ----------
export function processFrames(frs){ const an=new Analyzer(); const out=frs.map(f=>{ const r=an.push(f.t,f.P,f.I); r._P=f.P; r._I=f.I; return r; }); refineLabels(out); return out; }
export function relabelO(frs,override){ const an=new Analyzer(); an.override=override||null; const out=frs.map(f=>{ const r=an.push(f.t,f.P,f.I); r._P=f.P; r._I=f.I; return r; }); if(!override) refineLabels(out); return out; }
export function relabel(res,override){ const an=new Analyzer(); an.override=override||null; return res.map(r=>{ const x=an.push(r.t,r._P,r._I); return x; }); }
function refineLabels(res){ // squat = stand_sit quickly followed by sts with short seated time
  const seg=segments(res);
  for(let i=0;i+1<seg.length;i++){ const a=seg[i],b=seg[i+1], c=seg[i+2];
    if(a.act==='stand_sit'&&(b.act==='sts'||(b.act==='sitting'&&b.dur<0.8&&c&&c.act==='sts'))){ const end=b.act==='sts'?b.i1:c.i1; for(let j=a.i0;j<=end;j++){ res[j].act='squat'; res[j].auto='squat'; } } } }
export function segments(res){ const s=[]; let cur=null; res.forEach((r,i)=>{ if(!cur||cur.act!==r.act){ cur={act:r.act,i0:i,i1:i,t0:r.t,t1:r.t,conf:0,n:0}; s.push(cur);} cur.i1=i; cur.t1=r.t; cur.conf+=r.conf; cur.n++; }); s.forEach(x=>{x.dur=(x.t1-x.t0)/1000; x.conf/=x.n;}); return s; }
export function summarize(res){
  const S={n:res.length,dur:res.length?(res[res.length-1].t-res[0].t)/1000:0};
  S.segments=segments(res).filter(x=>x.dur>=0.4||x.n>4);
  const actDur={}; S.segments.forEach(x=>actDur[x.act]=(actDur[x.act]||0)+x.dur); S.actDur=actDur; S.main=Object.entries(actDur).sort((a,b)=>b[1]-a[1])[0]?.[0]||'other';
  const rom=(rs)=>{ const o={}; for(const [k] of JOINTS) for(const s of ['L','R']){ const v=rs.map(r=>r.a[k+s]); o[k+s]={min:Math.min(...v),max:Math.max(...v)}; o[k+s].rom=o[k+s].max-o[k+s].min; }
    for(const [k] of AXIAL){ const v=rs.map(r=>r.a[k]); o[k]={min:Math.min(...v),max:Math.max(...v)}; o[k].rom=o[k].max-o[k].min; } return o; };
  S.rom=res.length?rom(res):{}; S.romByAct={}; for(const a in actDur){ const rs=res.filter(r=>r.act===a); if(rs.length>3) S.romByAct[a]=rom(rs); }
  S.asym={}; for(const [k,lab] of JOINTS){ const L=S.rom[k+'L']?.rom||0,R=S.rom[k+'R']?.rom||0; S.asym[k]=(L+R)>1?Math.abs(L-R)/(0.5*(L+R))*100:0; }
  // gait
  const ic=[]; for(let i=1;i<res.length;i++){ if(res[i].contact.R&&!res[i-1].contact.R&&['walking','running','stair_up','stair_down'].includes(res[i].act)) ic.push(i); }
  const cycles=[]; for(let i=0;i+1<ic.length;i++){ const d=(res[ic[i+1]].t-res[ic[i]].t)/1000; if(d>0.5&&d<2.2) cycles.push({i0:ic[i],i1:ic[i+1],dur:d,kind:'walking'}); }
  const gr=res.filter(r=>r.gaitPh); S.gait=gr.length?{cadence:res.filter(r=>r.cadence).reduce((s,r)=>s+r.cadence,0)/Math.max(1,res.filter(r=>r.cadence).length),stanceL:100*gr.filter(r=>r.contact.L).length/gr.length,stanceR:100*gr.filter(r=>r.contact.R).length/gr.length,cycles:cycles.length,
    peakSwingKnee:cycles.length?cycles.reduce((s,c)=>s+Math.max(...res.slice(c.i0,c.i1).map(r=>r.a.kneeR)),0)/cycles.length:null,
    minHip:cycles.length?cycles.reduce((s,c)=>s+Math.min(...res.slice(c.i0,c.i1).map(r=>r.a.hipFlexR)),0)/cycles.length:null}:null;
  // reps (sts / squat / stand_sit segments)
  S.segments.filter(x=>['sts','squat','stand_sit','lunge'].includes(x.act)).forEach(x=>cycles.push({i0:x.i0,i1:x.i1,dur:x.dur,kind:x.act}));
  S.cycles=cycles;
  S.sts={count:S.segments.filter(x=>x.act==='sts').length,mean:avgv(S.segments.filter(x=>x.act==='sts').map(x=>x.dur))};
  // flags
  const fl={}; for(let i=1;i<res.length;i++) for(const f of res[i].flags){ fl[f]=(fl[f]||0)+(res[i].t-res[i-1].t)/1000; }
  if(S.gait&&S.gait.peakSwingKnee!=null&&S.gait.peakSwingKnee<40) fl['Reduced swing knee flexion (stiff-knee pattern)']=S.dur;
  if(S.gait&&S.gait.minHip!=null&&S.gait.minHip>0) fl['Reduced terminal-stance hip extension']=S.dur;
  for(const [k,lab] of JOINTS) if(S.asym[k]>15&&(S.rom[k+'L'].rom+S.rom[k+'R'].rom)/2>15) fl[`ROM asymmetry ${lab.split('(')[0].trim()} ${S.asym[k].toFixed(0)}%`]=S.dur;
  S.flags=Object.entries(fl).filter(([k,v])=>v>=0.3).sort((a,b)=>b[1]-a[1]);
  // muscles
  const mu={}; for(const r of res) for(const k in r.muscles){ const m=r.muscles[k]; mu[k]=mu[k]||{n:0,ag:0,I:0,types:{}}; mu[k].n++; if(m.role==='agonist'){ mu[k].ag++; mu[k].I+=m.I; mu[k].types[m.type]=(mu[k].types[m.type]||0)+1; } mu[k].roles=mu[k].roles||{}; mu[k].roles[m.role]=(mu[k].roles[m.role]||0)+1; }
  S.muscles=Object.entries(mu).map(([k,v])=>({k,agPct:100*v.ag/res.length,meanI:v.ag?v.I/v.ag:0,type:Object.entries(v.types).sort((a,b)=>b[1]-a[1]).map(x=>x[0]+' '+Math.round(100*x[1]/Math.max(1,v.ag))+'%').join(', '),role:Object.entries(v.roles).sort((a,b)=>b[1]-a[1])[0][0]})).sort((a,b)=>b.agPct*b.meanI-a.agPct*a.meanI);
  const lg={}; for(const r of res) for(const k in r.ligaments){ lg[k]=lg[k]||{max:0,sum:0}; lg[k].max=Math.max(lg[k].max,r.ligaments[k]); lg[k].sum+=r.ligaments[k]; }
  S.ligaments=Object.entries(lg).map(([k,v])=>({k,max:v.max,mean:v.sum/res.length})).sort((a,b)=>b.max-a.max);
  const st=res.filter(r=>r.contact.L||r.contact.R); S.balance={sway:avgv(res.filter(r=>r.act==='standing').map(r=>r.sway)),margin:avgv(st.map(r=>r.margin))*100,wbL:avgv(res.filter(r=>r.contact.L&&r.contact.R).map(r=>r.wb.L))*100,wbR:avgv(res.filter(r=>r.contact.L&&r.contact.R).map(r=>r.wb.R))*100};
  S.explain=(EXPLAIN[S.main]||EXPLAIN.other)._;
  return S;
}
const avgv=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;

// ---------- synthetic normal references ----------
const g=(p,m,s)=>Math.exp(-0.5*((p-m)/s)**2);
const REF={
 walking:{dur:1.1,f:p=>{ const one=q=>{q=((q%1)+1)%1; return {hip:10+22*Math.cos(2*Math.PI*(q-0.95)),knee:5+15*g(q,.15,.06)+55*g(q,.72,.09)+55*g(q,-.28,.09),ankle:-5*g(q,.06,.03)+10*g(q,.45,.12)-18*g(q,.63,.05)};};
   const R=one(p),L=one(p+0.5); return {trunk:3,R,L,shR:8+15*Math.cos(2*Math.PI*(p-0.45)),shL:8+15*Math.cos(2*Math.PI*(p-0.95)),el:20}; }},
 squat:{dur:3,f:p=>{ const d=0.5-0.5*Math.cos(2*Math.PI*p); const leg={hip:95*d-35*d,knee:100*d,ankle:25*d}; return {trunk:35*d,R:leg,L:leg,shR:80*d,shL:80*d,el:5}; }},
 sts:{dur:2.5,f:p=>{ const s=p<.3?0:p>.85?1:(t=>t*t*(3-2*t))((p-.3)/.55); const tr=40*g(p,.4,.15); const leg={hip:88*(1-s),knee:95*(1-s),ankle:15*(1-s)}; return {trunk:tr,R:leg,L:leg,shR:10+20*g(p,.4,.15),shL:10+20*g(p,.4,.15),el:15}; }},
};
REF.stand_sit={dur:2.5,f:p=>REF.sts.f(1-p)}; REF.lunge=REF.squat; REF.stair_up=REF.walking; REF.stair_down=REF.walking; REF.running={dur:0.7,f:p=>{const w=REF.walking.f(p); w.R.knee*=1.5; w.L.knee*=1.5; return w;}};
export const hasRef=a=>!!REF[a];
export function refPose(kind,p){ const R=REF[kind]; if(!R) return null; const q=R.f(p);
  const P=Array.from({length:33},()=>V()); const r=x=>x/D; const dir=a=>V(0,-Math.cos(r(a)),Math.sin(r(a)));
  const H=V(0,0,0); const tr=q.trunk; const N=H.clone().addScaledVector(V(0,Math.cos(r(tr)),Math.sin(r(tr))),0.5);
  for(const [s,i,x] of [['L',0,0.1],['R',1,-0.1]]){ const L=q[s]; const hip=V(x,0,0); const th=L.hip; const knee=hip.clone().addScaledVector(dir(th),0.42); const sh=th-L.knee; const ank=knee.clone().addScaledVector(dir(sh),0.42); const fa=sh+90+L.ankle; const fd=dir(fa);
    const heel=ank.clone().addScaledVector(fd,-0.05).addScaledVector(dir(sh),0.05), toe=heel.clone().addScaledVector(fd,0.22);
    P[23+i]=hip; P[25+i]=knee; P[27+i]=ank; P[29+i]=heel; P[31+i]=toe;
    const shp=N.clone().add(V(x*1.8,0,0)); const sf=s==='R'?q.shR:q.shL; const el=shp.clone().addScaledVector(dir(sf),0.3); const wr=el.clone().addScaledVector(dir(sf+q.el),0.26);
    P[11+i]=shp; P[13+i]=el; P[15+i]=wr; P[17+i]=wr.clone().addScaledVector(dir(sf+q.el),0.07).add(V(x*0.2,0,0)); P[19+i]=wr.clone().addScaledVector(dir(sf+q.el),0.08); P[21+i]=wr.clone().addScaledVector(dir(sf+q.el),0.05).add(V(-x*0.2,0,0.02)); }
  const hd=N.clone().addScaledVector(V(0,Math.cos(r(tr*0.6)),Math.sin(r(tr*0.6))),0.2);
  P[0]=hd.clone().add(V(0,0,0.1)); for(let i=1;i<=6;i++) P[i]=hd.clone().add(V((i<4?1:-1)*0.03,0.03,0.08)); P[7]=hd.clone().add(V(0.07,0,0)); P[8]=hd.clone().add(V(-0.07,0,0)); P[9]=hd.clone().add(V(0.025,-0.05,0.08)); P[10]=hd.clone().add(V(-0.025,-0.05,0.08));
  return P; }
export function refCurve(kind,key){ const R=REF[kind]; if(!R) return null; const out=[]; for(let i=0;i<=100;i++){ const a=computeAngles(refPose(kind,i/100)); out.push(a[key]); } return out; }
export function patientCurve(res,cyc,key){ const out=[]; for(let i=0;i<=100;i++){ const j=Math.round(cyc.i0+(cyc.i1-cyc.i0)*i/100); out.push(res[j].a[key]); } return out; }
export function meanCurve(res,cycles,key){ if(!cycles.length) return null; const cs=cycles.map(c=>patientCurve(res,c,key)); return cs[0].map((_,i)=>cs.reduce((s,c)=>s+c[i],0)/cs.length); }
export const rms=(a,b)=>Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])**2,0)/a.length);
