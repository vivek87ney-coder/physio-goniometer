// 3D Movement Mechanics – anthropometry, exercise keyframes and sagittal-plane mechanics.
// Pure JS (no DOM) so it can be unit-tested in Node.
export const G = 9.81;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
// de Leva (1996) adjustments of Zatsiorsky–Seluyanov, male. Lengths for reference stature 1.741 m.
// mass fraction, reference length (m), CoM position from proximal end (fraction).
export const DELEVA = {
  head:     { m: 0.0694, L: 0.2429, c: 0.5002, name: 'Head & neck' },
  trunk:    { m: 0.4346, L: 0.5319, c: 0.4862, name: 'Trunk' },      // CoM measured from hip end
  upperarm: { m: 0.0271, L: 0.2817, c: 0.5772, name: 'Upper arm' },
  forearm:  { m: 0.0162, L: 0.2689, c: 0.4574, name: 'Forearm' },
  hand:     { m: 0.0061, L: 0.0862, c: 0.7900, name: 'Hand' },
  thigh:    { m: 0.1416, L: 0.4222, c: 0.4095, name: 'Thigh' },
  shank:    { m: 0.0433, L: 0.4340, c: 0.4459, name: 'Shank' },
  foot:     { m: 0.0137, L: 0.2581, c: 0.4415, name: 'Foot' },
};
export function anthro(mass, height) {
  const k = height / 1.741, S = { mass, height };
  for (const [n, s] of Object.entries(DELEVA)) S[n] = { L: s.L * k, m: s.m * mass, c: s.c };
  S.ankleH = 0.039 * height; S.toeToAnkle = 0.72 * S.foot.L;
  S.armL = S.upperarm.L + S.forearm.L; S.legL = S.thigh.L + S.shank.L;
  return S;
}
const v = (x, y) => [x, y], add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s], len = a => Math.hypot(a[0], a[1]), dir = d => [Math.cos(d * D2R), Math.sin(d * D2R)];
const lerp = (a, b, s) => a + (b - a) * s, cross = (a, b) => a[0] * b[1] - a[1] * b[0], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
// two-link IK; returns middle joint. sideSign +1 → n = (-dy,dx)
function ik(p, q, l1, l2, side) {
  let d = sub(q, p), L = len(d); const maxL = (l1 + l2) * 0.99999;
  if (L > maxL) { q = add(p, mul(d, maxL / L)); d = sub(q, p); L = maxL; }
  if (L < 1e-6) L = 1e-6;
  const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const u = mul(d, 1 / L), n = [-u[1], u[0]];
  return { mid: add(add(p, mul(u, a)), mul(n, h * side)), end: q };
}
// foot: toe on floor at toe[x], fa = heel-raise angle (deg) rotating about toe
function footPts(S, toe, fa) {
  const c = Math.cos(fa * D2R), s = Math.sin(fa * D2R), rot = p => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c];
  return { toe, heel: add(toe, rot([-S.foot.L, 0])), ankle: add(toe, rot([-S.toeToAnkle, S.ankleH])) };
}
// ---------- Exercise library ----------
// Each pose is a function of anthropometry S returning numeric params:
// hip [x,y], trunk (deg, direction hip→shoulder), feet [{toe:x, fa}], arms {hand:[x,y]} | {ua (deg dir), el (flex deg)}
const torso = (S, hip, tr) => add(hip, mul(dir(tr), S.trunk.L));
export const EXERCISES = [
 { id: 'hipthrust', name: 'Hip thrust', load: 60, loadAt: 'hip', loadLabel: 'barbell', equip: ['bench', 'barbell'],
   benchH: 0.42, supports: ['bench', 'feet'], defaultPhase: 'Top hold',
   poses: {
    top: S => htPose(S, 0), bottom: S => htPose(S, 36),
   },
   phases: [['Top hold', 'iso', 1.2, 'top', 'top'], ['Eccentric', 'ecc', 1.6, 'top', 'bottom'], ['Bottom', 'iso', 0.4, 'bottom', 'bottom'], ['Concentric', 'con', 1.2, 'bottom', 'top']],
   muscles: { agonist: ['Gluteus maximus', 'Hamstrings (biceps femoris long head, semitendinosus, semimembranosus)'], synergist: ['Adductor magnus (posterior fibres)', 'Quadriceps (knee held near 90°)'], stabiliser: ['Erector spinae', 'Rectus abdominis & obliques (anti-extension)', 'Gluteus medius'] },
   text: { setup: 'Upper back (inferior border of scapulae) on a fixed bench ~40–45 cm high, feet flat about hip-width, bar padded over the hip crease. At the top the shin is roughly vertical with the knee near 90° and the trunk and thigh aligned (hip ~0° flexion).',
     kin: 'The hip moves from ~70–80° flexion at the bottom to neutral (0°) at the top while the knee stays near 90°. The shoulder–bench contact is the pivot, so the trunk rotates about the bench as the pelvis rises.',
     faults: ['Lumbar hyperextension at lockout – ribs flare and the pelvis tips anteriorly so extension comes from the lumbar spine instead of the hip. Cue a posterior pelvic tilt, chin tucked, ribs down.', 'Feet too far forward – knee angle opens, hamstrings dominate and cramp; too close – quadriceps dominate.', 'Knees caving in (valgus) – weak hip abductors/external rotators; cue knees out over the 2nd–3rd toe.', 'Sliding on the bench / bench not fixed – unstable pivot, shoulder discomfort.'] } },
 { id: 'squat', name: 'Back squat', load: 60, loadAt: 'back', loadLabel: 'barbell', equip: ['barbell', 'rack'], supports: ['feet'],
   poses: {
    top: S => ({ hip: [-S.toeToAnkle + 0.03, S.ankleH + S.legL * 0.993], trunk: 86, feet: feet2(S, 0), arms: { handRel: 'bar' } }),
    bottom: S => { const kneeX = 0.10, ank = [S.toeToAnkle * -1 + 0.0, S.ankleH]; const hipY = S.ankleH + S.shank.L * 0.86 - S.thigh.L * 0.18; const hipX = kneeX - Math.sqrt(Math.max(0, S.thigh.L ** 2 - (S.ankleH + Math.sqrt(S.shank.L ** 2 - (kneeX - ank[0]) ** 2) - hipY) ** 2)); return { hip: [hipX, hipY], trunk: 52, feet: feet2(S, 0), arms: { handRel: 'bar' } }; },
   },
   phases: [['Start', 'iso', 0.8, 'top', 'top'], ['Eccentric', 'ecc', 1.8, 'top', 'bottom'], ['Bottom', 'iso', 0.4, 'bottom', 'bottom'], ['Concentric', 'con', 1.4, 'bottom', 'top']],
   muscles: { agonist: ['Quadriceps (vasti, rectus femoris)', 'Gluteus maximus'], synergist: ['Adductor magnus', 'Soleus', 'Hamstrings (hip extension)'], stabiliser: ['Erector spinae', 'Abdominal wall / intra-abdominal pressure', 'Gluteus medius & deep hip rotators'] },
   text: { setup: 'Bar on the upper trapezius (high bar), feet about shoulder-width with slight toe-out, mid-foot under the bar. Brace, then sit down and back while the knees track over the toes.',
     kin: 'Hip, knee and ankle flex together; the bar path stays roughly vertical over mid-foot. Trunk lean balances the hip and knee moments – more forward lean shifts demand from the quadriceps to the hip extensors.',
     faults: ['Knee valgus – the knees collapse inward during ascent (weak hip abductors/external rotators, limited ankle dorsiflexion). Cue knees out over the toes.', 'Heels lifting – CoG drifts forward of the base of support; usually restricted ankle dorsiflexion.', 'Excessive forward lean / "good-morning" squat – hips rise faster than the bar, increasing the lumbar and hip moment.', 'Lumbar flexion at depth ("butt wink") – posterior pelvic tilt as hip flexion runs out.'] } },
 { id: 'deadlift', name: 'Deadlift', load: 80, loadAt: 'hands', loadLabel: 'barbell', equip: ['barbell'], supports: ['feet'], hangArms: true,
   poses: {
    bottom: S => dlPose(S, 0.225, 32), top: S => dlPose(S, null, 88),
   },
   phases: [['Start', 'iso', 0.6, 'bottom', 'bottom'], ['Concentric', 'con', 1.4, 'bottom', 'top'], ['Lockout', 'iso', 0.8, 'top', 'top'], ['Eccentric', 'ecc', 1.6, 'top', 'bottom']],
   muscles: { agonist: ['Gluteus maximus', 'Hamstrings', 'Quadriceps (off the floor)'], synergist: ['Adductor magnus', 'Soleus'], stabiliser: ['Erector spinae (isometric)', 'Latissimus dorsi (keeps bar close)', 'Trapezius & rhomboids', 'Forearm flexors (grip)'] },
   text: { setup: 'Bar over mid-foot, shins near the bar, hips higher than knees, shoulders slightly in front of the bar, arms vertical, neutral spine and braced trunk.',
     kin: 'Knee extension dominates the first part of the lift; once the bar passes the knees the hips extend to lockout. The bar should travel in a near-vertical line close to the legs.',
     faults: ['Lumbar flexion (rounded back) – increases spinal shear and disc loading; brace and set the lats.', 'Bar drifting away from the shins – longer moment arm about the hip and lumbar spine.', 'Hips shooting up first – turns the lift into a stiff-leg deadlift.', 'Hyperextending at lockout – lean back instead of finishing with the glutes.'] } },
 { id: 'bridge', name: 'Glute bridge', load: 20, loadAt: 'hip', loadLabel: 'barbell', equip: ['barbell'], supports: ['floorBack', 'feet'],
   poses: {
    bottom: S => gbPose(S, 2), top: S => gbPose(S, 30),
   },
   phases: [['Start', 'iso', 0.6, 'bottom', 'bottom'], ['Concentric', 'con', 1.0, 'bottom', 'top'], ['Top hold', 'iso', 1.0, 'top', 'top'], ['Eccentric', 'ecc', 1.4, 'top', 'bottom']],
   muscles: { agonist: ['Gluteus maximus', 'Hamstrings'], synergist: ['Adductor magnus'], stabiliser: ['Abdominals', 'Erector spinae', 'Gluteus medius'] },
   text: { setup: 'Supine, shoulders on the floor, knees flexed ~90° at the top, feet flat hip-width. Optional bar or band over the hips.',
     kin: 'Hip extension from ~40–50° flexion to neutral with the shoulders as the pivot; shorter range than a hip thrust because the pivot is on the floor.',
     faults: ['Lumbar hyperextension at the top instead of hip extension.', 'Feet too far away – hamstring cramping.', 'Pushing through the toes – heels lift, quadriceps take over.'] } },
 { id: 'lunge', name: 'Forward lunge (split squat)', load: 20, loadAt: 'hands', loadLabel: 'dumbbells', equip: ['dumbbells'], supports: ['frontFoot', 'rearFoot'], hangArms: true, split: true,
   poses: {
    top: S => lungePose(S, 0.9), bottom: S => lungePose(S, 0.58),
   },
   phases: [['Start', 'iso', 0.6, 'top', 'top'], ['Eccentric', 'ecc', 1.4, 'top', 'bottom'], ['Bottom', 'iso', 0.4, 'bottom', 'bottom'], ['Concentric', 'con', 1.2, 'bottom', 'top']],
   muscles: { agonist: ['Quadriceps (front leg)', 'Gluteus maximus (front leg)'], synergist: ['Adductor magnus', 'Soleus', 'Rear-leg hip flexors (eccentric stretch)'], stabiliser: ['Gluteus medius/minimus (frontal-plane control)', 'Trunk stabilisers', 'Tibialis posterior & peronei'] },
   text: { setup: 'Split stance with ~hip-width "tram lines", front foot flat, rear foot on the forefoot. Trunk upright, weight mostly on the front leg.',
     kin: 'The pelvis drops vertically: front hip and knee flex to ~90°, rear knee drops towards the floor. Front-leg GRF is much larger than the rear.',
     faults: ['Knee valgus on the front leg – pelvic drop and hip adduction/internal rotation.', 'Front heel lifting – stance too short.', 'Trunk lean/rotation – loss of lumbopelvic control.'] } },
 { id: 'pushup', name: 'Push-up', load: 0, loadAt: 'trunk', loadLabel: 'weight vest', equip: [], supports: ['hands', 'toes'], plank: true,
   poses: { top: S => pushPose(S, 0), bottom: S => pushPose(S, 1) },
   phases: [['Start', 'iso', 0.6, 'top', 'top'], ['Eccentric', 'ecc', 1.2, 'top', 'bottom'], ['Bottom', 'iso', 0.3, 'bottom', 'bottom'], ['Concentric', 'con', 1.0, 'bottom', 'top']],
   muscles: { agonist: ['Pectoralis major', 'Triceps brachii'], synergist: ['Anterior deltoid', 'Serratus anterior'], stabiliser: ['Rectus abdominis & obliques (anti-extension)', 'Gluteals', 'Rotator cuff'] },
   text: { setup: 'Hands slightly wider than shoulders under the shoulders, body in a straight line from head to heels, toes as the rear support.',
     kin: 'Body rotates as a rigid plank about the toes; elbows flex to ~90° or more, shoulder horizontal abduction/extension in the eccentric phase. About 65–75% of body weight goes through the hands.',
     faults: ['Sagging hips (lumbar hyperextension) – weak anterior core.', 'Elbows flared to 90° – increases anterior shoulder load; aim ~45°.', 'Scapular winging – serratus anterior weakness.', 'Head poking forward.'] } },
 { id: 'bench', name: 'Bench press', load: 60, loadAt: 'hands', loadLabel: 'barbell', equip: ['flatbench', 'barbell'], supports: ['benchBack', 'feet'], supine: true,
   poses: { top: S => benchPose(S, 0), bottom: S => benchPose(S, 1) },
   phases: [['Start', 'iso', 0.6, 'top', 'top'], ['Eccentric', 'ecc', 1.4, 'top', 'bottom'], ['Bottom (touch)', 'iso', 0.3, 'bottom', 'bottom'], ['Concentric', 'con', 1.1, 'bottom', 'top']],
   muscles: { agonist: ['Pectoralis major', 'Triceps brachii'], synergist: ['Anterior deltoid', 'Coracobrachialis'], stabiliser: ['Rotator cuff', 'Rhomboids & middle trapezius (scapular retraction)', 'Latissimus dorsi', 'Legs (leg drive)'] },
   text: { setup: 'Eyes under the bar, scapulae retracted and depressed, feet flat, grip so forearms are vertical at the chest. Unrack over the shoulders.',
     kin: 'The bar travels in a slight J-curve from over the shoulders to the lower chest. Elbow and shoulder moments peak at the bottom where the horizontal distance to the bar line is largest.',
     faults: ['Elbows flared to 90° – greater anterior shoulder stress.', 'Bouncing the bar off the chest.', 'Hips lifting off the bench.', 'Wrists extended (bar behind the forearm line).'] } },
 { id: 'sts', name: 'Sit-to-stand', load: 0, loadAt: 'trunk', loadLabel: 'weight vest', equip: ['chair'], supports: ['seat', 'feet'], seatOff: true,
   poses: { sit: S => stsPose(S, 0), lean: S => stsPose(S, 1), stand: S => stsPose(S, 2) },
   phases: [['Seated', 'iso', 0.6, 'sit', 'sit'], ['Flexion momentum', 'con', 0.8, 'sit', 'lean'], ['Extension (rise)', 'con', 1.2, 'lean', 'stand'], ['Standing', 'iso', 0.6, 'stand', 'stand'], ['Sit down', 'ecc', 1.6, 'stand', 'sit']],
   muscles: { agonist: ['Quadriceps', 'Gluteus maximus'], synergist: ['Hamstrings', 'Soleus', 'Hip flexors (trunk flexion momentum phase)'], stabiliser: ['Tibialis anterior', 'Erector spinae', 'Gluteus medius'] },
   text: { setup: 'Chair ~45 cm, feet flat slightly behind the knees, arms across the chest. Common clinical test (30-s chair stand, 5×STS).',
     kin: 'Phases: flexion momentum (trunk leans forward), momentum transfer/seat-off, extension and stabilisation. Seat-off is when knee extensor moment peaks; the CoG must move over the feet before the hips can lift.',
     faults: ['Not leaning forward enough – CoG stays behind the feet so the person falls back.', 'Knees collapsing inward.', 'Using the arms to push up – compensation for weak knee extensors.', 'Asymmetric weight bearing (e.g., after TKR/stroke).'] } },
 { id: 'calf', name: 'Calf raise', load: 20, loadAt: 'hands', loadLabel: 'dumbbells', equip: ['dumbbells'], supports: ['feet'], hangArms: true,
   poses: { down: S => calfPose(S, 0), up: S => calfPose(S, 38) },
   phases: [['Start', 'iso', 0.5, 'down', 'down'], ['Concentric', 'con', 0.9, 'down', 'up'], ['Top hold', 'iso', 0.8, 'up', 'up'], ['Eccentric', 'ecc', 1.4, 'up', 'down']],
   muscles: { agonist: ['Gastrocnemius', 'Soleus'], synergist: ['Flexor hallucis longus', 'Tibialis posterior', 'Peroneus longus/brevis'], stabiliser: ['Tibialis anterior (co-contraction)', 'Gluteus medius', 'Trunk'] },
   text: { setup: 'Standing tall, feet hip-width, weight over the forefoot, dumbbells hanging at the sides. Knees straight to bias gastrocnemius.',
     kin: 'Rotation about the metatarsophalangeal joints; the moment arm of the GRF about the ankle is the forefoot length, so plantarflexor moment ≈ body weight × forefoot lever.',
     faults: ['Rolling onto the lateral forefoot (inversion) – keep pressure through the big toe.', 'Bouncing at the bottom – loses the eccentric stimulus.', 'Partial range.'] } },
 { id: 'curl', name: 'Biceps curl', load: 12, loadAt: 'hands', loadLabel: 'dumbbells (total)', equip: ['dumbbells'], supports: ['feet'],
   poses: { down: S => curlPose(S, 5), up: S => curlPose(S, 135) },
   phases: [['Start', 'iso', 0.5, 'down', 'down'], ['Concentric', 'con', 1.0, 'down', 'up'], ['Top', 'iso', 0.4, 'up', 'up'], ['Eccentric', 'ecc', 1.6, 'up', 'down']],
   muscles: { agonist: ['Biceps brachii', 'Brachialis'], synergist: ['Brachioradialis'], stabiliser: ['Anterior deltoid', 'Wrist flexors', 'Trunk & scapular stabilisers'] },
   text: { setup: 'Standing, elbows by the sides, forearm supinated, wrists neutral.',
     kin: 'Elbow flexion 0→~140°; the load moment arm about the elbow is largest when the forearm is horizontal (90°), so that is the hardest point.',
     faults: ['Swinging the trunk (momentum) – lumbar extension.', 'Elbows drifting forward – shoulder flexion shortens the moment arm.', 'Wrist flexion/extension compensation.'] } },
];
function htPose(S, drop) { // shoulder pivot fixed on the bench
  const sh = [-S.trunk.L, 0.50], tr = 180 - drop, hip = sub(sh, mul(dir(tr), S.trunk.L));
  const toe = S.thigh.L + S.toeToAnkle - 0.01;
  return { hip, trunk: tr, feet: feet2(S, toe), arms: { handRel: 'bar' } };
}
function gbPose(S, lift) { // shoulders on floor
  const sh = [-S.trunk.L, 0.10], tr = 180 + lift, hip = sub(sh, mul(dir(tr), S.trunk.L));
  return { hip, trunk: tr, feet: feet2(S, S.thigh.L * 0.62 + S.toeToAnkle), arms: { handRel: 'bar' } };
}
function feet2(S, toeX, fa = 0) { return [{ toe: toeX, fa }, { toe: toeX, fa }]; }
function dlPose(S, barY, trunk) {
  const ank = [-S.toeToAnkle, S.ankleH], barX = ank[0] + 0.05;
  const arm = S.armL + S.hand.L * 0.5;
  if (barY == null) { // lockout: stand tall
    return { hip: [ank[0] - 0.02, S.ankleH + S.legL * 0.993], trunk, feet: feet2(S, 0), arms: { ua: -90, el: 0 } };
  }
  const sh = [barX + 0.04, barY + arm];
  const hip = sub(sh, mul(dir(trunk), S.trunk.L));
  return { hip, trunk, feet: feet2(S, 0), arms: { ua: -90 - 4, el: 0 } };
}
function lungePose(S, f) {
  const hipY = S.ankleH + S.legL * f; const front = 0.25, rear = -0.52;
  return { hip: [0, hipY], trunk: 88, feet: [{ toe: front + S.toeToAnkle, fa: 0 }, { toe: rear + 0.06, fa: 48 }], arms: { ua: -90, el: 0 } };
}
function pushPose(S, f) {
  const toeX = 0; const ft = footPts(S, [toeX, 0], 62);
  const shY = lerp(S.armL + S.hand.L * 0.4, 0.13, f);
  const L = S.legL + S.trunk.L; // ankle→shoulder line
  const ang = Math.asin((shY - ft.ankle[1]) / L);
  const hip = add(ft.ankle, mul([Math.cos(ang), Math.sin(ang)], S.legL * 0.999));
  const sh = add(ft.ankle, mul([Math.cos(ang), Math.sin(ang)], L));
  return { hip, trunk: ang * R2D, feet: feet2(S, toeX, 62), arms: { hand: [sh[0] + 0.04, 0.0] } };
}
function benchPose(S, f) {
  const benchY = 0.45, hip = [0, benchY + 0.10];
  const sh = [-S.trunk.L, benchY + 0.10];
  const barY = lerp(sh[1] + S.armL * 0.985, benchY + 0.22 + 0.06, f);
  return { hip, trunk: 180, feet: feet2(S, 0.36 + S.toeToAnkle), arms: { hand: [sh[0] + lerp(0, 0.12, f), barY] } };
}
function stsPose(S, k) {
  const ank = [-S.toeToAnkle, S.ankleH];
  const ft = feet2(S, 0);
  if (k === 0) return { hip: [ank[0] - S.thigh.L * 0.98, 0.47 + 0.08], trunk: 92, feet: ft, arms: { ua: -60, el: 100 } };
  if (k === 1) return { hip: [ank[0] - S.thigh.L * 0.92, 0.47 + 0.10], trunk: 52, feet: ft, arms: { ua: -60, el: 100 } };
  return { hip: [ank[0] - 0.02, S.ankleH + S.legL * 0.993], trunk: 89, feet: ft, arms: { ua: -60, el: 100 } };
}
function calfPose(S, fa) {
  const ft = footPts(S, [0, 0], fa);
  const hx = fa > 5 ? -0.035 : ft.ankle[0] + 0.03; return { hip: [hx, ft.ankle[1] + Math.sqrt((S.legL * 0.993) ** 2 - (hx - ft.ankle[0]) ** 2)], trunk: 89, feet: feet2(S, 0, fa), arms: { ua: -90, el: 0 } };
}
function curlPose(S, el) {
  return { hip: [-S.toeToAnkle + 0.02, S.ankleH + S.legL * 0.993], trunk: 90, feet: feet2(S, 0), arms: { ua: -88, el } };
}
// ---------- interpolation ----------
function interp(a, b, s) {
  if (typeof a === 'number') return lerp(a, b, s);
  if (typeof a === 'string') return a;
  if (Array.isArray(a)) return a.map((x, i) => interp(x, b[i], s));
  const o = {}; for (const k in a) o[k] = interp(a[k], b[k], s); return o;
}
export function buildTimeline(ex, S) {
  const P = {}; for (const k in ex.poses) P[k] = ex.poses[k](S);
  let t = 0; const ph = ex.phases.map(([name, kind, dur, from, to]) => { const o = { name, kind, dur, from, to, t0: t }; t += dur; return o; });
  return { P, phases: ph, T: t };
}
export function phaseAt(tl, t) {
  t = ((t % tl.T) + tl.T) % tl.T;
  for (const p of tl.phases) if (t < p.t0 + p.dur) return { p, s: (t - p.t0) / p.dur };
  const p = tl.phases[tl.phases.length - 1]; return { p, s: 1 };
}
export function poseAt(tl, t) { const { p, s } = phaseAt(tl, t); const e = (1 - Math.cos(Math.PI * s)) / 2; return interp(tl.P[p.from], tl.P[p.to], e); }
// ---------- forward kinematics ----------
export function solve(ex, S, pose, loadKg) {
  const hip = pose.hip, tdir = dir(pose.trunk), sh = add(hip, mul(tdir, S.trunk.L));
  const head = add(sh, mul(tdir, S.head.L));
  const legs = pose.feet.map(f => { const fp = footPts(S, [f.toe, 0], f.fa); const k = ik(fp.ankle, hip, S.shank.L, S.thigh.L, -1); return { ...fp, knee: k.mid, hip: k.end }; });
  // ventral (front) normal of the trunk
  const nb = [tdir[1], -tdir[0]]; // pointing to the back
  let bar = null, elbow, hand;
  const handLen = S.hand.L;
  if (ex.loadAt === 'hip') bar = add(hip, add(mul(nb, 0.13), mul(tdir, 0.03)));
  if (ex.loadAt === 'back') bar = add(sh, add(mul(nb, -0.07), mul(tdir, -0.04)));
  const a = pose.arms;
  if (a.handRel === 'bar' && bar) { const r = ik(sh, ex.loadAt === 'back' ? add(bar, mul(nb, 0.0)) : add(bar, [0, 0]), S.upperarm.L, S.forearm.L, -1); elbow = r.mid; hand = r.end; }
  else if (a.hand) { const r = ik(sh, a.hand, S.upperarm.L, S.forearm.L, -1); elbow = r.mid; hand = r.end; }
  else { elbow = add(sh, mul(dir(a.ua), S.upperarm.L)); hand = add(elbow, mul(dir(a.ua + a.el), S.forearm.L)); }
  const fdir = mul(sub(hand, elbow), 1 / S.forearm.L), handC = add(hand, mul(fdir, handLen * 0.5));
  if (ex.loadAt === 'hands') bar = ex.supine || ex.plank ? hand : handC;
  if (ex.loadAt === 'trunk') bar = add(hip, add(mul(tdir, S.trunk.L * 0.6), mul(nb, -0.02)));
  if (ex.supine && bar) bar = add(hand, [0, 0.02]);
  // segments with masses (both sides counted)
  const segs = [];
  const seg = (name, p, d, m, c, side) => segs.push({ name, p, d, m, com: add(p, mul(sub(d, p), c)), side });
  seg('head', sh, head, S.head.m, S.head.c, 0);
  seg('trunk', hip, sh, S.trunk.m, S.trunk.c, 0);
  for (const sd of [0, 1]) {
    const l = legs[sd];
    seg('thigh', l.hip, l.knee, S.thigh.m, S.thigh.c, sd); seg('shank', l.knee, l.ankle, S.shank.m, S.shank.c, sd);
    segs.push({ name: 'foot', p: l.heel, d: l.toe, m: S.foot.m, com: add(l.heel, mul(sub(l.toe, l.heel), S.foot.c)), side: sd });
    seg('upperarm', sh, elbow, S.upperarm.m, S.upperarm.c, sd); seg('forearm', elbow, hand, S.forearm.m, S.forearm.c, sd);
    seg('hand', hand, add(hand, mul(fdir, handLen)), S.hand.m, S.hand.c, sd);
  }
  let mx = 0, my = 0; for (const s of segs) { mx += s.m * s.com[0]; my += s.m * s.com[1]; }
  const cogBody = [mx / S.mass, my / S.mass];
  const M = S.mass + loadKg;
  const cog = bar && loadKg > 0 ? [(mx + loadKg * bar[0]) / M, (my + loadKg * bar[1]) / M] : cogBody;
  // joint angles (deg)
  const L0 = legs[0];
  const tU = sub(sh, hip), th = sub(L0.knee, L0.hip), shk = sub(L0.ankle, L0.knee), ftv = sub(L0.toe, L0.heel);
  const ang = (a, b) => Math.atan2(cross(a, b), dot(a, b)) * R2D;
  // hip flexion: angle between trunk extended downward and thigh
  const hipFlex = ang(mul(tU, -1), th) * 1; // +ve = thigh rotated CCW (forward) from trunk line
  const kneeFlex = Math.abs(ang(th, shk));
  const ankle = Math.abs(ang(mul(shk, -1), ftv)); // 90 = neutral (shank ⟂ foot)
  const ua = sub(elbow, sh), fa = sub(hand, elbow);
  const shoulderFlex = ang(mul(tU, -1), ua);
  const elbowFlex = Math.abs(ang(ua, fa));
  const angles = { hip: hipFlex, knee: kneeFlex, ankle, shoulder: shoulderFlex, elbow: elbowFlex };
  if (ex.split) { const L1 = legs[1]; angles.hipR = ang(mul(tU, -1), sub(L1.knee, L1.hip)); angles.kneeR = Math.abs(ang(sub(L1.knee, L1.hip), sub(L1.ankle, L1.knee))); }
  return { hip, sh, head, legs, elbow, hand, bar, segs, cogBody, cog, angles, tdir, nb, M };
}
// ---------- kinetics ----------
// Supports: two-support vertical equilibrium about combined CoG.
export function supportsFor(ex, S, k, pose, t, tl) {
  let types = ex.supports;
  if (ex.seatOff) { const { p } = phaseAt(tl, t); if (p.name === 'Extension (rise)' || p.name === 'Standing' || (p.name === 'Sit down' && phaseAt(tl, t).s < 0.75)) types = ['feet']; }
  const L0 = k.legs[0], L1 = k.legs[1];
  const pts = [];
  for (const ty of types) {
    if (ty === 'feet') { const onToes = L0.heel[1] > 0.02; pts.push({ id: 'feet', label: onToes ? 'GRFy (forefoot)' : 'GRFy', x: null, y: 0, legs: [0, 1], heel: onToes ? L0.toe[0] - 0.07 : Math.min(L0.heel[0], L0.toe[0]), toe: Math.max(L0.heel[0], L0.toe[0]) }); }
    if (ty === 'toes') pts.push({ id: 'feet', label: 'GRFy (toes)', x: L0.toe[0], y: 0, legs: [0, 1] });
    if (ty === 'frontFoot') pts.push({ id: 'front', label: 'GRFy front', x: L0.ankle[0] + 0.04, y: 0, legs: [0] });
    if (ty === 'rearFoot') pts.push({ id: 'rear', label: 'GRFy rear', x: L1.toe[0] - 0.03, y: 0, legs: [1] });
    if (ty === 'bench') { const p = add(k.sh, mul(k.tdir, -0.07)); pts.push({ id: 'bench', label: 'Bench reaction', x: p[0], y: (ex.benchH || 0.42) }); }
    if (ty === 'floorBack') { const p = add(k.sh, mul(k.tdir, -0.06)); pts.push({ id: 'bench', label: 'Floor reaction (back)', x: p[0], y: 0 }); }
    if (ty === 'benchBack') { const p = add(k.hip, mul(k.tdir, S.trunk.L * 0.55)); pts.push({ id: 'bench', label: 'Bench reaction', x: p[0], y: 0.45 }); }
    if (ty === 'seat') pts.push({ id: 'seat', label: 'Seat reaction', x: k.hip[0] + 0.06, y: 0.47 });
    if (ty === 'hands') pts.push({ id: 'hands', label: 'Hand reaction', x: k.hand[0], y: 0, arms: true });
  }
  return pts;
}
export function kinetics(ex, S, k, sup, loadKg, aCog, aBar) {
  const Ftot = k.M * (G + aCog);
  const xc = k.cog[0];
  let warn = '';
  if (sup.length === 1) {
    const s = sup[0];
    if (s.x == null) { const lo = Math.min(s.heel, s.toe), hi = Math.max(s.heel, s.toe); s.x = Math.min(hi, Math.max(lo, xc)); if (xc < lo - 0.005 || xc > hi + 0.005) warn = 'CoG outside base of support – not statically stable'; }
    s.F = Ftot;
  } else if (ex.supine) { // distributed bench contact: feet carry the lower legs (+½ thighs)
    const [a, b] = sup; for (const s of sup) if (s.x == null) s.x = k.legs[0].ankle[0] + 0.04;
    b.F = Math.min(Ftot, 2 * (S.shank.m + S.foot.m + 0.5 * S.thigh.m) * G); a.F = Ftot - b.F;
  } else {
    const [a, b] = sup;
    for (const s of sup) if (s.x == null) s.x = k.legs[0].ankle[0] + 0.04;
    let Fa = Ftot * (b.x - xc) / (b.x - a.x);
    if (Fa < 0 || Fa > Ftot) warn = 'CoG outside the supports – reaction clamped';
    Fa = Math.min(Ftot, Math.max(0, Fa)); a.F = Fa; b.F = Ftot - Fa;
  }
  // per-leg GRF
  const legF = [0, 0], legX = [0, 0];
  for (const s of sup) if (s.legs) { for (const l of s.legs) { legF[l] += s.F / s.legs.length; legX[l] = s.x; } }
  const handS = sup.find(s => s.arms);
  // inverse statics: bottom-up legs, top-down arms. Internal moment = −Σ r×F (z) of forces on the distal part.
  const g = G;
  const segOf = (n, sd) => k.segs.find(s => s.name === n && s.side === sd);
  const legM = [0, 1].map(sd => {
    const L = k.legs[sd], ext = (J, names) => { let m = legF[sd] * (legX[sd] - J[0]); for (const n of names) { const s = segOf(n, sd); m += -s.m * g * (s.com[0] - J[0]); } return -m; };
    return { ankle: ext(L.ankle, ['foot']), knee: ext(L.knee, ['foot', 'shank']), hip: ext(L.hip, ['foot', 'shank', 'thigh']) };
  });
  // arms (per side)
  const perHandLoad = ex.loadAt === 'hands' ? loadKg / 2 : 0;
  const Fload = perHandLoad * (g + aBar);
  const handR = handS ? handS.F / 2 : 0;
  const armExt = (J, names) => { let m = 0; for (const n of names) { const s = segOf(n, 0); m += -s.m * g * (s.com[0] - J[0]); } m += -Fload * (k.bar ? k.bar[0] - J[0] : 0) + handR * (k.hand[0] - J[0]); return -m; };
  const armM = { elbow: armExt(k.elbow, ['forearm', 'hand']), shoulder: armExt(k.sh, ['upperarm', 'forearm', 'hand']) };
  const Fbar = loadKg * (G + aBar);
  return { Ftot, Fbar, sup, legM, armM, warn, legF, legX };
}
// sign → label. Internal +CCW: knee extensor, hip flexor, ankle dorsiflexor, elbow flexor, shoulder flexor
export function momentLabel(j, m) {
  const p = m >= 0;
  return { ankle: p ? 'dorsiflexor' : 'plantarflexor', knee: p ? 'extensor' : 'flexor', hip: p ? 'flexor' : 'extensor', elbow: p ? 'flexor' : 'extensor', shoulder: p ? 'flexor' : 'extensor' }[j];
}
// full evaluation at time t with numerical acceleration
export function evaluate(ex, S, tl, t, loadKg, dt = 0.02) {
  const at = tt => solve(ex, S, poseAt(tl, tt), loadKg);
  const k0 = at(t - dt), k1 = at(t), k2 = at(t + dt);
  const yb = k => (k.bar ? k.bar[1] : k.cog[1]);
  const aCog = (k2.cog[1] - 2 * k1.cog[1] + k0.cog[1]) / (dt * dt);
  const aBar = (yb(k2) - 2 * yb(k1) + yb(k0)) / (dt * dt);
  const vBar = (yb(k2) - yb(k0)) / (2 * dt), vCog = (k2.cog[1] - k0.cog[1]) / (2 * dt);
  const sup = supportsFor(ex, S, k1, poseAt(tl, t), t, tl);
  const kin = kinetics(ex, S, k1, sup, loadKg, aCog, aBar);
  const { p, s } = phaseAt(tl, t);
  return { k: k1, kin, aCog, aBar, vBar, vCog, phase: p, s, power: kin.Fbar * vBar, powerCog: kin.Ftot * vCog };
}
// range stats across concentric phase (ΔU, work, average power)
export function energy(ex, S, tl, loadKg) {
  const ys = [], yc = [], ycb = []; let tmin = 0, tmax = 0;
  const N = 200; for (let i = 0; i < N; i++) { const t = tl.T * i / N; const k = solve(ex, S, poseAt(tl, t), loadKg); ys.push(k.bar ? k.bar[1] : k.cog[1]); yc.push(k.cog[1]); ycb.push(k.cogBody[1]); }
  const r = a => Math.max(...a) - Math.min(...a);
  const dhBar = r(ys), dhCog = r(yc), dhBody = r(ycb);
  const con = tl.phases.filter(p => p.kind === 'con').reduce((a, p) => a + p.dur, 0) || 1;
  const dUbar = loadKg * G * dhBar, dUbody = S.mass * G * dhBody, dUcog = (S.mass + loadKg) * G * dhCog;
  return { dhBar, dhCog, dhBody, dUbar, dUbody, dUcog, Wtotal: dUbar + dUbody, Pavg: (dUbar + dUbody) / con, conT: con };
}
export const fmt = (x, d = 1) => (Math.abs(x) < 1e-9 ? 0 : x).toFixed(d);
