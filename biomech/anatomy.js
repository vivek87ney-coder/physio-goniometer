// Procedural 3D anatomy driven by MediaPipe world landmarks (three.js convention: x, y up, z toward camera).
// Simplified geometric shapes, NOT a medically accurate anatomical model.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { INFO } from './kb.js';

const V = (x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const BONE='#e9dfc8', MUS='#a8473e', LIG='#f4f1e6', NER='#ffd23f';

function boneGeo(seg=10){ const p=[]; for(let i=0;i<=20;i++){const y=i/20; const r=1+0.9*Math.exp(-((y/0.09)**2))+0.9*Math.exp(-(((1-y)/0.09)**2)); p.push(new THREE.Vector2(r,y));} return new THREE.LatheGeometry(p,seg); }
function spindleGeo(seg=10){ const p=[new THREE.Vector2(0,0)]; for(let i=0;i<=16;i++){const y=i/16; p.push(new THREE.Vector2(0.12+0.88*Math.pow(Math.sin(Math.PI*y),1.1),y));} p.push(new THREE.Vector2(0,1)); return new THREE.LatheGeometry(p,seg); }
function cylGeo(seg=6){ const g=new THREE.CylinderGeometry(1,1,1,seg,1); g.translate(0,0.5,0); return g; }

const tmpM=new THREE.Matrix4(), X=V(),Y=V(),Z=V();
// place unit-Y geometry from a to b; rx/rz radii; ref = direction for local Z (flattening)
function placeAlong(mesh,a,b,rx,rz,ref){
  Y.subVectors(b,a); const len=Y.length()||1e-4; Y.divideScalar(len);
  Z.copy(ref||V(0,0,1)); Z.addScaledVector(Y,-Z.dot(Y)); if(Z.lengthSq()<1e-6){Z.set(1,0,0).addScaledVector(Y,-Y.x);} Z.normalize();
  X.crossVectors(Y,Z);
  tmpM.makeBasis(X.multiplyScalar(rx),Y.multiplyScalar(len),Z.multiplyScalar(rz)); tmpM.setPosition(a);
  mesh.matrix.copy(tmpM); mesh.matrixWorldNeedsUpdate=true; return len;
}
function placeBasis(mesh,o,x,y,z,sx,sy,sz){ tmpM.makeBasis(x.clone().multiplyScalar(sx),y.clone().multiplyScalar(sy),z.clone().multiplyScalar(sz)); tmpM.setPosition(o); mesh.matrix.copy(tmpM); mesh.matrixWorldNeedsUpdate=true; }

// ---------- anatomical frames & anchor points ----------
export function frames(P){
  const L=i=>P[i];
  const hipL=L(23),hipR=L(24),shL=L(11),shR=L(12);
  const H=hipL.clone().add(hipR).multiplyScalar(.5), N=shL.clone().add(shR).multiplyScalar(.5);
  const Xp=hipR.clone().sub(hipL).normalize(); // toward person's right
  const U=N.clone().sub(H).normalize();
  const F=new THREE.Vector3().crossVectors(U,Xp).normalize(); // anterior
  const Up=new THREE.Vector3().crossVectors(Xp,F).normalize(); // pelvis up
  const Xt=shR.clone().sub(shL).normalize(); const Ft=new THREE.Vector3().crossVectors(U,Xt).normalize(); const Xt2=new THREE.Vector3().crossVectors(U,Ft).multiplyScalar(-1).normalize();
  return {H,N,Xp,U:Up,F,Ut:U,Ft,Xt:Xt2};
}
function segFrame(a,b,latRef,fwdRef){
  const y=b.clone().sub(a).normalize();
  let f=new THREE.Vector3().crossVectors(latRef,y); if(f.lengthSq()<0.05) f=fwdRef.clone(); f.addScaledVector(y,-f.dot(y)).normalize();
  const x=new THREE.Vector3().crossVectors(y,f).normalize(); // = latRef-ish
  return {a,b,y,f,x,len:a.distanceTo(b)};
}
// point on segment: t along, df anterior, dl toward lateral (side sign applied)
function sp(s,t,df,dl,side){ return s.a.clone().lerp(s.b,t).addScaledVector(s.f,df).addScaledVector(s.x,dl*(side==='R'?1:-1)); }

export function anchors(P){
  const fr=frames(P), A={fr}; const {H,N,Xp,U,F,Ut,Ft,Xt}=fr;
  const hipW=P[23].distanceTo(P[24]); const k=Math.max(0.6,Math.min(1.6,hipW/0.2)); A.k=k;
  const headC=P[7].clone().add(P[8]).multiplyScalar(.5);
  A.head=headC; A.nose=P[0];
  const neck=N.clone().addScaledVector(Ut,0.03*k).addScaledVector(Ft,-0.02*k); A.C7=neck;
  A.sacrum=H.clone().addScaledVector(F,-0.07*k).addScaledVector(U,0.02*k);
  // spine curve
  const sp0=A.sacrum.clone().addScaledVector(U,0.05*k), sp1=neck.clone();
  A.spine=t=>{ const p=sp0.clone().lerp(sp1,t); const lord=Math.sin(Math.PI*Math.min(1,t/0.35))*0.025*k; const kyph=t>0.35?-Math.sin(Math.PI*(t-0.35)/0.6)*0.03*k:0; const cerv=t>0.9?Math.sin(Math.PI*(t-.9)/.1)*0.01:0; return p.addScaledVector(Ft,lord+kyph+cerv); };
  for(const s of ['L','R']){
    const sg=s==='R'?1:-1, Xo=Xp.clone().multiplyScalar(sg), Xto=Xt.clone().multiplyScalar(sg);
    const i=s==='L'?0:1, hip=P[23+i], knee=P[25+i], ank=P[27+i], heel=P[29+i], toe=P[31+i], sh=P[11+i], el=P[13+i], wr=P[15+i];
    const th=segFrame(hip,knee,Xp,F), sk=segFrame(knee,ank,Xp,F), ft=segFrame(heel,toe,Xp,F);
    const ua=segFrame(sh,el,Xt,Ft), fa=segFrame(el,wr,Xt,Ft);
    const g={th,sk,ft,ua,fa,hip,knee,ank,heel,toe,sh,el,wr,Xo,Xto,
      index:P[19+i],pinky:P[17+i],thumb:P[21+i]};
    g.ASIS=H.clone().addScaledVector(Xo,hipW*0.55).addScaledVector(F,0.06*k).addScaledVector(U,0.07*k);
    g.AIIS=g.ASIS.clone().addScaledVector(U,-0.03*k).addScaledVector(Xo,-0.01*k);
    g.crest=H.clone().addScaledVector(Xo,hipW*0.62).addScaledVector(U,0.12*k);
    g.PSIS=H.clone().addScaledVector(Xo,0.035*k).addScaledVector(F,-0.07*k).addScaledVector(U,0.07*k);
    g.pubis=H.clone().addScaledVector(Xo,0.02*k).addScaledVector(F,0.06*k).addScaledVector(U,-0.04*k);
    g.ischium=hip.clone().addScaledVector(Xo,-0.04*k).addScaledVector(F,-0.04*k).addScaledVector(U,-0.06*k);
    g.GT=sp(th,0.04,0,0.04*k,s);
    g.LT=sp(th,0.1,-0.01,-0.02*k,s);
    g.patella=sp(th,0.97,0.045*k,0,s);
    g.latCond=sp(th,0.97,-0.005,0.035*k,s); g.medCond=sp(th,0.97,-0.005,-0.035*k,s);
    g.tibTub=sp(sk,0.12,0.035*k,0,s); g.fibHead=sp(sk,0.07,-0.015,0.045*k,s);
    g.medTib=sp(sk,0.17,0,-0.035*k,s);
    g.latMal=sp(sk,1,0,0.03*k,s); g.medMal=sp(sk,0.99,0,-0.03*k,s);
    g.calc=sp(ft,0,0.0,0,s).addScaledVector(U,0.015); g.talus=sp(ft,0.3,0,0.01,s).addScaledVector(U,0.04*k);
    g.mt1=sp(ft,0.8,0,-0.025*k,s); g.mt5=sp(ft,0.75,0,0.03*k,s);
    g.acromion=sh.clone().addScaledVector(Ut,0.025*k).addScaledVector(Xto,0.01*k);
    g.coracoid=sh.clone().addScaledVector(Ft,0.035*k).addScaledVector(Xto,-0.035*k);
    g.glenoid=sh.clone().addScaledVector(Xto,-0.02*k);
    g.clavMed=N.clone().addScaledVector(Xto,0.02*k).addScaledVector(Ft,0.05*k).addScaledVector(Ut,-0.02*k);
    g.scapSup=sh.clone().addScaledVector(Xto,-0.09*k).addScaledVector(Ft,-0.06*k).addScaledVector(Ut,0.0);
    g.scapInf=sh.clone().addScaledVector(Xto,-0.08*k).addScaledVector(Ft,-0.07*k).addScaledVector(Ut,-0.14*k);
    g.scapSpine=sh.clone().addScaledVector(Xto,-0.04*k).addScaledVector(Ft,-0.05*k).addScaledVector(Ut,0.0);
    g.latEpi=sp(ua,0.97,0,0.035*k,s); g.medEpi=sp(ua,0.97,0,-0.04*k,s); g.olecranon=sp(ua,1.0,-0.025*k,0,s);
    g.radTub=sp(fa,0.12,0.015*k,0.005,s); g.ulnaProx=sp(fa,0.08,-0.01*k,-0.012*k,s);
    g.deltTub=sp(ua,0.45,0,0.02*k,s);
    g.humNeck=sp(ua,0.08,0,0,s);
    A[s]=g;
  }
  A.xiphoid=H.clone().lerp(N,0.62).addScaledVector(Ft,0.1*k);
  A.sternTop=N.clone().addScaledVector(Ft,0.06*k).addScaledVector(Ut,-0.03*k);
  A.T12=A.spine(0.38); A.L3=A.spine(0.18); A.T7=A.spine(0.62);
  return A;
}

// ---------- structure definitions ----------
// muscle: id, sides, o(A,g), i(A,g), r (radius m), flat (x/z ratio), ref(A,g)=normal for flattening
const sideMus=[
 ['glute_max',  (A,g)=>g.PSIS.clone().lerp(A.sacrum,.4).addScaledVector(A.fr.F,-0.02), (A,g)=>sp(g.th,0.22,-0.01,0.02,g.s), .045,2.2,(A,g)=>A.fr.F],
 ['glute_med',  (A,g)=>g.crest, (A,g)=>g.GT, .03,2.2,(A,g)=>g.Xo],
 ['iliopsoas',  (A,g)=>A.L3.clone().addScaledVector(g.Xo,0.03).addScaledVector(A.fr.F,0.03), (A,g)=>g.LT, .022,1.1,(A,g)=>A.fr.F],
 ['rect_fem',   (A,g)=>g.AIIS, (A,g)=>g.patella, .022,1.2,(A,g)=>g.th.f],
 ['vast_lat',   (A,g)=>sp(g.th,0.12,0.0,0.035,g.s), (A,g)=>sp(g.th,0.93,0.03,0.025,g.s), .028,1.3,(A,g)=>g.th.x],
 ['vast_med',   (A,g)=>sp(g.th,0.3,0.01,-0.02,g.s), (A,g)=>sp(g.th,0.94,0.03,-0.025,g.s), .025,1.2,(A,g)=>g.th.x],
 ['hams_lat',   (A,g)=>g.ischium, (A,g)=>g.fibHead.clone().addScaledVector(g.sk.f,-0.01), .022,1.1,(A,g)=>g.th.f],
 ['hams_med',   (A,g)=>g.ischium, (A,g)=>g.medTib.clone().addScaledVector(g.sk.f,-0.005), .022,1.1,(A,g)=>g.th.f],
 ['adductors',  (A,g)=>g.pubis, (A,g)=>sp(g.th,0.75,-0.01,-0.03,g.s), .03,1.4,(A,g)=>g.th.f],
 ['gastroc',    (A,g)=>sp(g.th,0.95,-0.035,0,g.s), (A,g)=>sp(g.sk,0.62,-0.035,0,g.s), .028,1.3,(A,g)=>g.sk.x],
 ['soleus',     (A,g)=>sp(g.sk,0.15,-0.02,0.01,g.s), (A,g)=>sp(g.sk,0.8,-0.03,0,g.s), .026,1.5,(A,g)=>g.sk.x],
 ['tib_ant',    (A,g)=>sp(g.sk,0.12,0.025,0.012,g.s), (A,g)=>sp(g.ft,0.55,0.01,-0.02,g.s).addScaledVector(A.fr.U,0.03), .014,1,(A,g)=>g.sk.x],
 ['rect_abd',   (A,g)=>g.pubis.clone().addScaledVector(g.Xo,-0.01), (A,g)=>A.xiphoid.clone().addScaledVector(g.Xo,0.035), .02,2.6,(A,g)=>A.fr.Ft],
 ['obliques',   (A,g)=>g.crest.clone().addScaledVector(A.fr.F,0.02), (A,g)=>A.xiphoid.clone().addScaledVector(g.Xo,0.11).addScaledVector(A.fr.Ft,-0.03), .02,2.8,(A,g)=>g.Xo],
 ['erector',    (A,g)=>A.sacrum.clone().addScaledVector(g.Xo,0.025), (A,g)=>A.spine(0.88).addScaledVector(g.Xto,0.025).addScaledVector(A.fr.Ft,-0.025), .018,1.5,(A,g)=>A.fr.Ft],
 ['delt_ant',   (A,g)=>g.acromion.clone().addScaledVector(A.fr.Ft,0.03).addScaledVector(g.Xto,-0.02), (A,g)=>g.deltTub, .02,1.4,(A,g)=>g.ua.f],
 ['delt_mid',   (A,g)=>g.acromion.clone().addScaledVector(g.Xto,0.01), (A,g)=>g.deltTub, .02,1.4,(A,g)=>g.Xto],
 ['delt_post',  (A,g)=>g.scapSpine.clone().addScaledVector(A.fr.Ut,0.015), (A,g)=>g.deltTub, .02,1.4,(A,g)=>g.ua.f],
 ['pec_major',  (A,g)=>A.sternTop.clone().lerp(A.xiphoid,.4), (A,g)=>sp(g.ua,0.12,0.02,0,g.s), .025,2.6,(A,g)=>A.fr.Ft],
 ['latissimus', (A,g)=>A.T12.clone().lerp(g.crest,.3).addScaledVector(A.fr.Ft,-0.03), (A,g)=>sp(g.ua,0.12,0,-0.015,g.s), .025,2.8,(A,g)=>A.fr.Ft],
 ['trapezius',  (A,g)=>A.T7.clone().addScaledVector(A.fr.Ft,-0.03), (A,g)=>g.acromion.clone().addScaledVector(A.fr.Ut,0.01), .022,2.8,(A,g)=>A.fr.Ft],
 ['trap_upper', (A,g)=>A.head.clone().addScaledVector(A.fr.Ft,-0.06).addScaledVector(A.fr.Ut,-0.03), (A,g)=>g.acromion.clone().addScaledVector(g.Xto,-0.03), .015,1.6,(A,g)=>A.fr.Ft],
 ['biceps',     (A,g)=>g.coracoid, (A,g)=>g.radTub, .018,1.2,(A,g)=>g.ua.x],
 ['triceps',    (A,g)=>g.scapInf.clone().lerp(g.glenoid,.7), (A,g)=>g.olecranon, .02,1.3,(A,g)=>g.ua.x],
 ['supraspin',  (A,g)=>g.scapSup.clone().addScaledVector(A.fr.Ut,0.02), (A,g)=>g.humNeck.clone().addScaledVector(A.fr.Ut,0.02), .01,1.3,(A,g)=>A.fr.Ut],
 ['infraspin',  (A,g)=>g.scapInf.clone().lerp(g.scapSup,.5), (A,g)=>g.humNeck.clone().addScaledVector(A.fr.Ft,-0.01), .014,2,(A,g)=>A.fr.Ft],
 ['subscap',    (A,g)=>g.scapInf.clone().lerp(g.scapSup,.5).addScaledVector(A.fr.Ft,0.02), (A,g)=>g.humNeck.clone().addScaledVector(A.fr.Ft,0.015), .012,2,(A,g)=>A.fr.Ft],
];
const sideLig=[
 ['acl',(A,g)=>g.latCond.clone().addScaledVector(g.th.f,-0.012).lerp(g.knee,.5),(A,g)=>sp(g.sk,0.03,0.015,-0.003,g.s),.004],
 ['pcl',(A,g)=>g.medCond.clone().addScaledVector(g.th.f,0.01).lerp(g.knee,.5),(A,g)=>sp(g.sk,0.04,-0.018,0,g.s),.004],
 ['mcl',(A,g)=>g.medCond.clone().addScaledVector(g.th.f,-0.005),(A,g)=>g.medTib,.005],
 ['lcl',(A,g)=>g.latCond,(A,g)=>g.fibHead,.004],
 ['patellar',(A,g)=>g.patella,(A,g)=>g.tibTub,.007],
 ['achilles',(A,g)=>sp(g.sk,0.78,-0.03,0,g.s),(A,g)=>g.calc.clone().addScaledVector(g.ft.f,0).addScaledVector(g.ft.y,-0.005),.006],
 ['atfl',(A,g)=>g.latMal.clone().addScaledVector(g.sk.f,0.01),(A,g)=>g.talus.clone().addScaledVector(g.Xo,0.015),.004],
 ['iliofemoral',(A,g)=>g.AIIS,(A,g)=>sp(g.th,0.1,0.02,0.01,g.s),.006],
 ['capsule',(A,g)=>g.glenoid.clone().addScaledVector(A.fr.Ut,-0.02),(A,g)=>sp(g.ua,0.09,0,-0.01,g.s),.007],
 ['coracoacromial',(A,g)=>g.coracoid,(A,g)=>g.acromion,.004],
];
const sideNerve=[
 ['sciatic',(A,g)=>[A.sacrum.clone().addScaledVector(g.Xo,0.04), g.ischium.clone().lerp(g.GT,.45).addScaledVector(A.fr.F,-0.02), sp(g.th,0.35,-0.03,0,g.s), sp(g.th,0.62,-0.035,0,g.s)]],
 ['tibial',(A,g)=>[sp(g.th,0.62,-0.035,0,g.s), sp(g.th,1,-0.04,0,g.s), sp(g.sk,0.4,-0.03,-0.005,g.s), g.medMal.clone().addScaledVector(g.sk.f,-0.02), sp(g.ft,0.45,0,-0.01,g.s)]],
 ['peroneal',(A,g)=>[sp(g.th,0.62,-0.035,0,g.s), sp(g.th,0.95,-0.03,0.03,g.s), g.fibHead.clone().addScaledVector(g.Xo,0.01).addScaledVector(g.sk.y,0.02), sp(g.sk,0.3,0.02,0.02,g.s), sp(g.sk,0.95,0.025,0,g.s), sp(g.ft,0.7,0,0,g.s).addScaledVector(A.fr.U,0.02)]],
 ['femoral',(A,g)=>[A.L3.clone().addScaledVector(g.Xo,0.03).addScaledVector(A.fr.F,0.02), g.ASIS.clone().lerp(g.pubis,.5).addScaledVector(A.fr.F,0.01), sp(g.th,0.15,0.035,-0.01,g.s), sp(g.th,0.3,0.03,-0.02,g.s)]],
 ['plexus',(A,g)=>[A.spine(0.93).addScaledVector(g.Xto,0.03), A.spine(0.9).addScaledVector(g.Xto,0.07).addScaledVector(A.fr.Ft,0.02), g.clavMed.clone().lerp(g.acromion,.6).addScaledVector(A.fr.Ut,-0.02), g.sh.clone().addScaledVector(g.Xto,-0.03).addScaledVector(A.fr.Ut,-0.05)]],
 ['median',(A,g)=>[g.sh.clone().addScaledVector(g.Xto,-0.03).addScaledVector(A.fr.Ut,-0.05), sp(g.ua,0.5,0.01,-0.025,g.s), sp(g.ua,0.98,0.02,-0.01,g.s), sp(g.fa,0.5,0.012,0,g.s), sp(g.fa,1,0.01,0,g.s), g.wr.clone().lerp(g.index,.7)]],
 ['ulnar',(A,g)=>[g.sh.clone().addScaledVector(g.Xto,-0.03).addScaledVector(A.fr.Ut,-0.05), sp(g.ua,0.55,-0.01,-0.03,g.s), g.medEpi.clone().addScaledVector(g.ua.f,-0.015), sp(g.fa,0.5,0,-0.02,g.s), sp(g.fa,1,0,-0.02,g.s), g.wr.clone().lerp(g.pinky,.7)]],
 ['radial',(A,g)=>[g.sh.clone().addScaledVector(g.Xto,-0.03).addScaledVector(A.fr.Ut,-0.05), sp(g.ua,0.35,-0.025,0,g.s), sp(g.ua,0.6,0,0.03,g.s), g.latEpi.clone().addScaledVector(g.ua.f,0.015), sp(g.fa,0.6,0,0.02,g.s), sp(g.fa,1,-0.005,0.02,g.s)]],
];

export const MUSCLE_IDS=sideMus.map(m=>m[0]), LIG_IDS=sideLig.map(m=>m[0]), NERVE_IDS=sideNerve.map(m=>m[0]);

// ---------- Scene ----------
export class Anatomy{
  constructor(canvas){
    this.canvas=canvas;
    this.r=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,alpha:true});
    this.r.setPixelRatio(Math.min(2,devicePixelRatio||1)); this.quality='high';
    this.scene=new THREE.Scene();
    this.cam=new THREE.PerspectiveCamera(40,1,0.05,50); this.cam.position.set(0.9,0.3,2.6);
    this.ctl=new OrbitControls(this.cam,canvas); this.ctl.target.set(0,-0.1,0); this.ctl.enableDamping=true; this.ctl.update();
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x334455,1.1)); const dl=new THREE.DirectionalLight(0xffffff,1.4); dl.position.set(1,2,2); this.scene.add(dl); const dl2=new THREE.DirectionalLight(0x99aaff,0.5); dl2.position.set(-1,1,-2); this.scene.add(dl2);
    this.body=new THREE.Group(); this.scene.add(this.body);
    this.layers={skeleton:new THREE.Group(),muscles:new THREE.Group(),ligaments:new THREE.Group(),nerves:new THREE.Group(),landmarks:new THREE.Group(),ghost:new THREE.Group(),bos:new THREE.Group()};
    for(const k in this.layers) this.body.add(this.layers[k]);
    this.pick=[]; this.items={}; this.L0={};
    this.grid=new THREE.GridHelper(3,12,0x335,0x223); this.scene.add(this.grid);
    this._build();
    this.ray=new THREE.Raycaster(); this.ray.params.Line.threshold=0.012;
    this.onPick=null; this.selected=null;
    let down=null; canvas.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
    canvas.addEventListener('pointerup',e=>{ if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<6) this._click(e); down=null; });
    this.fpsT=performance.now(); this.fpsN=0; this.fps=60; this.lowCount=0; this.autoQ=true;
    const ro=new ResizeObserver(()=>this.resize()); ro.observe(canvas); this.resize();
    this.P=null;
    const loop=()=>{ if(this.dead) return; this.ctl.update(); this.r.render(this.scene,this.cam); this._fps(); requestAnimationFrame(loop); }; loop();
  }
  resize(){ const w=this.canvas.clientWidth||300,h=this.canvas.clientHeight||300; this.r.setSize(w,h,false); this.cam.aspect=w/h; this.cam.updateProjectionMatrix(); }
  _fps(){ this.fpsN++; const n=performance.now(); if(n-this.fpsT>1000){ this.fps=this.fpsN*1000/(n-this.fpsT); this.fpsN=0; this.fpsT=n;
    if(this.autoQ){ if(this.fps<18&&this.P){ if(++this.lowCount>=3) this.setQuality(this.quality==='high'?'medium':'low'), this.lowCount=0; } else this.lowCount=0; } } }
  setQuality(q){ this.quality=q; this.r.setPixelRatio(q==='high'?Math.min(2,devicePixelRatio||1):q==='medium'?1:0.6); this.resize(); this.skipEvery=q==='low'?2:1; }
  _mesh(geo,color,layer,info,opts={}){
    const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:opts.rough??0.6,metalness:0,transparent:true,opacity:opts.op??1}));
    m.matrixAutoUpdate=false; m.userData=info; this.layers[layer].add(m); if(info) this.pick.push(m); return m; }
  _build(){
    const bg=boneGeo(), sg=spindleGeo(), cg=cylGeo(), sph=new THREE.SphereGeometry(1,14,10);
    const bone=(id,label,side)=>this._mesh(bg,BONE,'skeleton',{kind:'bone',id,side,label});
    this.bones={};
    for(const s of ['L','R']){
      const b={}; for(const [id,lab] of [['femur','Femur'],['tibia','Tibia'],['fibula','Fibula'],['humerus','Humerus'],['radius','Radius'],['ulna','Ulna'],['clavicle','Clavicle']]) b[id]=bone(id,lab,s);
      b.patella=this._mesh(sph,BONE,'skeleton',{kind:'bone',id:'patella',side:s});
      b.foot=this._mesh(new THREE.BoxGeometry(1,1,1).translate(0,0.5,0),BONE,'skeleton',{kind:'bone',id:'foot',side:s});
      b.toes=this._mesh(cg,BONE,'skeleton',{kind:'bone',id:'foot',side:s});
      b.palm=this._mesh(new THREE.BoxGeometry(1,1,1).translate(0,0.5,0),BONE,'skeleton',{kind:'bone',id:'hand',side:s});
      b.fingers=[0,1,2,3,4].map(()=>this._mesh(cg,BONE,'skeleton',{kind:'bone',id:'hand',side:s}));
      b.scap=this._mesh(new THREE.TetrahedronGeometry(1),BONE,'skeleton',{kind:'bone',id:'scapula',side:s});
      b.ilium=this._mesh(new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI/2),BONE,'skeleton',{kind:'bone',id:'pelvis',side:s},{op:0.95});
      b.ilium.material.side=THREE.DoubleSide;
      b.joints=['hip','knee','ank','sh','el','wr'].map(j=>{const m=this._mesh(sph,'#7fb3ff','skeleton',{kind:'joint',id:j,side:s},{op:0.55}); m.userData.j=j; return m;});
      this.bones[s]=b;
    }
    this.skull=this._mesh(sph,BONE,'skeleton',{kind:'bone',id:'skull'});
    this.jaw=this._mesh(new THREE.TorusGeometry(1,0.18,6,14,Math.PI),BONE,'skeleton',{kind:'bone',id:'skull'});
    this.eyes=[0,1].map(()=>this._mesh(sph,'#222','skeleton',null));
    this.verts=[]; for(let i=0;i<24;i++) this.verts.push(this._mesh(cg,BONE,'skeleton',{kind:'bone',id:'vertebra',n:i}));
    this.spinous=[]; for(let i=0;i<24;i++) this.spinous.push(this._mesh(cg,BONE,'skeleton',{kind:'bone',id:'vertebra',n:i}));
    this.sacrumM=this._mesh(new THREE.ConeGeometry(1,1,4).translate(0,0.5,0),BONE,'skeleton',{kind:'bone',id:'pelvis'});
    this.pubic=this._mesh(new THREE.TorusGeometry(1,0.12,6,16,Math.PI),BONE,'skeleton',{kind:'bone',id:'pelvis'});
    this.ribs=[]; for(let i=0;i<10;i++) this.ribs.push(this._mesh(new THREE.TorusGeometry(1,0.05,5,22,Math.PI*1.6),BONE,'skeleton',{kind:'bone',id:'ribcage'}));
    this.sternum=this._mesh(cg,BONE,'skeleton',{kind:'bone',id:'ribcage'});
    // muscles
    this.mus={}; for(const s of ['L','R']) for(const [id,,, r,flat] of sideMus){ const m=this._mesh(sg,MUS,'muscles',{kind:'muscle',id,side:s},{op:0.88,rough:0.5}); m.userData.r=r; m.userData.flat=flat; this.mus[id+s]=m; }
    this.lig={}; for(const s of ['L','R']) for(const [id,,,r] of sideLig){ const m=this._mesh(cg,LIG,'ligaments',{kind:'ligament',id,side:s},{op:0.95,rough:0.3}); m.userData.r=r; this.lig[id+s]=m; }
    this.nerve={}; for(const s of ['L','R']) for(const [id] of sideNerve){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(30*3),3)); const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:NER,transparent:true})); l.userData={kind:'nerve',id,side:s}; l.frustumCulled=false; this.layers.nerves.add(l); this.pick.push(l); this.nerve[id+s]=l; }
    this.lms=[]; for(let i=0;i<33;i++){ const m=new THREE.Mesh(sph,new THREE.MeshBasicMaterial({color:i<11?'#ff9f0a':i%2?'#30d158':'#0a84ff'})); m.scale.setScalar(0.012); this.layers.landmarks.add(m); this.lms.push(m); }
    this.layers.landmarks.visible=false;
    // COM + BOS
    this.com=new THREE.Mesh(sph,new THREE.MeshBasicMaterial({color:'#ff2d55'})); this.com.scale.setScalar(0.025); this.layers.bos.add(this.com);
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3)); this.comLine=new THREE.Line(lg,new THREE.LineDashedMaterial({color:'#ff2d55',dashSize:0.03,gapSize:0.02})); this.comLine.frustumCulled=false; this.layers.bos.add(this.comLine);
    const bg2=new THREE.BufferGeometry(); bg2.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3*40),3)); this.bosLine=new THREE.LineLoop(bg2,new THREE.LineBasicMaterial({color:'#30d158'})); this.bosLine.frustumCulled=false; this.layers.bos.add(this.bosLine);
    // ghost stick figure
    const gg=new THREE.BufferGeometry(); gg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(GHOST_EDGES.length*6),3)); this.ghost=new THREE.LineSegments(gg,new THREE.LineBasicMaterial({color:'#64d2ff',transparent:true,opacity:0.8})); this.ghost.frustumCulled=false; this.layers.ghost.add(this.ghost); this.layers.ghost.visible=false;
  }
  setLayer(k,v){ this.layers[k].visible=v; }
  update(P,state){
    if(!P) return; this.P=P; this._n=(this._n||0)+1;
    const A=anchors(P); this.A=A; const k=A.k;
    for(let i=0;i<33;i++) this.lms[i].position.copy(P[i]);
    const {fr}=A;
    // skull
    const ears=P[8].clone().sub(P[7]).normalize(); const fwd=P[0].clone().sub(A.head); fwd.addScaledVector(ears,-fwd.dot(ears)).normalize(); const up=new THREE.Vector3().crossVectors(fwd,ears).normalize().multiplyScalar(-1);
    const hc=A.head.clone().addScaledVector(up,0.03*k).addScaledVector(fwd,0.0);
    placeBasis(this.skull,hc,ears,up,fwd,0.075*k,0.095*k,0.1*k);
    placeBasis(this.jaw,hc.clone().addScaledVector(up,-0.07*k).addScaledVector(fwd,0.03*k),ears,fwd,up,0.05*k,0.06*k,0.05*k);
    this.eyes.forEach((e,i)=>placeBasis(e,hc.clone().addScaledVector(fwd,0.085*k).addScaledVector(ears,(i?1:-1)*0.032*k).addScaledVector(up,0.005),ears,up,fwd,0.017*k,0.015*k,0.012*k));
    // spine
    for(let i=0;i<24;i++){ const t0=0.02+i/24*0.97, t1=t0+0.03; const a=A.spine(t0), b=A.spine(t1); const r=(i<5?0.022:i<17?0.017:0.012)*k; placeAlong(this.verts[i],a,b,r,r*0.85,fr.Ft); const m=a.clone().lerp(b,.5); placeAlong(this.spinous[i],m,m.clone().addScaledVector(fr.Ft,-0.035*k).addScaledVector(fr.Ut,-0.01),0.004*k,0.006*k,fr.Ut); }
    placeAlong(this.sacrumM,A.sacrum.clone().addScaledVector(fr.U,-0.06*k),A.spine(0.02),0.04*k,0.025*k,fr.F);
    // ribs
    for(let i=0;i<10;i++){ const t=0.45+i*0.045; const c=A.spine(t).addScaledVector(fr.Ft,0.075*k).addScaledVector(fr.Ut,-0.02); const w=(0.07+0.05*Math.sin(Math.PI*Math.min(1,(i+1)/8)))*k*1.05;
      const xx=fr.Xt, zz=fr.Ft; const ax=new THREE.Vector3().crossVectors(xx,zz).normalize();
      // torus lies in XY plane; arc opening toward front: rotate so gap anterior
      tmpM.makeBasis(zz.clone().multiplyScalar(-w*0.85),xx.clone().multiplyScalar(w),ax.clone().multiplyScalar(w)); const rot=new THREE.Matrix4().makeRotationZ(Math.PI*0.2); tmpM.multiply(rot); tmpM.setPosition(c.addScaledVector(fr.Ut,-i*0.004)); this.ribs[i].matrix.copy(tmpM); this.ribs[i].matrixWorldNeedsUpdate=true; }
    placeAlong(this.sternum,A.sternTop,A.xiphoid.clone().addScaledVector(fr.Ft,-0.02),0.015*k,0.006*k,fr.Ft);
    // pelvis
    placeBasis(this.pubic,A.fr.H.clone().addScaledVector(fr.F,0.02).addScaledVector(fr.U,-0.03*k),fr.Xp,fr.F.clone().multiplyScalar(-1),fr.U,0.07*k,0.06*k,0.06*k);
    for(const s of ['L','R']){
      const g=A[s]; g.s=s; const b=this.bones[s];
      const c=g.hip.clone().lerp(A.fr.H,0.35).addScaledVector(fr.U,0.04*k);
      placeBasis(b.ilium,c,g.Xo.clone().multiplyScalar(-1),fr.U,fr.F,0.07*k,0.1*k,0.08*k);
      placeAlong(b.femur,g.hip,g.knee,0.014*k,0.014*k,g.th.f);
      placeAlong(b.tibia,sp(g.sk,0.0,0,-0.008,s),g.ank.clone().addScaledVector(g.Xo,-0.01),0.013*k,0.013*k,g.sk.f);
      placeAlong(b.fibula,g.fibHead,g.latMal,0.006*k,0.006*k,g.sk.f);
      b.patella.matrix.makeScale(0.022*k,0.026*k,0.012*k).setPosition(g.patella); b.patella.matrixWorldNeedsUpdate=true;
      placeAlong(b.foot,g.heel,g.toe.clone().lerp(g.heel,.15),0.03*k,0.018*k,fr.U);
      placeAlong(b.toes,g.toe.clone().lerp(g.heel,.15),g.toe,0.035*k,0.008*k,fr.U);
      placeAlong(b.humerus,g.sh,g.el,0.012*k,0.012*k,g.ua.f);
      placeAlong(b.radius,sp(g.fa,0,0.005,0.01,s),g.wr.clone().addScaledVector(g.fa.x,(s==='R'?1:-1)*0.012),0.007*k,0.007*k,g.fa.f);
      placeAlong(b.ulna,g.olecranon,g.wr.clone().addScaledVector(g.fa.x,(s==='R'?-1:1)*0.012),0.007*k,0.007*k,g.fa.f);
      placeAlong(b.clavicle,g.clavMed,g.acromion,0.007*k,0.007*k,fr.Ut);
      const sx=g.scapSup, si=g.scapInf, sa=g.acromion; const sc=sx.clone().add(si).add(sa).multiplyScalar(1/3);
      placeBasis(b.scap,sc,g.Xto,fr.Ut,fr.Ft,0.05*k,0.07*k,0.008*k);
      const pc=g.index.clone().add(g.pinky).multiplyScalar(.5); placeAlong(b.palm,g.wr,pc,0.03*k,0.008*k,new THREE.Vector3().crossVectors(g.index.clone().sub(g.wr),g.pinky.clone().sub(g.wr)));
      const hd=pc.clone().sub(g.wr).normalize();
      [g.thumb,g.index,g.index.clone().lerp(g.pinky,.33),g.index.clone().lerp(g.pinky,.66),g.pinky].forEach((p,i)=>placeAlong(b.fingers[i],p,p.clone().addScaledVector(i?hd:g.thumb.clone().sub(g.wr).normalize(),i?0.06*k:0.035*k),0.005*k,0.005*k,fr.Ut));
      const jp={hip:g.hip,knee:g.knee,ank:g.ank,sh:g.sh,el:g.el,wr:g.wr}, jr={hip:.028,knee:.025,ank:.018,sh:.026,el:.018,wr:.013};
      b.joints.forEach(m=>{ const j=m.userData.j; m.matrix.makeScale(jr[j]*k,jr[j]*k,jr[j]*k).setPosition(jp[j]); m.matrixWorldNeedsUpdate=true; });
      if(!(this.skipEvery>1 && this._n%2)){
      for(const [id,o,ins,r,flat,ref] of sideMus){ const m=this.mus[id+s]; const a=o(A,g), e=ins(A,g); const len=a.distanceTo(e); const key=id+s; if(!this.L0[key]) this.L0[key]=len; const vs=Math.sqrt(this.L0[key]/Math.max(len,1e-3)); const rr=r*k*Math.min(1.6,Math.max(0.6,vs)); m.userData.len=len; m.userData.strain=len/this.L0[key]; placeAlong(m,a,e,rr*Math.sqrt(flat),rr/Math.sqrt(flat),ref(A,g)); }
      for(const [id,o,ins,r] of sideLig){ placeAlong(this.lig[id+s],o(A,g),ins(A,g),r*k,r*k*0.5,fr.F); }
      for(const [id,pts] of sideNerve){ const ps=pts(A,g); const curve=new THREE.CatmullRomCurve3(ps); const arr=this.nerve[id+s].geometry.attributes.position; for(let i=0;i<30;i++){ const p=curve.getPoint(i/29); arr.setXYZ(i,p.x,p.y,p.z);} arr.needsUpdate=true; this.nerve[id+s].geometry.computeBoundingSphere(); }
      }
    }
    if(state) this.applyState(state);
    this.grid.position.y=Math.min(P[29].y,P[30].y,P[31].y,P[32].y)-0.01;
  }
  applyState(st){
    // muscle colouring by role
    const ROLE={agonist:[1,0.18,0.15],antagonist:[0.2,0.45,1],synergist:[1,0.6,0.1],stabiliser:[0.2,0.85,0.35]};
    for(const key in this.mus){ const m=this.mus[key]; const r=st.muscles?.[key]; const c=m.material.color, e=m.material.emissive;
      if(r){ const rc=ROLE[r.role]; const I=Math.max(0.25,r.I); c.setRGB(0.25+rc[0]*0.75*I,0.15+rc[1]*0.8*I,0.15+rc[2]*0.8*I); e.setRGB(rc[0]*I*0.45,rc[1]*I*0.45,rc[2]*I*0.45); }
      else { c.set(MUS); e.setRGB(0,0,0); } }
    for(const key in this.lig){ const v=st.ligaments?.[key]??0; const m=this.lig[key]; heat(m.material.color,v); m.material.emissive.copy(m.material.color).multiplyScalar(v*0.5); }
    if(st.com){ this.com.position.copy(st.com); const g=this.grid.position.y; const a=this.comLine.geometry.attributes.position; a.setXYZ(0,st.com.x,st.com.y,st.com.z); a.setXYZ(1,st.com.x,g,st.com.z); a.needsUpdate=true; this.comLine.computeLineDistances();
      const b=this.bosLine.geometry.attributes.position; const pts=st.bos||[]; for(let i=0;i<40;i++){ const p=pts[Math.min(i,pts.length-1)]||[st.com.x,st.com.z]; b.setXYZ(i,p[0],g+0.002,p[1]); } b.needsUpdate=true; this.bosLine.geometry.setDrawRange(0,Math.max(1,pts.length)); }
  }
  setGhost(G){ if(!G){ this.layers.ghost.visible=false; return; } this.layers.ghost.visible=this.ghostOn; const a=this.ghost.geometry.attributes.position; GHOST_EDGES.forEach(([i,j],n)=>{ a.setXYZ(2*n,G[i].x,G[i].y,G[i].z); a.setXYZ(2*n+1,G[j].x,G[j].y,G[j].z); }); a.needsUpdate=true; }
  view(v){ const t=this.ctl.target.clone(), d=2.6; const p={anterior:[0,0,d],posterior:[0,0,-d],latR:[-d,0,0],latL:[d,0,0],superior:[0,d,0.01],oblique:[0.9,0.3,2.6]}[v]; this.cam.position.set(t.x+p[0],t.y+p[1],t.z+p[2]); this.ctl.update(); }
  _click(e){ const r=this.canvas.getBoundingClientRect(); const m=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1); this.ray.setFromCamera(m,this.cam);
    const vis=this.pick.filter(o=>{ let p=o; while(p){ if(!p.visible) return false; p=p.parent;} return o.material.opacity>0.2; });
    const hit=this.ray.intersectObjects(vis,false)[0]; if(hit) this.isolate(hit.object.userData); else this.isolate(null); }
  isolate(info){ this.selected=info; for(const o of this.pick){ const u=o.userData; const on=!info || (u.id===info.id && (!info.side||u.side===info.side||!u.side)); const base=o.isLine?1:(u.kind==='joint'?0.55:u.kind==='muscle'?0.88:u.kind==='bone'&&u.id==='pelvis'?0.95:1); o.material.opacity=on?base:0.07; o.material.depthWrite=on; }
    this.onPick&&this.onPick(info); }
  dispose(){ this.dead=true; try{ this.r.dispose(); }catch(e){} }
  snapshot(){ this.r.render(this.scene,this.cam); return this.r.domElement.toDataURL('image/jpeg',0.85); }
}
function heat(c,v){ v=Math.max(0,Math.min(1,v)); if(v<0.5) c.setRGB(0.3+v*1.4,0.85,0.3); else c.setRGB(1,0.85-(v-0.5)*1.5,0.2); }
export const GHOST_EDGES=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[27,31],[28,30],[30,32],[28,32],[0,11],[0,12]];
export { INFO };
