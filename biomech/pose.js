// MediaPipe Pose Landmarker (self-hosted). Returns 2D normalized + 3D world landmarks (metric, hip-centred).
import {FilesetResolver,PoseLandmarker} from "./vendor/vision_bundle.mjs";
let lm=null,vts=0,cur=null; export let poseState="loading";
export async function initPose(model){ model=model||localStorage.getItem('bm_model')||'lite'; if(lm&&cur===model) return true; if(lm){ try{lm.close()}catch(e){} lm=null; }
  const fs=await FilesetResolver.forVisionTasks(new URL("./vendor/wasm",location.href).href.replace(/\/$/,""));
  for(const del of ["GPU","CPU"]){ try{ lm=await PoseLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:new URL(`./vendor/pose_landmarker_${model}.task`,location.href).href,delegate:del},runningMode:"VIDEO",numPoses:1,minPoseDetectionConfidence:.4,minPosePresenceConfidence:.4,minTrackingConfidence:.4});
    poseState=del+' · '+model; cur=model; window.__poseReady=poseState; return true; }catch(e){ console.warn('delegate',del,e); } }
  poseState='failed'; window.__poseReady='failed'; return false; }
export function detect(el){ if(!lm) return null; vts=Math.max(vts+1,performance.now()); try{ const r=lm.detectForVideo(el,vts); const l=r?.landmarks?.[0], w=r?.worldLandmarks?.[0]; if(!l||!w) return null;
  return {I:l.map(p=>[p.x,p.y,p.visibility??1]),W:w.map(p=>[p.x,p.y,p.z])}; }catch(e){ return null; } }
