// Camera mode: self-hosted MediaPipe Pose Landmarker drives the sagittal model (estimates only).
import { FilesetResolver, PoseLandmarker } from '../biomech/vendor/vision_bundle.mjs';
let lm = null, stream = null, raf = 0, api = null, hist = [], lastTs = -1;
const vid = () => document.getElementById('vid'), cv = () => document.getElementById('lmc');
const status = t => { const e = document.getElementById('camStatus'); if (e) e.textContent = t; };
async function init() {
  if (lm) return lm; status('Loading pose model (on-device)…');
  const fs = await FilesetResolver.forVisionTasks(new URL('../biomech/vendor/wasm', location.href).href);
  for (const delegate of ['GPU', 'CPU']) { try { lm = await PoseLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: new URL('../biomech/vendor/pose_landmarker_lite.task', location.href).href, delegate }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .4, minPosePresenceConfidence: .4, minTrackingConfidence: .4 }); break; } catch (e) { console.warn('pose delegate', delegate, e); } }
  if (!lm) throw new Error('Pose model failed to load'); return lm;
}
export function stop() { cancelAnimationFrame(raf); raf = 0; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; const v = vid(); if (v) { v.pause(); v.removeAttribute('src'); v.srcObject = null; } hist = []; }
export async function start(opt, a) {
  api = a; stop();
  try {
    await init(); const v = vid();
    if (opt.file) { v.srcObject = null; v.src = URL.createObjectURL(opt.file); v.loop = true; v.muted = true; v.style.transform = ''; }
    else { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: opt.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); v.srcObject = stream; v.style.transform = opt.facing === 'user' ? 'scaleX(-1)' : ''; cv().style.transform = v.style.transform; }
    await v.play(); status('Tracking… stand side-on to the camera. Values shown are estimates.'); loop();
  } catch (e) { console.warn(e); status('Camera/pose error: ' + e.message); }
}
const D = (a, b, ar) => { const x = (b.x - a.x) * ar, y = -(b.y - a.y), n = Math.hypot(x, y) || 1; return [x / n, y / n]; };
function loop() {
  const v = vid(); raf = requestAnimationFrame(loop);
  if (!lm || v.readyState < 2 || !v.videoWidth) return;
  let ts = performance.now(); if (ts <= lastTs) ts = lastTs + 1; lastTs = ts;
  const out = lm.detectForVideo(v, ts); const L = out.landmarks && out.landmarks[0];
  const c = cv(), x = c.getContext('2d'); c.width = v.videoWidth; c.height = v.videoHeight; x.clearRect(0, 0, c.width, c.height);
  if (!L) return;
  // choose side with better visibility
  const vis = i => L[i].visibility ?? 1, side = (vis(23) + vis(25) + vis(27) + vis(11)) >= (vis(24) + vis(26) + vis(28) + vis(12)) ? 0 : 1;
  const I = n => L[{ sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, heel: 29, toe: 31 }[n] + side];
  const P = ['sh', 'el', 'wr', 'hip', 'kn', 'an', 'heel', 'toe'];
  x.strokeStyle = '#2dd4bf'; x.lineWidth = 4; x.beginPath(); [['sh', 'hip'], ['hip', 'kn'], ['kn', 'an'], ['heel', 'toe'], ['sh', 'el'], ['el', 'wr']].forEach(([a, b]) => { x.moveTo(I(a).x * c.width, I(a).y * c.height); x.lineTo(I(b).x * c.width, I(b).y * c.height); }); x.stroke();
  x.fillStyle = '#f5c518'; P.forEach(n => { x.beginPath(); x.arc(I(n).x * c.width, I(n).y * c.height, 6, 0, 7); x.fill(); });
  const ar = v.videoWidth / v.videoHeight, flip = I('toe').x < I('heel').x ? -1 : 1; // make the person face +x
  const d = (a, b) => { const r = D(I(a), I(b), ar); return [r[0] * flip, r[1]]; };
  const { M, st } = api, S = api.S, ex = st.ex;
  const ft = d('heel', 'toe'), fa = Math.max(0, Math.min(70, -Math.atan2(ft[1], ft[0]) * 180 / Math.PI));
  // rebuild positions with model segment lengths, toe at origin
  const footFrame = { toe: 0, fa };
  const c0 = Math.cos(fa * Math.PI / 180), s0 = Math.sin(fa * Math.PI / 180);
  const ank = [-S.toeToAnkle * c0 + S.ankleH * s0, S.toeToAnkle * s0 + S.ankleH * c0];
  const ak = d('an', 'kn'), kh = d('kn', 'hip'), hs = d('hip', 'sh'), se = d('sh', 'el'), ew = d('el', 'wr');
  const knee = [ank[0] + ak[0] * S.shank.L, ank[1] + ak[1] * S.shank.L], hip = [knee[0] + kh[0] * S.thigh.L, knee[1] + kh[1] * S.thigh.L];
  const sh = [hip[0] + hs[0] * S.trunk.L, hip[1] + hs[1] * S.trunk.L], hand = [sh[0] + se[0] * S.upperarm.L + ew[0] * S.forearm.L, sh[1] + se[1] * S.upperarm.L + ew[1] * S.forearm.L];
  const pose = { hip, trunk: Math.atan2(hs[1], hs[0]) * 180 / Math.PI, feet: [footFrame, { ...footFrame }], arms: { hand } };
  const k = M.solve(ex, S, pose, st.load);
  const now = performance.now() / 1000; hist.push({ t: now, y: k.cog[1], yb: k.bar ? k.bar[1] : k.cog[1] }); while (hist.length > 9) hist.shift();
  let aC = 0, aB = 0, vB = 0, vC = 0; if (hist.length >= 9) { const h0 = hist[0], h1 = hist[4], h2 = hist[8], dt = (h2.t - h0.t) / 2; if (dt > 0) { aC = (h2.y - 2 * h1.y + h0.y) / (dt * dt); aB = (h2.yb - 2 * h1.yb + h0.yb) / (dt * dt); vB = (h2.yb - h0.yb) / (2 * dt); vC = (h2.y - h0.y) / (2 * dt); } }
  const clampA = a => Math.max(-6, Math.min(6, a)); aC = clampA(aC); aB = clampA(aB);
  // supports: feet only, plus exercise contacts (bench/seat/hands) when the body is in contact
  const fake = { ...ex, seatOff: false, supports: ex.supports.filter(s => s !== 'seat' || hip[1] < 0.62) };
  const sup = M.supportsFor(fake, S, k, pose, 0, null);
  const kin = M.kinetics(fake, S, k, sup, st.load, aC, aB);
  api.onResult({ k, kin, aCog: aC, aBar: aB, vBar: vB, vCog: vC, phase: { name: vB > .05 ? 'Rising' : vB < -.05 ? 'Lowering' : 'Holding', kind: vB > .05 ? 'con' : vB < -.05 ? 'ecc' : 'iso' }, power: kin.Fbar * vB, powerCog: kin.Ftot * vC });
}
