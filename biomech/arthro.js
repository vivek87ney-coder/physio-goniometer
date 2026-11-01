// Arthrokinematics demo: procedural joint-surface models (convex/concave), roll / glide / spin, concave–convex rule,
// accessory motions and capsule/ligament restraints. Driven by a live joint angle or a slider. (Schematic – not patient-specific.)
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
const d2r=Math.PI/180;
// c0: direction (deg, in the sagittal-like demo plane) from convex centre to contact; mov:'convex'|'concave'; range; spin: rotation about c0 axis
export const AJ={
 gh:{n:'Glenohumeral',mot:'Abduction',live:'shAbd',range:[0,170],c0:180,mov:'convex',R:.45,cap:.55,fixed:'Glenoid (scapula) – concave',moving:'Humeral head – convex',
  roll:'superior',glide:'inferior',rule:'Convex humeral head on concave glenoid → roll and glide in OPPOSITE directions. Abduction: head rolls superiorly, glides inferiorly (keeps it centred under the acromion).',
  acc:['Inferior glide – to gain abduction / elevation','Posterior glide – flexion & internal rotation','Anterior glide – extension & external rotation','Lateral distraction – pain relief (grade I–II)'],
  res:[['Inferior capsule / IGHL (axillary pouch)','inf'],['Superior capsule / coracohumeral lig.','sup']],close:'90° abduction + full external rotation',loose:'55–70° abduction, 30° horizontal adduction'},
 hu:{n:'Humeroulnar',mot:'Flexion',live:'elbow',range:[0,150],c0:-90,mov:'concave',R:.35,cap:.75,fixed:'Trochlea (humerus) – convex',moving:'Trochlear notch (ulna) – concave',
  roll:'anterior',glide:'anterior',rule:'Concave trochlear notch on convex trochlea → roll and glide in the SAME direction (anterior in flexion, posterior in extension).',
  acc:['Distraction (long-axis traction of ulna) – general mobility','Medial gapping (valgus) – tests UCL','Lateral gapping (varus) – tests RCL'],
  res:[['Posterior capsule / posterior UCL bundle – taut in flexion','post'],['Anterior capsule / anterior UCL – taut in extension','ant']],close:'Full extension + supination',loose:'70° flexion, 10° supination'},
 hr:{n:'Humeroradial',mot:'Flexion (+ spin in pro/supination)',live:'elbow',range:[0,150],c0:-90,mov:'concave',R:.3,cap:.5,spin:true,fixed:'Capitulum (humerus) – convex',moving:'Radial head fovea – concave',
  roll:'anterior',glide:'anterior',rule:'Concave radial head on convex capitulum → roll and glide the SAME direction. In pronation/supination the radial head SPINS on the capitulum.',
  acc:['Distraction','Dorsal / volar glide of radial head'],res:[['Annular ligament & RCL','post'],['Anterior capsule','ant']],close:'90° flexion + 5° supination',loose:'Full extension + full supination'},
 pru:{n:'Proximal radioulnar',mot:'Pronation',live:null,range:[0,160],c0:90,mov:'convex',R:.25,cap:.45,spin:true,fixed:'Radial notch of ulna – concave',moving:'Radial head rim – convex',
  roll:'anterior (volar)',glide:'posterior (dorsal)',rule:'Convex radial head rim in concave radial notch → OPPOSITE: pronation = roll volar, glide dorsal; supination = roll dorsal, glide volar. Mainly SPIN within the annular ligament.',
  acc:['Dorsal glide of radial head – to gain pronation','Volar glide of radial head – to gain supination'],res:[['Annular ligament','inf'],['Quadrate ligament / interosseous membrane','sup']],close:'5° supination, 70° flexion',loose:'35° supination, 70° flexion'},
 rc:{n:'Radiocarpal',mot:'Extension',live:null,range:[-70,80],c0:90,mov:'convex',R:.3,cap:.6,fixed:'Distal radius + TFCC – concave',moving:'Scaphoid / lunate – convex',
  roll:'dorsal',glide:'palmar',rule:'Convex proximal carpals on concave radius → OPPOSITE: extension = roll dorsal, glide palmar; flexion = roll palmar, glide dorsal.',
  acc:['Palmar glide of carpals – to gain extension','Dorsal glide – to gain flexion','Ulnar glide – radial deviation','Radial glide – ulnar deviation'],res:[['Palmar radiocarpal ligaments – taut in extension','inf'],['Dorsal radiocarpal ligament – taut in flexion','sup']],close:'Full extension + radial deviation',loose:'Neutral, slight ulnar deviation'},
 hip:{n:'Hip (coxofemoral)',mot:'Flexion',live:'hipFlex',range:[-15,120],c0:90,mov:'convex',R:.42,cap:.85,fixed:'Acetabulum – concave',moving:'Femoral head – convex',
  roll:'anterior',glide:'posterior',rule:'Convex femoral head on concave acetabulum → OPPOSITE: flexion = roll anterior, glide posterior; abduction = roll superior, glide inferior.',
  acc:['Posterior glide – flexion & internal rotation','Anterior glide – extension & external rotation','Inferior glide / long-axis distraction'],res:[['Ischiofemoral lig. & posterior capsule – taut in flexion + IR','post'],['Iliofemoral (Y) & pubofemoral ligaments – taut in extension','ant']],close:'Extension + IR + abduction',loose:'30° flexion, 30° abduction, slight ER'},
 tf:{n:'Tibiofemoral',mot:'Flexion (open chain)',live:'knee',range:[0,140],c0:-90,mov:'concave',R:.4,cap:.45,spin:true,fixed:'Femoral condyles – convex',moving:'Tibial plateau – concave (open chain)',
  roll:'posterior',glide:'posterior',rule:'Open chain: concave tibia on convex femur → SAME direction (flexion: tibia rolls & glides posterior). Closed chain (squat): convex femur on tibia → OPPOSITE (femur rolls posterior, glides anterior). Terminal extension: screw-home SPIN (tibia ER open-chain / femur IR closed-chain).',
  acc:['Posterior glide of tibia – to gain flexion','Anterior glide of tibia – to gain extension','Lachman / anterior drawer – ACL','Posterior drawer – PCL'],res:[['ACL – resists anterior tibial translation, taut near extension','ant'],['PCL – resists posterior translation, taut in deep flexion','post']],close:'Full extension + tibial ER',loose:'25° flexion'},
 pf:{n:'Patellofemoral',mot:'Knee flexion',live:'knee',range:[0,130],c0:0,mov:'concave',R:.4,cap:.35,fixed:'Femoral trochlea – convex',moving:'Patella (retro-patellar surface)',
  roll:'inferior',glide:'inferior',rule:'Patella GLIDES inferiorly ~5–7 cm on the femoral trochlea in knee flexion (superior in extension); contact area moves from the inferior to the superior patellar pole with increasing flexion; it engages the trochlea at ~20°.',
  acc:['Superior / inferior glide – quadriceps lag, extension','Medial glide / tilt – lateral retinaculum tightness','Lateral glide – apprehension (MPFL)'],res:[['Medial patellofemoral ligament – resists lateral shift 0–30°','ant'],['Quadriceps / patellar tendon tension','post']],close:'Full knee flexion',loose:'Full extension'},
 tc:{n:'Talocrural',mot:'Dorsiflexion',live:'ankle',range:[-45,25],c0:90,mov:'convex',R:.35,cap:.7,fixed:'Tibia / fibula mortise – concave',moving:'Talar dome – convex',
  roll:'anterior',glide:'posterior',rule:'Open chain: convex talus in concave mortise → OPPOSITE: dorsiflexion = talus rolls anterior, glides posterior; plantarflexion = roll posterior, glide anterior. Closed chain (squat): tibia glides anteriorly on the talus.',
  acc:['Posterior glide of talus – to gain dorsiflexion','Anterior glide – plantarflexion','Distraction'],res:[['Posterior capsule / calcaneofibular / Achilles – taut in DF','post'],['ATFL / anterior capsule – taut in PF','ant']],close:'Maximal dorsiflexion',loose:'10° plantarflexion, mid inversion/eversion'}
};
export const AJ_FOR={elbow:['hu','hr','pru'],arm:['gh','hu'],shoulder:['gh'],forearm:['pru','hr'],wrist:['rc'],hand:['rc'],hip:['hip'],thigh:['hip','tf'],knee:['tf','pf'],leg:['tc','tf'],ankle:['tc'],foot:['tc'],pelvis:['hip'],si:['hip'],lumbar:['hip'],thoracic:['gh'],cervical:['gh'],cage:['gh'],abdomen:['hip']};
const V=(deg,r=1)=>new THREE.Vector3(Math.cos(deg*d2r)*r,Math.sin(deg*d2r)*r,0);
export class Arthro{
 constructor(canvas){ this.cv=canvas; const R=this.r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true}); R.setPixelRatio(Math.min(devicePixelRatio,1.5));
  this.sc=new THREE.Scene(); this.cam=new THREE.PerspectiveCamera(35,1,.1,50); this.cam.position.set(0,0,4.2); this.ctl=new OrbitControls(this.cam,canvas); this.sc.add(new THREE.HemisphereLight(0xffffff,0x223344,2)); const dl=new THREE.DirectionalLight(0xffffff,1.5); dl.position.set(2,3,4); this.sc.add(dl);
  new ResizeObserver(()=>this.resize()).observe(canvas); this.resize(); this.theta=0; this.k='hu'; this.build('hu');
  const loop=()=>{ requestAnimationFrame(loop); if(document.hidden||!this.cv.offsetParent) return; if(this.auto){ this.t=(this.t||0)+0.012; const [a,b]=this.J.range; this.set(a+(b-a)*(0.5-0.5*Math.cos(this.t))); } this.ctl.update(); this.r.render(this.sc,this.cam); }; loop(); }
 resize(){ const w=this.cv.clientWidth||300,h=this.cv.clientHeight||240; this.r.setSize(w,h,false); this.cam.aspect=w/h; this.cam.updateProjectionMatrix(); }
 build(k){ this.k=k; const J=this.J=AJ[k]; if(this.g) this.sc.remove(this.g); const g=this.g=new THREE.Group(); this.sc.add(g);
  const cart=new THREE.MeshStandardMaterial({color:'#7fc8ff',roughness:.4}), bone=new THREE.MeshStandardMaterial({color:'#eee4cc',roughness:.7}), cave=new THREE.MeshStandardMaterial({color:'#5aa0e0',roughness:.4,side:THREE.DoubleSide,transparent:true,opacity:.85});
  const R=J.R, c0=V(J.c0), q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),c0);
  const convex=new THREE.Group(); const ball=new THREE.Mesh(new THREE.SphereGeometry(R,40,24),cart); convex.add(ball); const sh1=new THREE.Mesh(new THREE.CylinderGeometry(R*.45,R*.5,1.6,20),bone); sh1.quaternion.copy(q); sh1.position.copy(c0.clone().multiplyScalar(-(R+.7))); convex.add(sh1);
  const concave=new THREE.Group(); const bowl=new THREE.Mesh(new THREE.SphereGeometry(R*1.04,40,16,0,Math.PI*2,0,J.cap),cave); bowl.quaternion.copy(q); concave.add(bowl); const sh2=new THREE.Mesh(new THREE.CylinderGeometry(R*.5,R*.55,1.4,20),bone); sh2.quaternion.copy(q); sh2.position.copy(c0.clone().multiplyScalar(R+.75)); concave.add(sh2);
  g.add(convex,concave); this.mov=J.mov==='convex'?convex:concave; this.fix=J.mov==='convex'?concave:convex; this.mov.children[0].material=this.mov.children[0].material.clone(); this.mov.children[1].material=new THREE.MeshStandardMaterial({color:'#ffd9a0',roughness:.7});
  // material contact dot on moving surface + contact marker
  this.dot=new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),new THREE.MeshBasicMaterial({color:'#ff3b30'})); this.dot.position.copy(c0.clone().multiplyScalar(R*(J.mov==='convex'?1:1.04))); this.mov.add(this.dot);
  this.cmark=new THREE.Mesh(new THREE.SphereGeometry(.04,12,8),new THREE.MeshBasicMaterial({color:'#30d158'})); g.add(this.cmark);
  // axis of rotation (medio-lateral, z) and spin axis
  const ax=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,2.2,8),new THREE.MeshBasicMaterial({color:'#ffd60a'})); ax.rotation.x=Math.PI/2; g.add(ax);
  if(J.spin){ const sp=new THREE.Mesh(new THREE.CylinderGeometry(.01,.01,2.4,8),new THREE.MeshBasicMaterial({color:'#bf5af2'})); sp.quaternion.copy(q); g.add(sp); }
  this.roll=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.5,0xff3b30,.12,.08); this.glide=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.5,0x0a84ff,.12,.08); g.add(this.roll,this.glide);
  // restraint bands: two sides of the rim
  this.bands=[]; for(const sgn of [1,-1]){ const ang=J.c0+sgn*J.cap*57.3*0.95; const pf=V(ang,R*1.1), pm=V(ang+sgn*0,R*1.1).add(c0.clone().multiplyScalar(J.mov==='convex'?-R*.9:R*.9));
   const a=J.mov==='convex'?pf:pm.clone(), b=J.mov==='convex'?pm.clone():pf; // a fixed-frame, b moving-frame
   const geo=new THREE.BufferGeometry().setFromPoints([a,b]); const ln=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#30d158',linewidth:3})); g.add(ln); this.bands.push({ln,a,b,L0:a.distanceTo(b),sgn}); }
  this.set(J.range[0]<0?0:J.range[0]); }
 set(deg){ const J=this.J; this.theta=deg; const th=deg*d2r*(J.mov==='convex'?0.6:0.6); this.mov.rotation.set(0,0,0); this.mov.rotateZ(th); if(J.spin) this.mov.rotateOnAxis(V(J.c0),th*0.4); this.mov.updateMatrix(); this.g.updateMatrixWorld(true);
  const c0=V(J.c0), dirT=new THREE.Vector3(-c0.y,c0.x,0); // tangent (+theta)
  if(J.mov==='convex'){ this.cmark.position.copy(c0.clone().multiplyScalar(J.R)); const dp=this.dot.getWorldPosition(new THREE.Vector3()); this.roll.position.copy(dp.clone().multiplyScalar(1.15)); this.roll.setDirection(dirT.clone().applyAxisAngle(new THREE.Vector3(0,0,1),th)); this.glide.position.copy(c0.clone().multiplyScalar(J.R*.6)); this.glide.setDirection(dirT.clone().negate()); }
  else { const cp=c0.clone().applyAxisAngle(new THREE.Vector3(0,0,1),th).multiplyScalar(J.R); this.cmark.position.copy(cp); const t=dirT.clone().applyAxisAngle(new THREE.Vector3(0,0,1),th); this.roll.position.copy(cp.clone().multiplyScalar(1.25)); this.roll.setDirection(t); this.glide.position.copy(cp.clone().multiplyScalar(1.45)); this.glide.setDirection(t); }
  const s=Math.sign(deg-(J.range[0]<0?0:J.range[0]))||1; this.roll.visible=this.glide.visible=Math.abs(deg-(J.range[0]<0?0:J.range[0]))>2;
  this.strain=[]; for(const b of this.bands){ const bw=b.b.clone().applyMatrix4(this.mov.matrix.clone()); if(J.mov!=='convex'){ /* a is moving */ } const A=J.mov==='convex'?b.a:b.a.clone().applyMatrix4(this.mov.matrix), B=J.mov==='convex'?bw:b.b; b.ln.geometry.setFromPoints([A,B]); const e=(A.distanceTo(B)-b.L0)/b.L0; this.strain.push(e); b.ln.material.color.setHSL(Math.max(0,0.33-Math.max(0,e)*1.2),1,.5); }
  return this.state(); }
 state(){ const J=this.J; return {k:this.k,J,theta:this.theta,strain:this.strain}; }
}
