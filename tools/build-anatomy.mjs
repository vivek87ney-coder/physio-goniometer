// Builds per-region GLB files for /biomech/ from Z-Anatomy FBX->GLB exports (CC BY-SA 4.0).
// usage: node build-anatomy.mjs <dir with converted *.glb> <outdir>
import {NodeIO,Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {getBounds,weld,simplify,quantize,reorder,dedup,prune} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import fs from 'fs';
const [,,SRC,OUT]=process.argv;fs.mkdirSync(OUT,{recursive:true});
await MeshoptEncoder.ready;await MeshoptSimplifier.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
// right-side boxes in metres [x0,x1,y0,y1,z0,z1]; model: y up, +z anterior, right side = -x
const R={
 shoulder:{g:'Upper limb',n:'Shoulder / girdle',b:[-.32,-.0,1.2,1.5,-.16,.12],j:'gh'},
 arm:{g:'Upper limb',n:'Arm',b:[-.34,-.1,1.06,1.42,-.13,.08],j:'gh'},
 elbow:{g:'Upper limb',n:'Elbow',b:[-.34,-.14,.98,1.18,-.12,.08],j:'elbow'},
 forearm:{g:'Upper limb',n:'Forearm',b:[-.34,-.16,.82,1.13,-.1,.08],j:'rul'},
 wrist:{g:'Upper limb',n:'Wrist',b:[-.33,-.17,.77,.9,-.08,.07],j:'rc'},
 hand:{g:'Upper limb',n:'Hand / fingers',b:[-.36,-.15,.56,.86,-.09,.09],j:'rc'},
 hip:{g:'Lower limb',n:'Hip',b:[-.22,-.0,.72,1.06,-.15,.12],j:'hip'},
 thigh:{g:'Lower limb',n:'Thigh',b:[-.22,-.0,.4,.95,-.13,.11],j:'hip'},
 knee:{g:'Lower limb',n:'Knee',b:[-.2,-.0,.33,.56,-.13,.1],j:'tf'},
 leg:{g:'Lower limb',n:'Leg',b:[-.2,-.0,.03,.5,-.14,.08],j:'tc'},
 ankle:{g:'Lower limb',n:'Ankle',b:[-.17,-.0,-.02,.15,-.14,.08],j:'tc'},
 foot:{g:'Lower limb',n:'Foot / toes',b:[-.18,-.0,-.03,.1,-.15,.2],j:'tc'},
 cervical:{g:'Spine & trunk',n:'Cervical spine',b:[-.1,.1,1.36,1.57,-.14,.06],both:1,j:'spine'},
 thoracic:{g:'Spine & trunk',n:'Thoracic spine',b:[-.12,.12,1.06,1.42,-.18,-.0],both:1,j:'spine'},
 lumbar:{g:'Spine & trunk',n:'Lumbar spine',b:[-.13,.13,.9,1.12,-.17,.02],both:1,j:'spine'},
 si:{g:'Spine & trunk',n:'SI joint',b:[-.13,.13,.83,1.02,-.16,.03],both:1,j:'spine'},
 pelvis:{g:'Spine & trunk',n:'Pelvis',b:[-.2,.2,.76,1.08,-.17,.13],both:1,j:'hip'},
 cage:{g:'Spine & trunk',n:'Thoracic cage',b:[-.2,.2,1.05,1.45,-.18,.16],both:1,j:'spine'},
 abdomen:{g:'Spine & trunk',n:'Abdomen',b:[-.2,.2,.84,1.16,-.18,.17],both:1,j:'spine'},
};
const SUP=/deltoid|pectoralis major|biceps brachii|triceps brachii|brachioradialis|trapezius|latissimus|gluteus maximus|sartorius|rectus femoris|vastus lateralis|vastus medialis|gastrocnemius|tibialis anterior|external oblique|external abdominal oblique|rectus abdominis|flexor carpi|palmaris longus|extensor carpi|extensor digitorum(?! brevis)|extensor digiti minimi|pronator teres|gracilis|biceps femoris|semitendinosus|tensor fasciae|sternocleidomastoid|platysma|fibularis longus|peroneus longus|adductor longus|anconeus|abductor pollicis longus|pyramidalis/i;
const DEEP=/brachialis|supinator|pronator quadratus|profundus|flexor pollicis longus|supraspinatus|infraspinatus|subscapularis|teres minor|multifidus|rotatores|quadratus lumborum|psoas|iliacus|piriformis|obturator|gemell|quadratus femoris|vastus intermedius|popliteus|tibialis posterior|flexor hallucis longus|flexor digitorum longus|transvers|interosse|lumbrical|longus colli|longus capitis|intertransvers|interspinal|levatores|subcostal|intercostal|innermost|diaphragm|articularis|pectoralis minor|serratus|coracobrachialis|extensor indicis|extensor pollicis|semispinalis|rectus capitis|obliquus capitis|scalen|iliocostalis|longissimus|spinalis|levator ani|coccygeus|adductor magnus|gluteus minimus|plantaris|soleus|quadratus plantae|opponens|adductor pollicis|adductor hallucis/i;
function layerOf(file,n){const s=n.toLowerCase();
 if(file.startsWith('Regions'))return 'skin';
 if(file.startsWith('Cardio'))return 'neurovascular';
 if(file.startsWith('Nervous'))return /cord|nerve|ganglion|plexus|root|ramus|cauda|filum/.test(s)?'neurovascular':null;
 if(file.startsWith('Skeletal')){if(/\.(o|e)\d*[rl]?$/.test(n))return 'tendons';if(/cartilage/.test(s))return 'cartilage';return 'bones'}
 if(file.startsWith('Joints')){if(/capsul|frenula/.test(s))return 'capsule';if(/menisc(us|i)\b|labrum|articular disc|intervertebral disc|cartilage|symphysis|nucleus|anulus/.test(s)&&!/ligament/.test(s))return 'cartilage';if(/synovi|bursa|fat pad|plica/.test(s))return 'synovial';return 'ligaments'}
 if(file.startsWith('Muscular')){if(/bursa|synovial|tendon sheath|sheath/.test(s))return 'synovial';if(/fascia(?!e)|aponeuros|retinacul|septum|tract|sheath of rectus|ligament/.test(s))return 'fascia';if(/tendon|tendinous|tendo/.test(s))return 'tendons';
   if(SUP.test(s))return 'msup';if(DEEP.test(s))return 'mdeep';return 'mint'}
 return null}
const HEADSKIP=/eye|lacrimal|orbit|nasal|tooth|teeth|tongue|lip|ear |auricle|brain|cerebr|cerebell|gyrus|sulcus|ventricle|thalam|pons|medulla|tympan|malleus|incus|stapes|cochlea|labyrinth|optic|olfact|retina|lens|iris/i;
const BUD={shoulder:420e3,arm:300e3,elbow:240e3,forearm:300e3,wrist:220e3,hand:300e3,hip:400e3,thigh:360e3,knee:260e3,leg:300e3,ankle:220e3,foot:300e3,cervical:360e3,thoracic:420e3,lumbar:360e3,si:300e3,pelvis:420e3,cage:420e3,abdomen:380e3};
// load sources
const src=[];for(const f of fs.readdirSync(SRC).filter(f=>f.endsWith('.glb'))){const doc=await io.read(SRC+'/'+f);
 for(const node of doc.getRoot().listNodes()){const m=node.getMesh();if(!m)continue;const name=node.getName();if(/\.(j|i)$/.test(name))continue;
  const L=layerOf(f,name);if(!L||HEADSKIP.test(name))continue;
  let tri=0;for(const p of m.listPrimitives()){const ix=p.getIndices();tri+=(ix?ix.getCount():p.getAttribute('POSITION').getCount())/3}if(tri<=12)continue;
  const b=getBounds(node);src.push({f,doc,node,name,L,tri,min:b.min,max:b.max,c:b.min.map((v,i)=>(v+b.max[i])/2)})}}
console.log('structures',src.length);
const meta={license:'Z-Anatomy (Lluís Vinent / Gauthier Kervyn), CC BY-SA 4.0, derived from BodyParts3D (c) The Database Center for Life Science, CC BY-SA 2.1 JP. Converted, region-split and simplified for Physio 3D Biomechanics.',regions:{}};
for(const [key,r] of Object.entries(R)){const [x0,x1,y0,y1,z0,z1]=r.b;const pad=.01;
 const pick=src.filter(s=>{const lo=[x0,y0,z0-.04],hi=[x1,y1,z1+.04];
   for(let i=0;i<3;i++)if(s.max[i]<lo[i]||s.min[i]>hi[i])return false;
   const ov=i=>Math.max(0,Math.min(s.max[i],hi[i])-Math.max(s.min[i],lo[i]));const h=s.max[1]-s.min[1]||1e-3;
   const inC=s.c[0]>=x0&&s.c[0]<=x1&&s.c[1]>=y0&&s.c[1]<=y1;
   if(r.both||inC)return true;
   if((s.L==='skin'||s.L==='fascia')&&(s.c[0]<x0-.03||s.c[0]>x1+.03))return false;
   return ov(1)/h>=.2||ov(1)>=(y1-y0)*.4});
 const tot=pick.reduce((a,s)=>a+s.tri,0);const ratio=Math.min(1,BUD[key]/tot);
 const out=new Document();const buf=out.createBuffer();const scene=out.createScene(key);const mats={};
 const structs=[];let id=0;
 for(const s of pick){const mat=mats[s.L]||(mats[s.L]=out.createMaterial(s.L));const mesh=out.createMesh(s.name);
  const wm=s.node.getWorldMatrix();
  for(const p of s.node.getMesh().listPrimitives()){const pos=p.getAttribute('POSITION');const nrm=p.getAttribute('NORMAL');const ix=p.getIndices();
   const n=pos.getCount();const P=new Float32Array(n*3),N=nrm?new Float32Array(n*3):null;const v=[0,0,0];
   for(let i=0;i<n;i++){pos.getElement(i,v);const x=v[0],y=v[1],z=v[2];P[i*3]=wm[0]*x+wm[4]*y+wm[8]*z+wm[12];P[i*3+1]=wm[1]*x+wm[5]*y+wm[9]*z+wm[13];P[i*3+2]=wm[2]*x+wm[6]*y+wm[10]*z+wm[14];
    if(N){nrm.getElement(i,v);let a=wm[0]*v[0]+wm[4]*v[1]+wm[8]*v[2],b=wm[1]*v[0]+wm[5]*v[1]+wm[9]*v[2],c=wm[2]*v[0]+wm[6]*v[1]+wm[10]*v[2];const l=Math.hypot(a,b,c)||1;N[i*3]=a/l;N[i*3+1]=b/l;N[i*3+2]=c/l}}
   const np=out.createPrimitive().setMaterial(mat).setAttribute('POSITION',out.createAccessor().setType('VEC3').setArray(P).setBuffer(buf));
   if(N)np.setAttribute('NORMAL',out.createAccessor().setType('VEC3').setArray(N).setBuffer(buf));
   if(ix)np.setIndices(out.createAccessor().setType('SCALAR').setArray(n>65535?new Uint32Array(ix.getArray()):new Uint16Array(ix.getArray())).setBuffer(buf));
   mesh.addPrimitive(np)}
  const side=/\.[a-z0-9]*r$/.test(s.name)?'R':/\.[a-z0-9]*l$/.test(s.name)?'L':'M';
  if(!r.both&&side==='L')continue;
  const clean=s.name.replace(/\.[a-z0-9]*$/,'').replace(/^\((.*)\)$/,'$1');
  const kind=/\.o\d*[rl]?$/.test(s.name)?' (origin)':/\.e\d*[rl]?$/.test(s.name)?' (insertion)':'';
  const sid=key+'_'+(id++);const nd=out.createNode(sid).setMesh(mesh).setExtras({id:sid,name:clean+kind,layer:s.L,side,region:key,src:s.f.replace('.glb','')});scene.addChild(nd);
  structs.push({id:sid,name:clean+kind,layer:s.L,side})}
 await out.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio,error:0.002,lockBorder:false}),prune(),reorder({encoder:MeshoptEncoder}),quantize({quantizePosition:14,quantizeNormal:8}));
 out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
 out.getRoot().getAsset().copyright=meta.license;
 await io.write(`${OUT}/${key}.glb`,out);const sz=fs.statSync(`${OUT}/${key}.glb`).size;
 meta.regions[key]={group:r.g,name:r.n,box:r.b,both:!!r.both,joint:r.j,bytes:sz,tris:Math.round(Math.min(tot,BUD[key])),count:structs.length};
 console.log(key,structs.length,'tris',tot,'->',Math.round(tot*ratio),(sz/1e6).toFixed(2)+'MB');}
fs.writeFileSync(`${OUT}/regions.json`,JSON.stringify(meta,null,1));
