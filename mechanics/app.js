import * as THREE from 'three';
import { OrbitControls } from '../biomech/vendor/OrbitControls.js';
import * as M from './model.js';
const $ = s => document.querySelector(s);
const Y = 0xf5c518, T = 0x2dd4bf, PINK = 0xff6fb5;
const st = { ex: M.EXERCISES[0], mass: 70, height: 1.75, load: 60, t: 0, playing: true, speed: 1, side: false, tab: 2,
  show: { joints: true, lengths: true, cog: true, bos: true, forces: true, arms: true }, cam: null };
let S, tl, en, last = null;
// ---------- three setup ----------
const canvas = $('#three');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 50);
let camera = persp;
const controls = new OrbitControls(persp, canvas); controls.enableDamping = true; controls.target.set(0, 0.6, 0);
scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x1a2230, 1.4));
const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 4, 3); scene.add(dl);
const grid = new THREE.GridHelper(6, 24, 0x2a3a4c, 0x18222e); scene.add(grid);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x0e151d, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; scene.add(floor);
const root = new THREE.Group(); scene.add(root);
const bodyG = new THREE.Group(), equipG = new THREE.Group(), ovG = new THREE.Group(); root.add(bodyG, equipG, ovG);
const matBody = new THREE.MeshStandardMaterial({ color: 0x9fb3c8, roughness: .55, metalness: .05 });
const matBody2 = new THREE.MeshStandardMaterial({ color: 0x6f8399, roughness: .6 });
const matJoint = new THREE.MeshStandardMaterial({ color: Y, emissive: 0x3a2e00 });
const matSteel = new THREE.MeshStandardMaterial({ color: 0xc0c8d0, metalness: .8, roughness: .3 });
const matPlate = new THREE.MeshStandardMaterial({ color: 0x1d2633, roughness: .5, transparent: true, opacity: .7 });
const matBench = new THREE.MeshStandardMaterial({ color: 0x334356, roughness: .8 });
// capsule segment helper
const UP = new THREE.Vector3(0, 1, 0);
// Build capsule meshes with unit length then scale Y; radius preserved by CapsuleGeometry caps distortion → use cylinder + spheres instead
function seg(r, mat) { const g = new THREE.Group(); const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 16), mat); const s1 = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat), s2 = s1.clone(); g.add(cyl, s1, s2); g.userData = { cyl, s1, s2 }; bodyG.add(g); return g; }
function setSeg(g, a, b) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = Math.max(1e-4, d.length());
  const { cyl, s1, s2 } = g.userData; cyl.position.copy(A).add(B).multiplyScalar(.5); cyl.quaternion.setFromUnitVectors(UP, d.clone().normalize()); cyl.scale.set(1, L, 1); s1.position.copy(A); s2.position.copy(B); }
const SEGS = {}; const mk = (n, r, m) => SEGS[n] = seg(r, m);
for (const s of ['0', '1']) { const mt = s === '0' ? matBody : matBody2; mk('thigh' + s, .062, mt); mk('shank' + s, .045, mt); mk('foot' + s, .03, mt); mk('ua' + s, .042, mt); mk('fa' + s, .034, mt); mk('hand' + s, .03, mt); }
mk('pelvis', .1, matBody); mk('trunk', .115, matBody); mk('neck', .05, matBody); mk('shoulders', .06, matBody);
const headM = new THREE.Mesh(new THREE.SphereGeometry(.105, 24, 18), matBody); bodyG.add(headM);
const jointMs = []; for (let i = 0; i < 16; i++) { const j = new THREE.Mesh(new THREE.SphereGeometry(.028, 12, 10), matJoint); j.renderOrder = 5; bodyG.add(j); jointMs.push(j); }
// ---------- text sprites ----------
function label(text, color = '#e8edf3', size = 1) { const c = document.createElement('canvas'), x = c.getContext('2d'); c.width = 512; c.height = 96;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10; sp.userData = { c, x, tex, text: null, color, size }; sp.scale.set(0.42 * size, 0.079 * size, 1); setLabel(sp, text, color); return sp; }
function setLabel(sp, text, color) { const u = sp.userData; color = color || u.color; if (u.text === text && u.color === color) return; u.text = text; u.color = color;
  const { x, c } = u; x.clearRect(0, 0, c.width, c.height); x.font = '600 44px ui-monospace,Menlo,Consolas,monospace'; const w = Math.min(c.width - 4, x.measureText(text).width + 28);
  x.fillStyle = 'rgba(11,15,20,.78)'; x.beginPath(); x.roundRect((c.width - w) / 2, 10, w, 76, 16); x.fill(); x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, 50); u.tex.needsUpdate = true; }
// overlay pools
const pool = { arrows: [], labels: [], lines: [] };
let used = { arrows: 0, labels: 0, lines: 0 };
function arrow(from, dirv, lenM, color, txt) { let a = pool.arrows[used.arrows]; if (!a) { a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, color, .08, .05); a.line.material.linewidth = 2; a.traverse(o => { if (o.material) { o.material.depthTest = false; o.renderOrder = 8; } }); ovG.add(a); pool.arrows.push(a); }
  used.arrows++; a.visible = true; a.position.set(...from); a.setDirection(new THREE.Vector3(...dirv).normalize()); a.setLength(Math.max(.06, lenM), Math.min(.1, lenM * .35 + .03), .05); a.setColor(color);
  // thick shaft
  if (!a.userData.shaft) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1, 8), new THREE.MeshBasicMaterial({ color, depthTest: false })); sh.renderOrder = 8; a.add(sh); a.userData.shaft = sh; }
  const L = Math.max(.06, lenM) - Math.min(.1, lenM * .35 + .03); a.userData.shaft.scale.set(1, Math.max(.001, L), 1); a.userData.shaft.position.set(0, L / 2, 0); a.userData.shaft.material.color.set(color);
  if (txt) { const end = [from[0] + dirv[0] * lenM, from[1] + dirv[1] * lenM, from[2] + dirv[2] * lenM]; lab(txt.p || end, txt.s, '#' + new THREE.Color(color).getHexString()); } }
function lab(p, text, color) { let s = pool.labels[used.labels]; if (!s) { s = label(text, color); ovG.add(s); pool.labels.push(s); } used.labels++; s.visible = true; setLabel(s, text, color); s.position.set(...p); }
function line(pts, color, dashed) { let l = pool.lines[used.lines]; if (!l) { l = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color, dashSize: .03, gapSize: .02, depthTest: false })); l.renderOrder = 7; ovG.add(l); pool.lines.push(l); }
  used.lines++; l.visible = true; l.geometry.setFromPoints(pts.map(p => new THREE.Vector3(...p))); l.computeLineDistances(); l.material.color.set(color); l.material.dashSize = dashed ? .03 : 10; }
const cogM = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 12), new THREE.MeshBasicMaterial({ color: Y, depthTest: false })); cogM.renderOrder = 9;
const cogRing = new THREE.Mesh(new THREE.TorusGeometry(.055, .01, 8, 24), new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false })); cogRing.renderOrder = 9;
const cogB = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe8edf3, depthTest: false })); cogB.renderOrder = 9;
ovG.add(cogM, cogRing, cogB);
const bosMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: T, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false })); ovG.add(bosMesh);
// ---------- equipment ----------
function buildEquip() {
  equipG.clear(); const ex = st.ex, eq = ex.equip, k = last && last.k;
  const P = tl.P[Object.keys(tl.P)[0]];
  if (eq.includes('barbell')) { const g = new THREE.Group(); g.name = 'bar'; const bar = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, 2.1, 12), matSteel); bar.rotation.x = Math.PI / 2; g.add(bar);
    const plateKg = Math.max(0, (st.load - 20) / 2); const r = plateKg > 0 ? .225 : .0; if (r) { const th = Math.min(.12, .025 + plateKg * .0018); for (const z of [-.78, .78]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, 40), matPlate); p.rotation.x = Math.PI / 2; p.position.z = z; g.add(p); const rim = new THREE.Mesh(new THREE.TorusGeometry(r - .01, .008, 6, 40), new THREE.MeshBasicMaterial({ color: Y })); rim.position.z = z + Math.sign(z) * th / 2; g.add(rim); } }
    equipG.add(g); }
  if (eq.includes('dumbbells')) for (const z of [1, -1]) { const g = new THREE.Group(); g.name = 'db' + z; const h = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .16, 10), matSteel); h.rotation.x = Math.PI / 2; g.add(h);
    const r = .045 + Math.min(.06, st.load * .002); for (const zz of [-.09, .09]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .05, 6), matPlate); p.rotation.x = Math.PI / 2; p.position.z = zz; g.add(p); } equipG.add(g); }
  if (eq.includes('bench')) { const k0 = M.solve(ex, S, tl.P.top, st.load); const b = new THREE.Mesh(new THREE.BoxGeometry(.38, .42, 1.2), matBench); b.position.set(k0.sh[0] - .12, .21, 0); equipG.add(b); }
  if (eq.includes('flatbench')) { const k0 = M.solve(ex, S, tl.P.top, st.load); const x0 = k0.sh[0] - .3, x1 = k0.hip[0] + .15; const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, .45, .3), matBench); b.position.set((x0 + x1) / 2, .225, 0); equipG.add(b);
    for (const z of [-.55, .55]) { const up = new THREE.Mesh(new THREE.BoxGeometry(.05, 1.1, .05), matBench); up.position.set(k0.sh[0] - .05, .55, z); equipG.add(up); } }
  if (eq.includes('chair')) { const k0 = M.solve(ex, S, tl.P.sit, st.load); const b = new THREE.Mesh(new THREE.BoxGeometry(.42, .06, .45), matBench); b.position.set(k0.hip[0] + .05, .44, 0); equipG.add(b);
    for (const [dx, dz] of [[-.18, -.19], [.18, -.19], [-.18, .19], [.18, .19]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.03, .44, .03), matBench); l.position.set(k0.hip[0] + .05 + dx, .22, dz); equipG.add(l); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(.04, .45, .45), matBench); back.position.set(k0.hip[0] + .05 - .2, .69, 0); equipG.add(back); }
}
// ---------- recompute ----------
function rebuild() { S = M.anthro(st.mass, st.height); tl = M.buildTimeline(st.ex, S); en = M.energy(st.ex, S, tl, st.load); buildEquip(); renderChips(); renderLesson(); frameCam(); }
function frameCam() { // centre of model bounding box over the cycle
  let x0 = 9, x1 = -9, y1 = 0; for (let i = 0; i < 12; i++) { const k = M.solve(st.ex, S, M.poseAt(tl, tl.T * i / 12), st.load); for (const p of [k.head, k.sh, k.hip, k.hand, k.legs[0].toe, k.legs[1].toe, k.legs[0].heel, k.legs[1].heel]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } }
  st.box = { cx: (x0 + x1) / 2, w: x1 - x0 + .5, h: y1 + .25 }; root.position.x = -st.box.cx;
  controls.target.set(0, st.box.h * .42, 0); const d = Math.max(st.box.w, st.box.h) * 1.55 + .6; persp.position.set(d * .55, st.box.h * .55 + .4, d * .85); persp.lookAt(controls.target); resize(); }
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); persp.aspect = w / h; persp.updateProjectionMatrix();
  if (st.box) { const a = w / h; let hh = Math.max(st.box.h + .35, (st.box.w + .3) / a) / 2; ortho.left = -hh * a; ortho.right = hh * a; ortho.top = hh; ortho.bottom = -hh; ortho.position.set(0, st.box.h / 2 - .05, 6); ortho.lookAt(0, st.box.h / 2 - .05, 0); ortho.updateProjectionMatrix(); } }
addEventListener('resize', resize); new ResizeObserver(resize).observe(canvas);
// ---------- per-frame update ----------
const Z = { leg: [.1, -.1], arm: () => st.ex.id === 'bench' || st.ex.id === 'hipthrust' || st.ex.id === 'bridge' ? .24 : st.ex.id === 'pushup' ? .2 : .19 };
const p3 = (p, z = 0) => [p[0], p[1], z];
function update() {
  const ex = st.ex; let r;
  if (st.cam && st.cam.res) r = st.cam.res; else r = M.evaluate(ex, S, tl, st.t, st.load);
  last = r; const k = r.k, kin = r.kin;
  // body
  for (const s of [0, 1]) { const L = k.legs[s], z = Z.leg[s]; setSeg(SEGS['thigh' + s], p3(L.hip, z), p3(L.knee, z)); setSeg(SEGS['shank' + s], p3(L.knee, z), p3(L.ankle, z)); setSeg(SEGS['foot' + s], p3([L.heel[0], L.heel[1] + .03], z), p3([L.toe[0], L.toe[1] + .025], z));
    const za = (s ? -1 : 1) * Z.arm(); const fd = [k.hand[0] - k.elbow[0], k.hand[1] - k.elbow[1]], fl = Math.hypot(...fd);
    setSeg(SEGS['ua' + s], p3(k.sh, za), p3(k.elbow, za)); setSeg(SEGS['fa' + s], p3(k.elbow, za), p3(k.hand, za)); setSeg(SEGS['hand' + s], p3(k.hand, za), p3([k.hand[0] + fd[0] / fl * .07, k.hand[1] + fd[1] / fl * .07], za)); }
  const td = k.tdir, nb = k.nb, nbx = (p, a) => [p[0] - nb[0] * a, p[1] - nb[1] * a];
  setSeg(SEGS.pelvis, p3(nbx(k.hip, .02), .09), p3(nbx(k.hip, .02), -.09)); setSeg(SEGS.trunk, p3([k.hip[0] + td[0] * .1, k.hip[1] + td[1] * .1]), p3([k.sh[0] - td[0] * .06, k.sh[1] - td[1] * .06]));
  setSeg(SEGS.shoulders, p3(k.sh, Z.arm() - .04), p3(k.sh, -Z.arm() + .04)); const hc = [k.sh[0] + td[0] * S.head.L * .62, k.sh[1] + td[1] * S.head.L * .62];
  setSeg(SEGS.neck, p3(k.sh), p3([k.sh[0] + td[0] * .1, k.sh[1] + td[1] * .1])); headM.position.set(hc[0], hc[1], 0); headM.scale.setScalar(st.height / 1.75);
  const J = [[k.sh, Z.arm()], [k.elbow, Z.arm()], [k.hand, Z.arm()], [k.sh, -Z.arm()], [k.elbow, -Z.arm()], [k.hand, -Z.arm()], [k.hip, 0]];
  for (const s of [0, 1]) { const L = k.legs[s]; J.push([L.hip, Z.leg[s]], [L.knee, Z.leg[s]], [L.ankle, Z.leg[s]], [L.toe, Z.leg[s]]); }
  jointMs.forEach((m, i) => { m.visible = st.show.joints && i < J.length; if (i < J.length) m.position.set(...p3(J[i][0], J[i][1] + (J[i][1] >= 0 ? .045 : -.045))); });
  // equipment follow
  const bar = equipG.getObjectByName('bar'); if (bar && k.bar) bar.position.set(k.bar[0], k.bar[1], 0);
  for (const z of [1, -1]) { const d = equipG.getObjectByName('db' + z); if (d && k.bar) d.position.set(k.bar[0], k.bar[1], z * (Z.arm() + .02)); }
  // overlays
  used = { arrows: 0, labels: 0, lines: 0 }; const SC = 1 / 1500; const zf = .32;
  const show = st.show;
  if (show.forces) {
    const W = S.mass * M.G; arrow(p3(k.cogBody, zf), [0, -1, 0], W * SC, Y, { s: `mg ${M.fmt(W, 0)} N`, p: [k.cogBody[0] + .02, k.cogBody[1] - W * SC - .06, zf] });
    if (k.bar && st.load > 0) { const F = st.load * M.G; arrow(p3(k.bar, zf + .1), [0, -1, 0], F * SC, Y, { s: `mg ${M.fmt(F, 0)} N`, p: [k.bar[0] + .02, k.bar[1] + .09, zf + .1] }); }
    for (const sp of kin.sup) { if (!(sp.F > 1)) continue; const L = sp.F * SC; arrow([sp.x, sp.y, zf], [0, 1, 0], L, T, { s: `${sp.label} ${M.fmt(sp.F, 0)} N`, p: [sp.x, sp.y + L + .06, zf] }); }
  }
  if (show.arms) { const L0 = k.legs[0], fx = kin.legX[0];
    if (kin.legF[0] > 1) for (const [j, nm] of [[L0.ankle, 'A'], [L0.knee, 'K'], [L0.hip, 'H']]) { line([p3(j, zf), p3([fx, j[1]], zf)], PINK, true); line([p3([fx, 0], zf), p3([fx, Math.max(L0.hip[1], j[1]) + .05], zf)], T, true); }
    if (k.bar && st.load > 0 && (st.ex.loadAt === 'hands' || st.ex.loadAt === 'back' || st.ex.loadAt === 'hip')) { const tgt = st.ex.loadAt === 'hands' ? [k.elbow, k.sh] : [k.hip]; for (const j of tgt) line([p3(j, zf + .1), p3([k.bar[0], j[1]], zf + .1)], PINK, true); line([p3([k.bar[0], 0], zf + .1), p3(k.bar, zf + .1)], Y, true); }
  }
  if (show.lengths) { const L0 = k.legs[0]; const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const items = [[L0.knee, L0.ankle, S.shank.L], [L0.hip, L0.knee, S.thigh.L], [k.hip, k.sh, S.trunk.L], [k.sh, k.elbow, S.upperarm.L], [k.elbow, k.hand, S.forearm.L]];
    for (const [a, b, Lm] of items) { const m = mid(a, b), d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d), off = [-d[1] / n * .09, d[0] / n * .09]; lab([m[0] + off[0], m[1] + off[1], .36], `${Lm.toFixed(2)} m`, '#9fb3c8'); } }
  cogM.visible = cogRing.visible = cogB.visible = show.cog; if (show.cog) { cogM.position.set(...p3(k.cog, zf)); cogRing.position.copy(cogM.position); cogB.position.set(...p3(k.cogBody, zf - .02)); lab([k.cog[0] - .26, k.cog[1] - .1, zf], 'CoG body+load', '#f5c518'); }
  bosMesh.visible = show.bos; if (show.bos) { const tris = []; const quad = (x0, x1, y, z0, z1) => tris.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
    for (const sp of kin.sup) { if (sp.legs) for (const l of sp.legs) { const L = k.legs[l]; const z = Z.leg[l]; const lo = Math.min(L.heel[0], L.toe[0]), hi = Math.max(L.heel[0], L.toe[0]); const onT = L.heel[1] > .02; quad(onT ? L.toe[0] - .07 : lo, hi, .004, z - .05, z + .05); }
      else if (sp.arms) for (const z of [Z.arm(), -Z.arm()]) quad(sp.x - .05, sp.x + .05, .004, z - .05, z + .05); else quad(sp.x - .08, sp.x + .08, sp.y + .004, -.2, .2); }
    if (kin.sup.length > 1 || kin.sup[0].legs) { const xs = kin.sup.map(s => s.x); const y0 = 0.003; quad(Math.min(...xs) - .02, Math.max(...xs) + .02, y0, -.16, .16); }
    bosMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3)); bosMesh.geometry.computeBoundingSphere(); }
  for (const key of ['arrows', 'labels', 'lines']) for (let i = used[key]; i < pool[key].length; i++) pool[key][i].visible = false;
  renderPanels(r);
}
// ---------- UI ----------
const TABS = ['Setup', 'Kinematics', 'Force & Energy', 'Joint moments', 'Muscles', 'Common faults'];
$('#tabs').innerHTML = TABS.map((t, i) => `<button role="tab" data-i="${i}"><b>${String(i + 1).padStart(2, '0')}</b>${t}</button>`).join('');
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.tab = +b.dataset.i; renderLesson(); };
$('#exSel').innerHTML = M.EXERCISES.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
$('#exSel').onchange = e => { st.ex = M.EXERCISES.find(x => x.id === e.target.value); st.load = st.ex.load; $('#load').value = st.load; st.t = 0; rebuild(); seekDefault(); };
for (const id of ['mass', 'height', 'load']) $('#' + id).addEventListener('input', e => { const v = parseFloat(e.target.value); if (!isFinite(v)) return; const lim = { mass: [30, 200], height: [1.2, 2.2], load: [0, 400] }[id]; st[id] = Math.min(lim[1], Math.max(lim[0], v)); rebuild(); });
const TOG = [['joints', 'Joints'], ['lengths', 'Segment lengths'], ['cog', 'CoG'], ['bos', 'Base of support'], ['forces', 'Force vectors'], ['arms', 'Moment arms']];
$('#toggles').innerHTML = TOG.map(([k, n]) => `<button class="tog on" data-k="${k}">${n}</button>`).join('');
$('#toggles').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.show[b.dataset.k] = !st.show[b.dataset.k]; b.classList.toggle('on'); $('#legend').style.display = ''; };
function renderChips() { $('#chips').innerHTML = tl.phases.map((p, i) => `<button class="chip" data-i="${i}">${p.name}<span class="k">${{ con: 'conc', ecc: 'ecc', iso: 'iso' }[p.kind]}</span></button>`).join(''); }
$('#chips').onclick = e => { const b = e.target.closest('button'); if (!b) return; const p = tl.phases[+b.dataset.i]; st.t = p.t0 + p.dur * (p.kind === 'iso' ? .5 : .5); st.playing = false; syncPlay(); };
function seekDefault() { const p = tl.phases.find(p => p.name === (st.ex.defaultPhase || '')) || tl.phases.find(p => p.kind === 'iso'); st.t = p.t0 + p.dur / 2; }
$('#playBtn').onclick = () => { st.playing = !st.playing; syncPlay(); };
function syncPlay() { $('#playBtn').textContent = st.playing ? '❚❚' : '▶'; }
$('#scrub').oninput = e => { st.t = tl.T * e.target.value / 1000; st.playing = false; syncPlay(); };
$('#speed').onchange = e => st.speed = +e.target.value;
$('#viewBtn').onclick = () => { st.side = !st.side; camera = st.side ? ortho : persp; controls.enabled = !st.side; $('#viewBtn').classList.toggle('on', st.side); $('#viewBtn').textContent = st.side ? 'Side view 2-D ✓' : 'Side view 2-D'; resize(); };
$('#resetCam').onclick = () => frameCam();
const pad = (x, w = 5, d = 1) => { const s = Math.abs(x).toFixed(d).padStart(w, '0'); return (x < -0.05 ? '−' : '') + s; };
function renderPanels(r) {
  const ex = st.ex, k = r.k, kin = r.kin, a = k.angles, bm = S.mass;
  $('#title').textContent = ex.name; $('#kicker').textContent = `Movement Mechanics · ${String(st.tab + 1).padStart(2, '0')} ${TABS[st.tab]}`;
  $('#phasePill').textContent = (st.cam ? 'Live · ' : '') + r.phase.name; $('#modelPill').textContent = `${st.mass} kg body / ${st.load} kg ${ex.loadLabel.split(' ')[0]}`;
  if (!st.cam) $('#scrub').value = Math.round((st.t % tl.T) / tl.T * 1000);
  [...$('#chips').children].forEach((c, i) => c.classList.toggle('on', tl.phases[i] === r.phase));
  const lm = kin.legM[0], am = kin.armM;
  const card = (l, v, m, j) => `<div class="acard"><div class="l">${l}</div><div class="v">${pad(v, 5)}<small>°</small></div>${m != null ? `<div class="m">${M.fmt(Math.abs(m), 0)} N·m ${M.momentLabel(j, m)}</div>` : ''}</div>`;
  let h = card('Hip flexion', a.hip, lm.hip, 'hip') + card('Knee flexion', a.knee, lm.knee, 'knee') + card('Ankle', a.ankle, lm.ankle, 'ankle');
  if (['bench', 'pushup', 'curl', 'deadlift'].includes(ex.id) || st.cam) h += card('Shoulder flexion', a.shoulder, am.shoulder, 'shoulder') + card('Elbow flexion', a.elbow, am.elbow, 'elbow');
  if (ex.split && !st.cam) h += card('Rear hip', a.hipR, kin.legM[1].hip, 'hip') + card('Rear knee', a.kneeR, kin.legM[1].knee, 'knee');
  $('#angles').innerHTML = h;
  // science
  const g = M.G, F = kin.Fbar, Lk = st.load, isBar = Lk > 0;
  const sup = kin.sup.map(s => `<span class="t">${s.label}</span> <b>${M.fmt(s.F, 0)} N</b>`).join(' · ');
  const twoSup = kin.sup.length === 2 ? `<div class="note">Two supports solved by static equilibrium: ΣF<sub>y</sub> = 0 and ΣM<sub>CoG</sub> = 0 → F₁ = F·(x₂ − x<sub>G</sub>)/(x₂ − x₁)${ex.supine ? ' (bench contact distributed: feet assumed to carry the lower legs)' : ''}.</div>` : '';
  const jm = (n, m) => `${n} <b>${M.fmt(Math.abs(m), 0)} N·m</b> (${M.fmt(Math.abs(m) / bm, 2)} N·m/kg, ${M.momentLabel(n.toLowerCase().split(' ')[0], m)})`;
  $('#science').innerHTML = `<h3>The Science${st.cam ? ' · camera estimate' : ''}</h3>
   <div class="eq">Phase: <b>${r.phase.name}</b> (${{ con: 'concentric', ecc: 'eccentric', iso: 'isometric' }[r.phase.kind] || 'live'}) · a<sub>load</sub> = ${M.fmt(r.aBar, 2)} m/s²</div>
   ${isBar ? `<div class="eq">F<sub>y</sub> = m(g + a<sub>y</sub>) = ${Lk} × (${g} ${r.aBar < 0 ? '−' : '+'} ${M.fmt(Math.abs(r.aBar), 2)}) = <b>${M.fmt(F, 1)} N</b> <span class="note">(force on the ${ex.loadLabel})</span></div>` : ''}
   <div class="eq">ΣF<sub>support</sub> = (m<sub>body</sub>+m<sub>load</sub>)(g + a<sub>CoG</sub>) = ${M.fmt(k.M, 1)} × ${M.fmt(g + r.aCog, 2)} = <b>${M.fmt(kin.Ftot, 0)} N</b></div>
   <div class="eq">${sup}</div>${twoSup}
   ${isBar ? `<div class="eq">ΔU = mgΔh = ${Lk} × ${g} × ${M.fmt(en.dhBar, 3)} = <b>${M.fmt(en.dUbar, 0)} J</b></div><div class="note">Potential energy of the ${ex.loadLabel} per rep – not calories or total body work.</div>` : ''}
   <div class="eq">ΔU<sub>body CoG</sub> = ${bm} × ${g} × ${M.fmt(en.dhBody, 3)} = <b>${M.fmt(en.dUbody, 0)} J</b></div>
   <div class="eq">Work (concentric, load + body CoG) ≈ <b>${M.fmt(en.Wtotal, 0)} J</b> · mean power = W/t = ${M.fmt(en.Wtotal, 0)}/${M.fmt(en.conT, 1)} s = <b>${M.fmt(en.Pavg, 0)} W</b></div>
   <div class="eq">Instantaneous P = F·v = ${M.fmt(isBar ? F : kin.Ftot, 0)} × ${M.fmt(isBar ? r.vBar : r.vCog, 2)} = <b>${M.fmt(isBar ? r.power : r.powerCog, 0)} W</b></div>
   <div class="eq">Net joint moments (inverse statics, per leg): ${jm('Hip', lm.hip)}, ${jm('Knee', lm.knee)}, ${jm('Ankle', lm.ankle)}</div>
   ${kin.warn ? `<div class="warnline">⚠ ${kin.warn}</div>` : ''}
   <div class="note">Educational model; values illustrative.${st.cam ? ' Camera values are estimates; force plates are needed for measured GRF.' : ''}</div>`;
  if (st.tab === 3) renderMoments(r);
}
function renderMoments(r) { const el = $('#momTable'); if (!el) return; const kin = r.kin, k = r.k, bm = S.mass, L0 = k.legs[0];
  const rows = [['Hip', kin.legM[0].hip, L0.hip, 'hip'], ['Knee', kin.legM[0].knee, L0.knee, 'knee'], ['Ankle', kin.legM[0].ankle, L0.ankle, 'ankle'], ['Shoulder', kin.armM.shoulder, k.sh, 'shoulder'], ['Elbow', kin.armM.elbow, k.elbow, 'elbow']];
  if (st.ex.split) rows.splice(3, 0, ['Rear hip', kin.legM[1].hip, k.legs[1].hip, 'hip'], ['Rear knee', kin.legM[1].knee, k.legs[1].knee, 'knee']);
  el.innerHTML = `<tr><th>Joint</th><th>N·m</th><th>N·m/kg</th><th>Net</th><th>GRF arm (m)</th></tr>` + rows.map(([n, m, p, j]) => `<tr><td>${n}</td><td>${M.fmt(Math.abs(m), 0)}</td><td>${M.fmt(Math.abs(m) / bm, 2)}</td><td>${M.momentLabel(j, m)}</td><td>${['hip', 'knee', 'ankle'].includes(j) && !n.startsWith('Rear') ? M.fmt(Math.abs(kin.legX[0] - p[0]), 3) : '–'}</td></tr>`).join(''); }
function renderLesson() {
  [...$('#tabs').children].forEach((b, i) => b.classList.toggle('on', i === st.tab));
  const ex = st.ex, t = ex.text, mu = ex.muscles; let h = '';
  const phases = tl.phases.map(p => `${p.name} (${p.dur}s, ${{ con: 'concentric', ecc: 'eccentric', iso: 'isometric' }[p.kind]})`).join(' → ');
  if (st.tab === 0) h = `<h2>01 Setup</h2><p>${t.setup}</p><p class="note">Model: ${st.mass} kg, ${st.height} m; segment lengths and masses scaled from de Leva (1996). Thigh ${S.thigh.L.toFixed(2)} m, shank ${S.shank.L.toFixed(2)} m, trunk ${S.trunk.L.toFixed(2)} m. Load: ${st.load} kg ${ex.loadLabel}.</p>`;
  if (st.tab === 1) h = `<h2>02 Kinematics</h2><p>${t.kin}</p><p><b>Phases:</b> ${phases}</p><p class="note">Angles are sagittal-plane: hip flexion = thigh relative to the trunk line (0° = aligned), knee flexion 0° = straight, ankle = shank–foot angle (90° = neutral; &gt;90° plantarflexed).</p>`;
  if (st.tab === 2) h = `<h2>03 Force & Energy</h2><p>Newton's second law in the vertical direction gives the force needed to hold or move the load: <b>F = m(g + a)</b>. When the load is held still (a = 0) the force equals its weight; it is larger while the load accelerates upwards (start of the concentric phase or end of the eccentric phase) and smaller while it decelerates.</p><p>The change in gravitational potential energy <b>ΔU = mgΔh</b> is the mechanical work done raising the load; dividing by the time gives the mean power. Support forces (GRF, bench or hand reactions) are found from equilibrium of the whole body-plus-load system.</p>`;
  if (st.tab === 3) h = `<h2>04 Joint moments</h2><p>Net joint moment = force × perpendicular moment arm from the joint centre to the line of action. Using inverse statics from the ground reaction (bottom-up for the legs) or from the hand load (top-down for the arms) gives the net muscle moment required at each joint. Larger horizontal distance between the joint and the GRF line → larger moment.</p><table id="momTable"></table><p class="note">Net moments are the sum of all muscles, ligaments and contact forces crossing the joint – they don't give individual muscle forces. Normalised to body mass (N·m/kg) for comparison between people.</p>`;
  if (st.tab === 4) { const r = last ? last.phase : tl.phases[0]; const kind = { con: 'concentric', ecc: 'eccentric', iso: 'isometric' }[r.kind];
    const li = (role, cls, arr, k2) => arr.map(m => `<li><span class="role ${cls}">${role}</span>${m} – <i>${k2}</i></li>`).join('');
    h = `<h2>05 Muscles in action</h2><p>Current phase: <b>${r.name}</b>. Agonists act <b>${kind}</b>ally; stabilisers mostly work isometrically.</p><ul style="list-style:none;padding:0">${li('Agonist', 'r-ag', mu.agonist, kind)}${li('Synergist', 'r-sy', mu.synergist, kind)}${li('Stabiliser', 'r-st', mu.stabiliser, 'isometric')}</ul>`; }
  if (st.tab === 5) h = `<h2>06 Common faults</h2><ul>${t.faults.map(f => `<li>${f}</li>`).join('')}</ul>`;
  $('#lesson').innerHTML = h; st.lessonPhase = last && last.phase;
}
// ---------- loop ----------
let prev = performance.now();
function loop(now) { const dt = Math.min(.1, (now - prev) / 1000); prev = now;
  if (st.playing && !st.cam) st.t = (st.t + dt * st.speed) % tl.T;
  update(); if (st.tab === 4 && last && last.phase !== st.lessonPhase) renderLesson();
  controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }
// ---------- exports ----------
function snapshotCanvas() { renderer.render(scene, camera); const src = renderer.domElement, W = src.width, H = src.height, c = document.createElement('canvas'); c.width = W; c.height = H + 120; const x = c.getContext('2d');
  x.fillStyle = '#0b0f14'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 60); x.fillStyle = '#f5c518'; x.font = '600 26px ui-monospace,Menlo,monospace'; x.fillText(`3D Movement Mechanics · ${st.ex.name} · ${last.phase.name}`, 16, 38);
  x.fillStyle = '#e8edf3'; x.font = '20px ui-monospace,Menlo,monospace'; const a = last.k.angles; x.fillText(`Hip ${a.hip.toFixed(1)}°  Knee ${a.knee.toFixed(1)}°  Ankle ${a.ankle.toFixed(1)}°  F(load) ${last.kin.Fbar.toFixed(0)} N  ΣF ${last.kin.Ftot.toFixed(0)} N`, 16, H + 95);
  x.fillStyle = '#8a98a8'; x.font = '16px system-ui'; x.fillText('Educational model; values illustrative.' + (st.cam ? ' Camera estimates.' : ''), 16, H + 115); return c; }
$('#pngBtn').onclick = () => { const a = document.createElement('a'); a.href = snapshotCanvas().toDataURL('image/png'); a.download = `mechanics-${st.ex.id}.png`; a.click(); };
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); }); }
$('#pdfBtn').onclick = async () => { if (!window.jspdf) await loadScript('../biomech/vendor/jspdf.umd.min.js'); const { jsPDF } = window.jspdf; const d = new jsPDF({ unit: 'mm', format: 'a4' }); const r = last, k = r.k, kin = r.kin;
  d.setFillColor(11, 15, 20); d.rect(0, 0, 210, 26, 'F'); d.setTextColor(245, 197, 24); d.setFontSize(16); d.text('3D Movement Mechanics – summary', 12, 12); d.setFontSize(10); d.setTextColor(220); d.text(`${st.ex.name} · ${r.phase.name} · ${new Date().toLocaleString('en-GB')}`, 12, 20);
  const img = snapshotCanvas(); const iw = 186, ih = iw * img.height / img.width; d.addImage(img.toDataURL('image/jpeg', .9), 'JPEG', 12, 30, iw, Math.min(ih, 120));
  let y = 36 + Math.min(ih, 120); d.setTextColor(20); d.setFontSize(10); const L = s => { d.text(s, 12, y); y += 5.5; };
  L(`Model: body ${st.mass} kg, height ${st.height} m, load ${st.load} kg (${st.ex.loadLabel}).${st.cam ? ' CAMERA ESTIMATE.' : ''}`);
  L(`Angles: hip ${k.angles.hip.toFixed(1)}°, knee ${k.angles.knee.toFixed(1)}°, ankle ${k.angles.ankle.toFixed(1)}°, shoulder ${k.angles.shoulder.toFixed(1)}°, elbow ${k.angles.elbow.toFixed(1)}°`);
  L(`F = m(g + a) = ${st.load} × (9.81 + ${r.aBar.toFixed(2)}) = ${kin.Fbar.toFixed(0)} N;  total support force ${kin.Ftot.toFixed(0)} N`);
  L('Supports: ' + kin.sup.map(s => `${s.label} ${s.F.toFixed(0)} N`).join(', '));
  L(`ΔU load = ${en.dUbar.toFixed(0)} J (Δh ${en.dhBar.toFixed(3)} m); ΔU body CoG = ${en.dUbody.toFixed(0)} J; work ≈ ${en.Wtotal.toFixed(0)} J; mean concentric power ≈ ${en.Pavg.toFixed(0)} W`);
  for (const [n, m, j] of [['Hip', kin.legM[0].hip, 'hip'], ['Knee', kin.legM[0].knee, 'knee'], ['Ankle', kin.legM[0].ankle, 'ankle'], ['Shoulder', kin.armM.shoulder, 'shoulder'], ['Elbow', kin.armM.elbow, 'elbow']]) L(`${n}: ${Math.abs(m).toFixed(0)} N·m (${(Math.abs(m) / st.mass).toFixed(2)} N·m/kg) net ${M.momentLabel(j, m)}`);
  L('Muscles – agonists: ' + st.ex.muscles.agonist.join(', ')); L('Synergists: ' + st.ex.muscles.synergist.join(', ')); L('Stabilisers: ' + st.ex.muscles.stabiliser.join(', '));
  y += 3; d.setTextColor(120); d.text(d.splitTextToSize('Educational model; values illustrative. Sagittal rigid-segment model (de Leva 1996), inverse statics. Camera-derived values are estimates; force plates are needed for measured GRF. Not a clinical measurement.', 186), 12, y);
  d.save(`mechanics-${st.ex.id}.pdf`); };
// ---------- PWA ----------
let deferred; addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
// ---------- camera mode ----------
$('#camBtn').onclick = () => { $('#camPanel').hidden = false; };
$('#camClose').onclick = () => { import('./cam.js').then(c => c.stop()); $('#camPanel').hidden = true; st.cam = null; $('#estBadge').hidden = true; };
const camApi = { st, get S() { return S; }, M, onResult(res) { st.cam = st.cam || {}; st.cam.res = res; $('#estBadge').hidden = false; } };
document.querySelectorAll('[data-facing]').forEach(b => b.onclick = () => import('./cam.js').then(c => c.start({ facing: b.dataset.facing }, camApi)));
$('#vidFile').onchange = e => { const f = e.target.files[0]; if (f) import('./cam.js').then(c => c.start({ file: f }, camApi)); };
window.__mech = { st, rebuild, get last() { return last; }, seekDefault, setTab(i) { st.tab = i; renderLesson(); }, setEx(id) { $('#exSel').value = id; $('#exSel').onchange({ target: $('#exSel') }); }, toggleSide() { $('#viewBtn').onclick(); }, camApi };
rebuild(); seekDefault(); st.playing = false; syncPlay(); requestAnimationFrame(loop);
