// Region anatomy atlas: loads Z-Anatomy derived region GLBs (meshopt-compressed), layer dissection, select/isolate/search, cross-section.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';

export const LAYERS=[
 ['skin','Skin / superficial fascia','#e3b49a',0.28],['fascia','Deep fascia','#d9d4c0',0.45],['msup','Superficial muscles','#c43b2e',1],['mint','Intermediate muscles','#a8302a',1],['mdeep','Deep muscles','#8a2420',1],
 ['tendons','Tendons / attachments','#efe6c8',1],['neurovascular','Nerves & vessels','#f4d03f',1],['synovial','Synovial / bursae','#b388ff',0.7],['capsule','Joint capsule','#7fc8ff',0.55],
 ['ligaments','Ligaments','#d6efd0',1],['cartilage','Articular cartilage / menisci','#8fd0ff',0.9],['bones','Bones','#eee4cc',1]];
export const PEEL=['skin','fascia','msup','mint','mdeep','tendons','neurovascular','synovial','capsule'];
const EXCL={'Upper limb':/hip bone|femor|intercostal|abdominal|lumb|sacr|gluteal|thigh|pelvi|iliac|obturator|genito|pudend|ilio/i,
 'Lower limb':/humer|radius|ulna|carp|brachi|forearm|antebrach|palmar|thenar|pollicis|metacarpal/i};
let REG=null; export async function regions(){ if(!REG) REG=await (await fetch('models/regions.json')).json(); return REG; }
export const LIC_FALLBACK='Z-Anatomy (Lluís Vinent / Gauthier Kervyn), CC BY-SA 4.0, derived from BodyParts3D © DBCLS, CC BY-SA 2.1 JP';

function nvColor(n){ return /nerve|plexus|ganglion|cord/i.test(n)?'#f4d03f':/vein|venous|sinus/i.test(n)?'#3d6fdc':'#e0453a'; }

export class Atlas{
 constructor(canvas){ this.cv=canvas; const R=this.r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true}); R.setPixelRatio(Math.min(devicePixelRatio,1.5)); R.localClippingEnabled=true;
  this.scene=new THREE.Scene(); this.cam=new THREE.PerspectiveCamera(35,1,0.01,20); this.ctl=new OrbitControls(this.cam,canvas); this.ctl.enableDamping=true; this.ctl.screenSpacePanning=true;
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x334455,1.6)); const d=new THREE.DirectionalLight(0xffffff,1.6); d.position.set(1,2,3); this.cam.add(d); this.scene.add(this.cam);
  this.root=new THREE.Group(); this.scene.add(this.root); this.meshes=[]; this.layer={}; for(const [k,,,o] of LAYERS) this.layer[k]={on:true,op:o};
  this.peeled=0; this.sel=null; this.hl={}; this.section=null; this.onSelect=()=>{}; this.extra=new THREE.Group(); this.scene.add(this.extra);
  let down=null; canvas.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]); canvas.addEventListener('pointerup',e=>{ if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<6) this.pick(e); down=null; });
  new ResizeObserver(()=>this.resize()).observe(canvas); this.resize(); const loop=()=>{ requestAnimationFrame(loop); if(document.hidden) return; this.ctl.update(); this.r.render(this.scene,this.cam); }; loop(); }
 resize(){ const w=this.cv.clientWidth||300,h=this.cv.clientHeight||300; this.r.setSize(w,h,false); this.cam.aspect=w/h; this.cam.updateProjectionMatrix(); }
 async load(region,side='R'){ const reg=(await regions().catch(()=>null)); const info=reg?.regions?.[region]; this.region=region; this.side=side; this.info=info; this.lic=reg?.license||LIC_FALLBACK;
  this.root.clear(); this.meshes=[]; this.sel=null; this.hl={}; this.real=false;
  try{ const L=new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder); const g=await L.loadAsync('models/'+region+'.glb'); const ex=EXCL[info?.group];
   g.scene.traverse(o=>{ if(!o.isMesh) return; if(!o.userData?.layer&&o.parent?.userData?.layer) o.userData={...o.parent.userData}; const u=o.userData||{}; if(!u.layer||(ex&&ex.test(u.name))) { o.visible=false; return; }
    const c=u.layer==='neurovascular'?nvColor(u.name):LAYERS.find(l=>l[0]===u.layer)[2]; o.material=new THREE.MeshStandardMaterial({color:c,roughness:0.65,metalness:0,side:THREE.DoubleSide});
    o.userData.base=c; this.meshes.push(o); });
   this.root.add(g.scene); this.real=true;
  }catch(e){ console.warn('region model unavailable – procedural fallback',e); this.fallback(region); }
  this.root.scale.x=(side==='L'&&!info?.both)?-1:1; this.root.updateMatrixWorld(true);
  const b=info?.box||[-.3,0,.9,1.2,-.15,.1]; let [x0,x1,y0,y1,z0,z1]=b; if(this.root.scale.x<0) [x0,x1]=[-x1,-x0]; this.box=[x0,x1,y0,y1,z0??-.25,z1??.25];
  this.planes=[new THREE.Plane(new THREE.Vector3(1,0,0),-x0+0.004),new THREE.Plane(new THREE.Vector3(-1,0,0),x1+0.004),new THREE.Plane(new THREE.Vector3(0,1,0),-y0),new THREE.Plane(new THREE.Vector3(0,-1,0),y1)];
  this.secPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),10); this.applyClip(); this.apply(); this.frame(); return {real:this.real,count:this.meshes.length}; }
 fallback(region){ // procedural stand-in: a bone shaft + muscle sleeve + skin shell
  const info=this.info, b=info?.box||[-.3,-.1,.9,1.2,-.1,.1]; const cx=(b[0]+b[1])/2, cy=(b[2]+b[3])/2, h=b[3]-b[2], cz=((b[4]??-.05)+(b[5]??.05))/2;
  const add=(geo,layer,name,r)=>{ const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:LAYERS.find(l=>l[0]===layer)[2],side:THREE.DoubleSide})); m.position.set(cx,cy,cz); m.userData={id:region+'_p'+this.meshes.length,name:name+' (procedural)',layer,region,side:'R',base:m.material.color.getStyle()}; this.root.add(m); this.meshes.push(m); };
  add(new THREE.CylinderGeometry(.012,.014,h,16),'bones','Bone','');add(new THREE.CylinderGeometry(.035,.03,h*.9,24),'msup','Muscle group');add(new THREE.CylinderGeometry(.045,.04,h,24),'skin','Skin'); }
 frame(){ const [x0,x1,y0,y1,z0,z1]=this.box; const c=new THREE.Vector3((x0+x1)/2,(y0+y1)/2,(z0+z1)/2); const s=Math.max(x1-x0,y1-y0,(z1-z0)*.8); this.ctl.target.copy(c); this.cam.position.set(c.x,c.y+s*.05,c.z+s*2.6); this.cam.near=s/50; this.cam.far=s*30; this.cam.updateProjectionMatrix(); this.ctl.update(); }
 view(dir){ const t=this.ctl.target, d=this.cam.position.distanceTo(t); const v={anterior:[0,0,1],posterior:[0,0,-1],lateral:[this.side==='L'?1:-1,0,0],medial:[this.side==='L'?-1:1,0,0],superior:[0,1,.01]}[dir]; this.cam.position.set(t.x+v[0]*d,t.y+v[1]*d,t.z+v[2]*d); this.ctl.update(); }
 applyClip(){ const p=[...this.planes]; if(this.section) p.push(this.secPlane); for(const m of this.meshes) m.material.clippingPlanes=p; }
 setSection(axis,f){ // axis 'x'|'y'|'z' or null; f 0..1 across region box
  if(!axis){ this.section=null; this.applyClip(); return; } const [x0,x1,y0,y1,z0,z1]=this.box; const i={x:0,y:1,z:2}[axis]; const lo=[x0,y0,z0][i],hi=[x1,y1,z1][i]; const n=new THREE.Vector3(); n.setComponent(i,-1); this.secPlane.set(n,lo+(hi-lo)*f); this.section=axis; this.applyClip(); }
 vis(m){ const u=m.userData, L=this.layer[u.layer]; if(this.iso&&!this.iso.has(u.id)) return false; if(this.hidden?.has(u.id)) return false; return !!L?.on; }
 apply(){ const any=Object.keys(this.hl).length; for(const m of this.meshes){ const u=m.userData,L=this.layer[u.layer]; m.visible=this.vis(m); const mt=m.material; let op=L.op;
   const h=this.hl[u.id]; if(any&&!h&&!this.iso) op=Math.min(op,0.18);
   mt.color.set(h?h.col:u.base); mt.emissive.set(this.sel===m?'#335':h?h.col:'#000'); mt.emissiveIntensity=h?0.25*(0.4+h.k):0.6;
   mt.transparent=op<0.99; mt.opacity=op; mt.depthWrite=op>0.6; m.renderOrder=op<0.99?2:0; mt.needsUpdate=true; } }
 setLayer(k,on,op){ if(on!=null) this.layer[k].on=on; if(op!=null) this.layer[k].op=op; this.apply(); }
 peel(){ while(this.peeled<PEEL.length&&!this.layer[PEEL[this.peeled]].on) this.peeled++; if(this.peeled<PEEL.length){ this.layer[PEEL[this.peeled]].on=false; this.peeled++; } this.apply(); return PEEL[this.peeled-1]; }
 unpeel(){ if(this.peeled>0){ this.peeled--; this.layer[PEEL[this.peeled]].on=true; } this.apply(); }
 restore(){ this.peeled=0; for(const [k,,,o] of LAYERS) this.layer[k]={on:true,op:o}; this.iso=null; this.hidden=null; this.sel=null; this.setSection(null); this.apply(); }
 find(q){ q=q.toLowerCase().trim(); if(!q) return []; return this.meshes.filter(m=>m.userData.name.toLowerCase().includes(q)).map(m=>m.userData); }
 byId(id){ return this.meshes.find(m=>m.userData.id===id); }
 isolate(ids){ ids=[].concat(ids).filter(Boolean); this.iso=ids.length?new Set(ids):null; for(const id of ids){ const m=this.byId(id); if(m) this.layer[m.userData.layer].on=true; } this.apply(); if(ids.length) this.focus(ids); }
 hide(id){ (this.hidden||(this.hidden=new Set())).add(id); if(this.sel?.userData.id===id) this.sel=null; this.apply(); }
 select(id){ this.sel=this.byId(id)||null; this.apply(); if(this.sel) this.onSelect(this.sel.userData); }
 focus(ids){ const bb=new THREE.Box3(); for(const id of ids){ const m=this.byId(id); if(m) bb.expandByObject(m); } if(bb.isEmpty()) return; const c=bb.getCenter(new THREE.Vector3()), s=Math.max(...bb.getSize(new THREE.Vector3()).toArray(),0.03); const dir=this.cam.position.clone().sub(this.ctl.target).normalize(); this.ctl.target.copy(c); this.cam.position.copy(c).addScaledVector(dir,s*3); this.ctl.update(); }
 pick(e){ const r=this.cv.getBoundingClientRect(); const p=new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1); const rc=new THREE.Raycaster(); rc.setFromCamera(p,this.cam);
  const pl=[...this.planes,...(this.section?[this.secPlane]:[])]; const hits=rc.intersectObjects(this.meshes.filter(m=>m.visible),false).filter(h=>pl.every(q=>q.distanceToPoint(h.point)>=-0.002)&&h.object.material.opacity>0.25);
  const h=hits[0]; this.sel=h?h.object:null; this.apply(); this.onSelect(h?h.object.userData:null); }
 highlight(map){ this.hl=map||{}; this.apply(); }   // map id -> {col,k}
 names(){ return this.meshes.filter(m=>m.parent&&m.userData.layer).map(m=>m.userData); }
 shot(){ return this.cv.toDataURL('image/png'); }
}
