// 场景 5：多视图联动 · 空中悬浮视图 · 多源信息融合
// 中心是三维现场，周围空中悬浮 5 个协同视图（监控实时画面 / 俯视地图 / 体温曲线 / 散点图 / 人员档案）。
// 任何视图里的 悬停 / 点选 / 刷选 都会同步到所有视图，并用"数据飞线"把 3D 人物与各视图中的对应数据连接起来。
import * as THREE from 'three';
import { buildCloud, BLAST, CCTV } from './crime.js';
import { holoMaterial, holoGrid, dotTexture, rng, ease, COLORS } from '../holo.js';
import { FloatPanel, FONT } from '../panels.js';
import { panel, row, button, slider, note } from '../ui.js';

const T_MIN = -8, T_MAX = 22, DT = 0.1, NS = Math.round((T_MAX - T_MIN) / DT) + 1;
const B = { x0: -7.4, x1: 7.4, z0: -3.0, z1: 10.5 };
const SURN = '陈林王张李赵刘周吴郑孙黄何高罗梁宋许韩冯邓曹彭';
const STATUS = {
  safe: { name: '安全', color: '#5ff3ff', c3: new THREE.Color(0x5ff3ff) },
  hurt: { name: '受伤', color: '#ffad3b', c3: new THREE.Color(0xffad3b) },
  dead: { name: '遇难', color: '#ff5a5a', c3: new THREE.Color(0xff5a5a) },
  suspect: { name: '嫌疑', color: '#ff4df0', c3: new THREE.Color(0xff4df0) },
};
const SEL = '#ffad3b', HOV = '#ffffff';
const TEMP_MIN = 30, TEMP_MAX = 4000;
const logT = (v) => (Math.log(v) - Math.log(TEMP_MIN)) / (Math.log(TEMP_MAX) - Math.log(TEMP_MIN));
const clamp = THREE.MathUtils.clamp;

// ---------------- 多源数据：轨迹（视觉追踪）+ 体温（热成像）+ 手机基站（通信） ----------------
function simulate(rand) {
  const people = [];
  const bx = BLAST.x, bz = BLAST.z;
  for (let i = 0; i < 24; i++) {
    const a = rand() * Math.PI * 2, r = 1.0 + Math.pow(rand(), 0.9) * 9;
    let x = clamp(bx + Math.cos(a) * r, B.x0, B.x1), z = clamp(bz + Math.sin(a) * r * 0.8, B.z0, B.z1);
    const speed = 0.1 + rand() * 0.35, h0 = rand() * Math.PI * 2, react = 0.3 + rand() * 1.2, run = 2.4 + rand() * 1.4;
    const track = new Float32Array(NS * 2), temp = new Float32Array(NS);
    let d0 = 0, dir = null, status = 'safe', h = h0, push = 0;
    for (let k = 0; k < NS; k++) {
      const t = T_MIN + k * DT;
      if (t < 0) {
        h = h0 + 0.9 * Math.sin(t * 0.25 + i * 1.7);
        x += Math.cos(h) * speed * DT; z += Math.sin(h) * speed * DT;
        if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) { x = clamp(x, B.x0, B.x1); z = clamp(z, B.z0, B.z1); }
      } else {
        if (!dir) {
          d0 = Math.hypot(x - bx, z - bz);
          dir = new THREE.Vector2(x - bx, z - bz).normalize();
          dir.rotateAround(new THREE.Vector2(), (rand() - 0.5) * 0.5);
          status = d0 < 3.0 ? 'dead' : d0 < 6.5 ? 'hurt' : 'safe';
          push = status === 'dead' ? 2.2 * (1 - d0 / 3) + 0.6 : status === 'hurt' ? 1.3 * (1 - d0 / 6.5) + 0.3 : 0.15;
        }
        let v = 0;
        if (t < 0.4) v = push / 0.4;
        else if (status === 'hurt' && t > 1.5) v = 0.25;
        else if (status === 'safe' && t > react) v = run;
        x = clamp(x + dir.x * v * DT, B.x0, B.x1); z = clamp(z + dir.y * v * DT, B.z0, B.z1);
      }
      track[k * 2] = x; track[k * 2 + 1] = z;
      temp[k] = 36.5 + 0.25 * Math.sin(t * 0.7 + i);
    }
    const peak = 420 * Math.exp(-d0 / 2.2);
    for (let k = 0; k < NS; k++) { const t = T_MIN + k * DT; if (t >= 0) temp[k] += peak * Math.exp(-t * 0.18); }
    people.push({
      id: `P${String(i + 1).padStart(2, '0')}`, name: `${SURN[i]}**`, status, d0, track, temp,
      peakT: 36.5 + peak, bts: `BTS-${1 + Math.floor(rand() * 4)}`, rssi: Math.round(-58 - rand() * 32),
      phone: status === 'dead' ? 'T+0.0s 中断' : '在线', note: '',
    });
  }
  // 嫌疑人：从西北侧走到爆心并停留；爆炸前体温指数级升高；没有携带手机
  const track = new Float32Array(NS * 2), temp = new Float32Array(NS);
  for (let k = 0; k < NS; k++) {
    const t = T_MIN + k * DT;
    const f = clamp((t + 8) / 5, 0, 1);
    track[k * 2] = THREE.MathUtils.lerp(-4.5, bx, ease.inOutCubic(f));
    track[k * 2 + 1] = THREE.MathUtils.lerp(8.5, bz, ease.inOutCubic(f));
    temp[k] = t < -6 ? 37 : t < 0 ? 37 * Math.exp(0.732 * (t + 6)) : NaN;
  }
  people.push({ id: 'X27', name: '未登记', status: 'suspect', d0: 0, track, temp, peakT: 3000, bts: '—', rssi: null, phone: '无信号（未携带）', note: '熔融军籍牌 · 退伍军人', suspect: true });
  return people;
}

const sampleAt = (arr, T, stride = 1, off = 0) => {
  const f = clamp((T - T_MIN) / DT, 0, NS - 1), k = Math.floor(f), k2 = Math.min(k + 1, NS - 1), u = f - k;
  return arr[k * stride + off] * (1 - u) + arr[k2 * stride + off] * u;
};
const posAt = (p, T) => ({ x: sampleAt(p.track, T, 2, 0), z: sampleAt(p.track, T, 2, 1) });
const tempAt = (p, T) => sampleAt(p.temp, T);
const aliveAt = (p, T) => !(p.suspect && T >= 0);

export function createFusionScene({ renderer, camera, controls, ui }) {
  const scene = new THREE.Scene();
  const rand = rng(2027);
  const people = simulate(rand);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const S = { T: T_MIN, playing: true, sel: new Set(), hover: null, ver: 0, face: true };
  const bump = () => { S.ver++; };

  // ---------- 中心三维现场 ----------
  const cloud = buildCloud(rand, false);
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.BufferAttribute(cloud.pos, 3));
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: dotTexture() }, uPx: { value: window.devicePixelRatio } },
    vertexShader: `uniform float uPx; varying float vH; void main(){ vH = position.y; vec4 mv = modelViewMatrix*vec4(position,1.);
      bool persp = projectionMatrix[2][3] == -1.0; gl_PointSize = persp ? 1.6 * uPx * (12. / -mv.z) : 2.0; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vH; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vec3(0.3,0.85,1.)*(0.6+vH*0.05), a*0.6); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(cgeo, cloudMat));
  scene.add(holoGrid(30, 60, 0x5ff3ff, 0.07));

  // 爆炸：热斑 + 冲击波
  const heat = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uT; varying vec2 vP; void main(){ float d = length(vP); float h = uT > 0. ? exp(-d*d/(4.+uT*2.)) * exp(-uT*0.08) : 0.;
      float ring = (1.-smoothstep(0.,.05,abs(d-3.))) + (1.-smoothstep(0.,.05,abs(d-6.5)))*0.6;
      gl_FragColor = vec4(mix(vec3(1.,.8,.3), vec3(1.,.25,.15), d/5.) * h + vec3(1.,.4,.3)*ring*0.35*step(0.,uT), h*0.8 + ring*0.3*step(0.,uT)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  heat.rotation.x = -Math.PI / 2; heat.position.set(BLAST.x, 0.03, BLAST.z);
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96), new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  shock.rotation.x = -Math.PI / 2; shock.position.set(BLAST.x, 0.05, BLAST.z);
  scene.add(heat, shock);

  // 人物：胶囊体 + 状态底环 + 轨迹尾迹
  const capGeo = new THREE.CapsuleGeometry(0.17, 1.0, 4, 10);
  const TRAIL = 40;
  for (const p of people) {
    p.mat = holoMaterial({ color: p.suspect ? STATUS.suspect.c3 : COLORS.cyan, opacity: 0.9 });
    p.mesh = new THREE.Mesh(capGeo, p.mat);
    p.mesh.userData.person = p.id;
    p.ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), new THREE.MeshBasicMaterial({ color: STATUS[p.status].c3, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    p.ring.rotation.x = -Math.PI / 2;
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    p.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: STATUS[p.status].c3, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(p.mesh, p.ring, p.trail);
  }
  const personMeshes = people.map((p) => p.mesh);

  // ---------- 两台"数据源相机"：监控机位（透视）+ 俯视航拍（正交） ----------
  const cctvCam = new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 40);
  cctvCam.position.copy(CCTV); cctvCam.lookAt(BLAST.x + 0.5, 0.6, BLAST.z - 1.5); cctvCam.updateMatrixWorld();
  const cctvFrustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cctvCam.projectionMatrix, cctvCam.matrixWorldInverse));
  const helperCam = cctvCam.clone(); helperCam.far = 3; helperCam.updateProjectionMatrix();
  const cctvHelper = new THREE.CameraHelper(helperCam);
  cctvHelper.setColors(COLORS.orange, COLORS.orange, COLORS.orange, COLORS.orange, COLORS.orange);
  cctvHelper.material.transparent = true; cctvHelper.material.opacity = 0.5;
  scene.add(cctvHelper);
  const MAP_C = { x: 0, z: 3.5 }, MAP_R = 9.5;
  const mapCam = new THREE.OrthographicCamera(-MAP_R, MAP_R, MAP_R, -MAP_R, 1, 60);
  mapCam.position.set(MAP_C.x, 30, MAP_C.z); mapCam.up.set(0, 0, -1); mapCam.lookAt(MAP_C.x, 0, MAP_C.z);
  const rtCctv = new THREE.WebGLRenderTarget(640, 360);
  const rtMap = new THREE.WebGLRenderTarget(512, 512);
  const inCctv = (p, T) => { const q = posAt(p, T); return aliveAt(p, T) && cctvFrustum.containsPoint(new THREE.Vector3(q.x, 0.9, q.z)); };

  // ---------- 联动操作 ----------
  const setHover = (id) => { if (S.hover !== id) { S.hover = id; bump(); } };
  const toggle = (id) => { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); bump(); inspect(); if (S.sel.has(id)) say(id); };
  const select = (ids, how = 'brush') => { S.sel = new Set(ids); bump(); inspect(); ui.say(ids.length ? `${how === 'brush' ? '刷选' : '选中'} ${ids.length} 人，所有视图已同步高亮。` : '选择已清除。'); };
  const setT = (T) => { S.T = clamp(T, T_MIN, T_MAX); S.playing = false; playBtn.textContent = '▶ 播放'; tSlider.set(S.T); };
  const say = (id) => { const p = byId[id]; ui.say(p.suspect ? 'X27：爆炸前 6 秒体温开始指数上升，没有手机信号，监控里一直站在爆心——他就是"炸弹"。' : `${p.id} ${p.name}：${STATUS[p.status].name}，距爆心 ${p.d0.toFixed(1)} m，峰值体温 ${p.peakT.toFixed(0)}°C。`); };

  // ---------- 悬浮视图 ----------
  const pad = (p) => ({ l: p.res * 0.32, r: p.res * 0.1, t: p.titlePx + p.res * 0.12, b: p.res * 0.22 });
  const colorOf = (p) => (S.sel.has(p.id) ? SEL : S.hover === p.id ? HOV : STATUS[p.status].color);
  const brushRect = (g, br) => {
    if (!br) return;
    g.fillStyle = 'rgba(255,173,59,.12)'; g.strokeStyle = SEL; g.setLineDash([6, 4]); g.lineWidth = 2;
    g.fillRect(br.x0, br.y0, br.x1 - br.x0, br.y1 - br.y0); g.strokeRect(br.x0, br.y0, br.x1 - br.x0, br.y1 - br.y0); g.setLineDash([]);
  };
  const inRect = (br, x, y) => x >= Math.min(br.x0, br.x1) && x <= Math.max(br.x0, br.x1) && y >= Math.min(br.y0, br.y1) && y <= Math.max(br.y0, br.y1);
  const fmtT = (T) => `T${T >= 0 ? '+' : ''}${T.toFixed(1)}s`;

  // 1) 监控实时画面 + AI 目标框
  const cctvBoxes = new Map();
  const vCctv = new FloatPanel({
    id: 'cctv', title: '监控 CCTV-07 · 实时画面', tag: '视频源', w: 5.2, h: 3.29, pos: new THREE.Vector3(-6.8, 6.6, -0.5), rt: rtCctv,
    draw(g, P) {
      const c = P.content; cctvBoxes.clear();
      const v = new THREE.Vector3();
      for (const p of people) {
        if (!aliveAt(p, S.T)) continue;
        const q = posAt(p, S.T);
        v.set(q.x, 0.9, q.z).project(cctvCam);
        if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) continue;
        const dist = cctvCam.position.distanceTo(new THREE.Vector3(q.x, 0.9, q.z));
        const hh = clamp(c.h * 1.8 / (dist * 2 * Math.tan(THREE.MathUtils.degToRad(23))), 14, c.h * 0.6), ww = hh * 0.45;
        const x = c.x + (v.x * 0.5 + 0.5) * c.w, y = c.y + (1 - (v.y * 0.5 + 0.5)) * c.h;
        cctvBoxes.set(p.id, { x, y, w: ww, h: hh });
        const col = colorOf(p), hot = S.sel.has(p.id) || S.hover === p.id;
        g.strokeStyle = col; g.lineWidth = hot ? 3 : 1.4; g.globalAlpha = hot ? 1 : 0.75;
        g.strokeRect(x - ww / 2, y - hh / 2, ww, hh);
        g.fillStyle = col; g.fillText(p.id + (hot ? ` ${tempAt(p, S.T).toFixed(0)}°C` : ''), x - ww / 2, y - hh / 2 - 4);
        g.globalAlpha = 1;
      }
      g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(c.x + 18, c.y + 18, 6, 0, 7); if (Math.floor(performance.now() / 500) % 2) g.fill();
      g.fillStyle = '#fff'; g.fillText(`REC  ${fmtT(S.T)}   检测 ${cctvBoxes.size} 人`, c.x + 32, c.y + 23);
    },
    onPointer(type, x, y) {
      let hit = null;
      for (const [id, b] of cctvBoxes) if (Math.abs(x - b.x) < b.w / 2 + 4 && Math.abs(y - b.y) < b.h / 2 + 4) hit = id;
      if (type === 'move') setHover(hit);
      if (type === 'click') hit ? toggle(hit) : select([]);
    },
    anchor(id) { const b = cctvBoxes.get(id); return b ? { x: b.x, y: b.y - b.h / 2 } : null; },
  });

  // 2) 俯视地图（航拍 RT）+ 轨迹 + 刷选
  let mapBrush = null;
  const mapPx = (P, x, z) => ({ x: P.content.x + ((x - MAP_C.x + MAP_R) / (2 * MAP_R)) * P.content.w, y: P.content.y + ((z - MAP_C.z + MAP_R) / (2 * MAP_R)) * P.content.h });
  const vMap = new FloatPanel({
    id: 'map', title: '俯视态势 · 轨迹', tag: '航拍 + 追踪', w: 3.8, h: 4.16, pos: new THREE.Vector3(-4.8, 9.6, -7.5), rt: rtMap,
    draw(g, P) {
      const bc = mapPx(P, BLAST.x, BLAST.z), s = P.content.w / (2 * MAP_R);
      if (S.T >= 0) {
        g.setLineDash([5, 5]); g.lineWidth = 1.5;
        [[3, '#ff5a5a'], [6.5, '#ffad3b']].forEach(([r, c]) => { g.strokeStyle = c; g.beginPath(); g.arc(bc.x, bc.y, r * s, 0, 7); g.stroke(); });
        g.setLineDash([]);
      }
      // CCTV 视野扇形
      const cp = mapPx(P, CCTV.x, CCTV.z);
      const look = new THREE.Vector3(); cctvCam.getWorldDirection(look);
      const ang = Math.atan2(look.z, look.x), half = THREE.MathUtils.degToRad(46 * 16 / 9 / 2);
      g.fillStyle = 'rgba(255,173,59,.08)'; g.beginPath(); g.moveTo(cp.x, cp.y); g.arc(cp.x, cp.y, P.content.w * 0.9, ang - half, ang + half); g.closePath(); g.fill();
      g.fillStyle = '#ffad3b'; g.fillText('CCTV-07', cp.x + 6, cp.y - 6);
      for (const p of people) {
        if (!aliveAt(p, S.T)) continue;
        const hot = S.sel.has(p.id) || S.hover === p.id;
        g.strokeStyle = colorOf(p); g.globalAlpha = hot ? 0.9 : 0.35; g.lineWidth = hot ? 2 : 1;
        g.beginPath();
        for (let T = Math.max(T_MIN, S.T - (hot ? 30 : 3)); T <= S.T; T += 0.2) { const q = posAt(p, T), m = mapPx(P, q.x, q.z); T === Math.max(T_MIN, S.T - (hot ? 30 : 3)) ? g.moveTo(m.x, m.y) : g.lineTo(m.x, m.y); }
        g.stroke(); g.globalAlpha = 1;
        const q = posAt(p, S.T), m = mapPx(P, q.x, q.z);
        g.fillStyle = colorOf(p); g.beginPath(); g.arc(m.x, m.y, hot ? 6 : 3.5, 0, 7); g.fill();
        if (hot) { g.strokeStyle = colorOf(p); g.beginPath(); g.arc(m.x, m.y, 11, 0, 7); g.stroke(); g.fillText(p.id, m.x + 12, m.y - 8); }
      }
      brushRect(g, mapBrush);
      g.fillStyle = 'rgba(191,249,255,.7)'; g.fillText('拖拽框选区域', P.content.x + 8, P.ch - 10);
    },
    onPointer(type, x, y, P) {
      const near = () => { let best = null, bd = 12; for (const p of people) { if (!aliveAt(p, S.T)) continue; const q = posAt(p, S.T), m = mapPx(P, q.x, q.z), d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = p.id; } } return best; };
      if (type === 'move') setHover(near());
      if (type === 'down') mapBrush = { x0: x, y0: y, x1: x, y1: y };
      if (type === 'drag' && mapBrush) { mapBrush.x1 = x; mapBrush.y1 = y; bump(); }
      if (type === 'up' && mapBrush) {
        const br = mapBrush; mapBrush = null;
        select(people.filter((p) => { if (!aliveAt(p, S.T)) return false; const q = posAt(p, S.T), m = mapPx(P, q.x, q.z); return inRect(br, m.x, m.y); }).map((p) => p.id));
      }
      if (type === 'click') { mapBrush = null; const id = near(); id ? toggle(id) : select([]); }
    },
    anchor(id) { const p = byId[id]; if (!aliveAt(p, S.T)) return null; const q = posAt(p, S.T); return mapPx(this, q.x, q.z); },
  });

  // 3) 体温时间曲线（热成像）—— 横轴即全局时间轴，可拖动
  const chartXY = (P, T, v) => { const m = pad(P); return { x: m.l + ((T - T_MIN) / (T_MAX - T_MIN)) * (P.cw - m.l - m.r), y: P.ch - m.b - logT(Math.max(v, TEMP_MIN)) * (P.ch - m.t - m.b) }; };
  const drawLine = (g, P, p) => {
    g.beginPath(); let started = false;
    for (let k = 0; k < NS; k += 2) { const v = p.temp[k]; if (Number.isNaN(v)) break; const c = chartXY(P, T_MIN + k * DT, v); started ? g.lineTo(c.x, c.y) : g.moveTo(c.x, c.y); started = true; }
    g.stroke();
  };
  const nearLine = (P, x, y) => {
    const m = pad(P), T = T_MIN + ((x - m.l) / (P.cw - m.l - m.r)) * (T_MAX - T_MIN);
    let best = null, bd = 10;
    for (const p of people) { const v = tempAt(p, T); if (Number.isNaN(v)) continue; const d = Math.abs(chartXY(P, T, v).y - y); if (d < bd) { bd = d; best = p.id; } }
    return best;
  };
  const vChart = new FloatPanel({
    id: 'thermal', title: '热成像 · 体温时间曲线（对数）', tag: '热成像源', w: 6.6, h: 3.1, pos: new THREE.Vector3(0.4, 12.2, -10),
    draw(g, P) {
      const m = pad(P);
      g.strokeStyle = 'rgba(95,243,255,.15)'; g.fillStyle = 'rgba(191,249,255,.7)'; g.lineWidth = 1;
      for (const v of [37, 100, 300, 1000, 3000]) { const c = chartXY(P, T_MIN, v); g.beginPath(); g.moveTo(m.l, c.y); g.lineTo(P.cw - m.r, c.y); g.stroke(); g.fillText(`${v}°`, 6, c.y + 4); }
      for (let T = -5; T <= 20; T += 5) { const c = chartXY(P, T, TEMP_MIN); g.fillText(`${T > 0 ? '+' : ''}${T}s`, c.x - 10, P.ch - 8); }
      const z = chartXY(P, 0, TEMP_MIN);
      g.strokeStyle = 'rgba(255,90,90,.7)'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(z.x, m.t); g.lineTo(z.x, P.ch - m.b); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ff5a5a'; g.fillText('爆炸', z.x + 4, m.t + 12);
      const order = [...people].sort((a, b) => (S.sel.has(a.id) || S.hover === a.id ? 1 : 0) - (S.sel.has(b.id) || S.hover === b.id ? 1 : 0));
      const dim = S.sel.size > 0;
      for (const p of order) {
        const hot = S.sel.has(p.id) || S.hover === p.id;
        g.strokeStyle = colorOf(p); g.lineWidth = hot ? 3 : 1.2; g.globalAlpha = hot ? 1 : dim ? 0.18 : p.suspect ? 0.95 : 0.45;
        drawLine(g, P, p);
      }
      g.globalAlpha = 1;
      const c = chartXY(P, S.T, TEMP_MIN);
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(c.x, m.t - 6); g.lineTo(c.x, P.ch - m.b); g.stroke();
      g.fillStyle = '#fff'; g.fillText(fmtT(S.T), c.x + 4, m.t);
      const sc = chartXY(P, -0.6, 2000);
      if (!dim) { g.fillStyle = STATUS.suspect.color; g.fillText('← 爆炸前异常升温', sc.x + 8, sc.y); }
    },
    onPointer(type, x, y, P) {
      const m = pad(P), toT = (px) => T_MIN + ((px - m.l) / (P.cw - m.l - m.r)) * (T_MAX - T_MIN);
      if (type === 'move') setHover(nearLine(P, x, y));
      if (type === 'drag') { setT(toT(x)); bump(); }
      if (type === 'click') { const id = nearLine(P, x, y); id ? toggle(id) : setT(toT(x)); }
    },
    anchor(id) { const v = tempAt(byId[id], S.T); return Number.isNaN(v) ? null : chartXY(this, S.T, v); },
  });

  // 4) 散点：爆心距离 × 峰值体温 —— 刷选
  let scBrush = null;
  const scXY = (P, p) => { const m = pad(P); return { x: m.l + (p.d0 / 13) * (P.cw - m.l - m.r), y: P.ch - m.b - logT(p.peakT) * (P.ch - m.t - m.b) }; };
  const vScatter = new FloatPanel({
    id: 'scatter', title: '关联分析 · 距离 × 峰值体温', tag: '融合', w: 4.0, h: 3.4, pos: new THREE.Vector3(5.6, 9.6, -7.5),
    draw(g, P) {
      const m = pad(P);
      g.strokeStyle = 'rgba(95,243,255,.3)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(m.l, m.t); g.lineTo(m.l, P.ch - m.b); g.lineTo(P.cw - m.r, P.ch - m.b); g.stroke();
      g.fillStyle = 'rgba(191,249,255,.7)';
      g.fillText('爆心距离 (m) →', P.cw - m.r - 100, P.ch - 8);
      for (const v of [37, 300, 3000]) { const y = P.ch - m.b - logT(v) * (P.ch - m.t - m.b); g.fillText(`${v}°`, 6, y + 4); }
      for (const p of people) {
        const c = scXY(P, p), hot = S.sel.has(p.id) || S.hover === p.id;
        g.fillStyle = colorOf(p); g.globalAlpha = S.sel.size && !hot ? 0.3 : 1;
        g.beginPath(); g.arc(c.x, c.y, hot ? 7 : 4.5, 0, 7); g.fill();
        if (hot) { g.strokeStyle = colorOf(p); g.beginPath(); g.arc(c.x, c.y, 12, 0, 7); g.stroke(); g.fillText(p.id, c.x + 12, c.y - 8); }
        if (p.suspect && !hot) g.fillText('X27 离群点', c.x + 10, c.y + 4);
        g.globalAlpha = 1;
      }
      brushRect(g, scBrush);
    },
    onPointer(type, x, y, P) {
      const near = () => { let best = null, bd = 12; for (const p of people) { const c = scXY(P, p), d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = p.id; } } return best; };
      if (type === 'move') setHover(near());
      if (type === 'down') scBrush = { x0: x, y0: y, x1: x, y1: y };
      if (type === 'drag' && scBrush) { scBrush.x1 = x; scBrush.y1 = y; bump(); }
      if (type === 'up' && scBrush) { const br = scBrush; scBrush = null; select(people.filter((p) => { const c = scXY(P, p); return inRect(br, c.x, c.y); }).map((p) => p.id)); }
      if (type === 'click') { scBrush = null; const id = near(); id ? toggle(id) : select([]); }
    },
    anchor(id) { return scXY(this, byId[id]); },
  });

  // 5) 人员档案表：融合三种数据源的字段
  const sorted = [...people].sort((a, b) => a.d0 - b.d0);
  const rowH = (P) => (P.ch - P.titlePx - 30) / (sorted.length + 1);
  const vList = new FloatPanel({
    id: 'list', title: '人员档案 · 多源融合', tag: '身份 + 通信', w: 4.4, h: 5.0, pos: new THREE.Vector3(8.6, 6.2, -0.5), res: 190,
    draw(g, P) {
      const rh = rowH(P), y0 = P.titlePx + 8;
      const cols = [8, 62, 132, 182, 252, 316, 360];
      g.font = `${Math.round(rh * 0.62)}px ${FONT}`;
      g.fillStyle = 'rgba(191,249,255,.6)';
      ['ID', '姓名', '状态', '体温', '距离', '监控', '基站'].forEach((s, i) => g.fillText(s, cols[i] * P.cw / 400, y0 + rh * 0.7));
      sorted.forEach((p, i) => {
        const y = y0 + (i + 1) * rh, hot = S.sel.has(p.id), hov = S.hover === p.id;
        if (hot || hov) { g.fillStyle = hot ? 'rgba(255,173,59,.22)' : 'rgba(255,255,255,.12)'; g.fillRect(0, y, P.cw, rh); }
        const v = tempAt(p, S.T), vis = inCctv(p, S.T);
        const cells = [p.id, p.name, STATUS[p.status].name, Number.isNaN(v) ? '—' : `${v.toFixed(v > 100 ? 0 : 1)}°`, `${p.d0.toFixed(1)}m`, vis ? '●' : '○', p.bts];
        cells.forEach((s, k) => {
          g.fillStyle = k === 2 ? STATUS[p.status].color : k === 3 && v > 60 ? '#ffad3b' : k === 5 && vis ? '#ffad3b' : hot ? '#fff' : 'rgba(191,249,255,.85)';
          g.fillText(s, cols[k] * P.cw / 400, y + rh * 0.72);
        });
      });
    },
    onPointer(type, x, y, P) {
      const i = Math.floor((y - P.titlePx - 8) / rowH(P)) - 1;
      const id = i >= 0 && i < sorted.length ? sorted[i].id : null;
      if (type === 'move') setHover(id);
      if (type === 'click') id ? toggle(id) : select([]);
    },
    anchor(id) { const i = sorted.findIndex((p) => p.id === id); return { x: 4, y: this.titlePx + 8 + (i + 1.5) * rowH(this) }; },
  });

  const views = [vCctv, vMap, vChart, vScatter, vList];
  const viewGroup = new THREE.Group();
  views.forEach((v) => v.addTo(viewGroup));
  scene.add(viewGroup);
  const viewMeshes = views.map((v) => v.mesh);

  // 视图 → 数据源 的静态连线（监控面板 ↔ 监控机位）
  const srcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: 0xffad3b, dashSize: 0.2, gapSize: 0.12, transparent: true, opacity: 0.6, depthWrite: false }));
  scene.add(srcLine);

  // ---------- 数据飞线：3D 人物 ↔ 各视图中的对应数据 ----------
  const SEG = 28, POOL = 70;
  const linkMat = (color) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying float vT; void main(){ float f = fract(vT*3. - uTime*0.8); float a = 0.25 + 0.75*smoothstep(0.85,1.,f); gl_FragColor = vec4(uColor, a*0.85); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const matSel = linkMat(0xffad3b), matHov = linkMat(0xffffff);
  const links = [];
  const aT = new Float32Array(SEG + 1).map((_, i) => i / SEG);
  for (let i = 0; i < POOL; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    const l = new THREE.Line(g, matSel); l.visible = false; l.frustumCulled = false;
    links.push(l); scene.add(l);
  }
  const curve = new THREE.QuadraticBezierCurve3();
  const tmpV = new THREE.Vector3();
  function updateLinks() {
    let n = 0;
    const ids = [...S.sel]; if (S.hover && !S.sel.has(S.hover)) ids.push(S.hover);
    for (const id of ids.slice(-12)) {
      const p = byId[id], q = posAt(p, Math.min(S.T, p.suspect ? -0.01 : S.T));
      const a = new THREE.Vector3(q.x, 1.7, q.z);
      for (const v of views) {
        const an = v.anchor(id, v);
        if (!an || n >= POOL) continue;
        const b = v.worldOf(an.x, an.y, tmpV.clone());
        const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 1.2 + a.distanceTo(b) * 0.12;
        curve.v0.copy(a); curve.v1.copy(mid); curve.v2.copy(b);
        const L = links[n++], pa = L.geometry.attributes.position;
        for (let i = 0; i <= SEG; i++) { curve.getPoint(i / SEG, tmpV); pa.setXYZ(i, tmpV.x, tmpV.y, tmpV.z); }
        pa.needsUpdate = true;
        L.material = S.sel.has(id) ? matSel : matHov;
        L.visible = true;
      }
    }
    for (let i = n; i < POOL; i++) links[i].visible = false;
    return n;
  }

  // ---------- 检查器：单人 = 融合档案；多人 = 统计 ----------
  function inspect() {
    const ids = [...S.sel];
    if (!ids.length) { ui.inspect(null); return; }
    if (ids.length === 1) {
      const p = byId[ids[0]], q = posAt(p, S.T), v = tempAt(p, S.T);
      ui.inspect(`${p.id} · ${p.name}`, [
        ['状态', `<span style="color:${STATUS[p.status].color}">${STATUS[p.status].name}</span>`],
        ['爆心距离（T=0）', `${p.d0.toFixed(2)} m`],
        ['📍 当前位置', aliveAt(p, S.T) ? `(${q.x.toFixed(1)}, ${q.z.toFixed(1)})` : '—'],
        ['🌡 当前 / 峰值体温', `${Number.isNaN(v) ? '—' : v.toFixed(1)} / ${p.peakT.toFixed(0)} °C`],
        ['🎥 CCTV-07', inCctv(p, S.T) ? '可见' : '视野外'],
        ['📶 基站 / 信号', p.rssi ? `${p.bts} / ${p.rssi} dBm` : p.bts],
        ['📱 手机', p.phone],
        ...(p.note ? [['备注', `<span style="color:#ff4df0">${p.note}</span>`]] : []),
      ]);
    } else {
      const cnt = (s) => ids.filter((id) => byId[id].status === s).length;
      ui.inspect(`已选 ${ids.length} 人`, [
        ['遇难 / 受伤', `${cnt('dead')} / ${cnt('hurt')}`], ['安全 / 嫌疑', `${cnt('safe')} / ${cnt('suspect')}`],
        ['平均爆心距离', `${(ids.reduce((s, id) => s + byId[id].d0, 0) / ids.length).toFixed(1)} m`],
        ['CCTV 中可见', `${ids.filter((id) => inCctv(byId[id], S.T)).length} 人`],
        ['无手机信号', `${ids.filter((id) => !byId[id].rssi).length} 人`],
      ]);
    }
  }

  // ---------- 相机飞行（聚焦某个悬浮视图） ----------
  let fly = null;
  const flyTo = (pos, target) => { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now() }; };
  const focusView = (v) => {
    const c = v.group.position.clone();
    const dir = camera.position.clone().sub(c).setY(0).normalize();
    const tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(v.h / 2 / tf, v.w / 2 / (tf * camera.aspect)) * 1.15 + 0.3;
    flyTo(c.clone().addScaledVector(dir, d), c);
    ui.say(`聚焦视图：${v.title}。`);
  };
  const overview = () => flyTo(new THREE.Vector3(1, 11, 23), new THREE.Vector3(1, 5.5, -2));

  // ---------- 面板 ----------
  const tSlider = slider('全局时间轴 T(s)', { min: T_MIN, max: T_MAX, step: 0.1, value: T_MIN }, (v) => { setT(v); bump(); });
  const playBtn = button('❚❚ 暂停', () => { S.playing = !S.playing; playBtn.textContent = S.playing ? '❚❚ 暂停' : '▶ 播放'; if (S.playing && S.T >= T_MAX - 0.1) S.T = T_MIN; });
  const faceBtn = button('视图朝向我', () => { S.face = !S.face; faceBtn.classList.toggle('active', S.face); });
  faceBtn.classList.add('active');
  const ctl = panel(
    tSlider,
    row(playBtn, button('⟲ 重放', () => { S.T = T_MIN; S.playing = true; playBtn.textContent = '❚❚ 暂停'; })),
    row(button('找出异常', () => { select(['X27'], 'pick'); setT(-1.5); say('X27'); }, 'warn'), button('遇难者', () => select(people.filter((p) => p.status === 'dead').map((p) => p.id))), button('清除', () => select([]))),
    row(button('总览', overview), faceBtn, button('重置布局', () => { views.forEach((v) => v.base.copy(v.home)); })),
    note('<b>联动</b>：在任一视图悬停 / 点选，其他视图同步高亮，橙色飞线连接 3D 人物与各视图中的对应数据。<br><b>刷选</b>：在俯视图或散点图里拖拽框选。<br><b>时间</b>：在体温曲线上拖动 = 全局时间轴。<br><b>空间</b>：拖动视图标题栏可在空中移动它；点 ▢ 聚焦该视图。'),
  );
  views.forEach((v) => { v.home = v.base.clone(); });

  // ---------- 拾取 / 指针分发 ----------
  let hotView = null, drag = null;
  const dragPlane = new THREE.Plane(), hitP = new THREE.Vector3(), dragOff = new THREE.Vector3();
  function pick(raycaster) {
    const hits = raycaster.intersectObjects([...viewMeshes, ...personMeshes], false);
    for (const h of hits) {
      if (h.object.userData.panel) { const v = h.object.userData.panel; return { view: v, px: v.uvToPx(h.uv), point: h.point }; }
      const p = byId[h.object.userData.person];
      if (p && h.object.visible) return { person: p, point: h.point };
    }
    return null;
  }
  const setHotView = (v) => { if (hotView && hotView !== v) { hotView.hot = false; hotView.onPointer?.('leave', 0, 0, hotView); } hotView = v; if (v) v.hot = true; };

  return {
    id: 'fusion', title: '多视图融合', scene, _views: views,
    subtitle: '五个数据视图悬浮在现场上空，彼此联动：任何一处的探索都会传播到所有视图，并用飞线把同一个人在不同数据源里的"分身"连起来。',
    hint: '悬停/点击任一视图联动 · 在地图或散点图拖拽刷选 · 拖标题栏移动视图',
    cameraPos: new THREE.Vector3(1, 11, 23), target: new THREE.Vector3(1, 5.5, -2),
    minDistance: 1.5, maxDistance: 45, bloom: 0.55,
    panel: ctl,
    enter() { ui.say('联动视图已展开：监控、航拍、热成像、关联分析、人员档案。任意一处的选择都会同步到全部视图。'); },

    hover(raycaster) {
      const h = pick(raycaster);
      if (h?.view) {
        setHotView(h.view);
        const z = h.view.zone(h.px.x, h.px.y);
        document.body.style.cursor = z === 'title' ? 'move' : 'pointer';
        if (z === 'content') h.view.onPointer?.('move', h.px.x, h.px.y, h.view); else setHover(null);
      } else {
        setHotView(null);
        setHover(h?.person ? h.person.id : null);
        document.body.style.cursor = h?.person ? 'pointer' : '';
      }
    },
    pointerDown(raycaster) {
      const h = pick(raycaster);
      if (!h?.view) return false;
      const v = h.view, z = v.zone(h.px.x, h.px.y);
      drag = { view: v, zone: z, start: h.px, moved: false };
      if (z === 'title') {
        camera.getWorldDirection(hitP);
        dragPlane.setFromNormalAndCoplanarPoint(hitP, h.point);
        dragOff.copy(h.point).sub(v.base);
      } else if (z === 'content') v.onPointer?.('down', h.px.x, h.px.y, v);
      return true;
    },
    pointerMove(raycaster) {
      if (!drag) return;
      const v = drag.view;
      if (drag.zone === 'title') {
        if (raycaster.ray.intersectPlane(dragPlane, hitP)) { v.base.copy(hitP.sub(dragOff)); v.base.y = Math.max(v.base.y, v.h / 2 + 0.3); }
        drag.moved = true;
        return;
      }
      const hit = raycaster.intersectObject(v.mesh, false)[0];
      if (!hit) return;
      const px = v.uvToPx(hit.uv);
      if (Math.hypot(px.x - drag.start.x, px.y - drag.start.y) > 4) drag.moved = true;
      if (drag.moved && drag.zone === 'content') v.onPointer?.('drag', px.x, px.y, v);
      drag.last = px;
    },
    pointerUp() {
      if (!drag) return;
      const { view: v, zone, moved, start, last } = drag; drag = null;
      if (zone === 'focus' && !moved) focusView(v);
      else if (zone === 'content') {
        const p = last || start;
        if (moved) v.onPointer?.('up', p.x, p.y, v);
        else v.onPointer?.('click', start.x, start.y, v);
      }
    },
    click(raycaster) {
      const h = pick(raycaster);
      if (h?.person) toggle(h.person.id);
      else if (!h) select([]);
    },

    update(t, dt) {
      if (S.playing) {
        const prev = S.T;
        S.T += dt * (S.T > -0.5 && S.T < 3 ? 0.35 : 1.4);
        if (S.T >= T_MAX) { S.T = T_MAX; S.playing = false; playBtn.textContent = '▶ 播放'; }
        tSlider.set(S.T);
        if (prev < 0 && S.T >= 0) ui.say('爆炸发生。所有数据源正在同步记录……');
      }
      const T = S.T;
      // 3D 人物
      for (const p of people) {
        const alive = aliveAt(p, T);
        p.mesh.visible = p.ring.visible = alive;
        const q = posAt(p, T);
        const down = p.status === 'dead' && T > 0.3;
        p.mesh.position.set(q.x, down ? 0.2 : 0.7, q.z);
        p.mesh.rotation.z = down ? Math.PI / 2 : 0;
        p.ring.position.set(q.x, 0.03, q.z);
        p.ring.material.color.copy(T >= 0 || p.suspect ? STATUS[p.status].c3 : COLORS.cyan);
        const hot = S.sel.has(p.id) ? 1 : S.hover === p.id ? 0.6 : 0;
        p.mat.uniforms.uHighlight.value = hot;
        if (p.suspect) p.mat.uniforms.uOpacity.value = 0.9 + Math.max(0, logT(tempAt(p, T) || 37) - 0.1) * 2 * (0.6 + 0.4 * Math.sin(t * 10));
        const pa = p.trail.geometry.attributes.position;
        for (let i = 0; i < TRAIL; i++) { const tq = posAt(p, T - (TRAIL - 1 - i) * 0.1); pa.setXYZ(i, tq.x, 0.05, tq.z); }
        pa.needsUpdate = true;
        p.trail.visible = alive;
        p.trail.material.opacity = hot ? 0.9 : 0.3;
      }
      heat.material.uniforms.uT.value = T;
      shock.material.opacity = T > 0 ? Math.max(0, 1 - T / 1.5) : 0;
      shock.scale.setScalar(T > 0 ? 0.1 + T * 12 : 0.01);

      // 数据源相机 → 渲染目标（渲染时隐藏视图与飞线，避免套娃）
      this._frame = (this._frame || 0) + 1;
      if (this._frame % 2 === 0) {
      viewGroup.visible = false; links.forEach((l) => { l.userData.v = l.visible; l.visible = false; }); cctvHelper.visible = false; srcLine.visible = false;
      renderer.setRenderTarget(rtCctv); renderer.render(scene, cctvCam);
      renderer.setRenderTarget(rtMap); renderer.render(scene, mapCam);
      renderer.setRenderTarget(null);
      viewGroup.visible = true; links.forEach((l) => { l.visible = l.userData.v; }); cctvHelper.visible = true; srcLine.visible = true;
      }

      // 悬浮视图
      for (const v of views) v.update(t, camera, S.face);
      // 交互变化立即重绘；仅时间推进时限制到 ~20Hz
      const now = performance.now();
      if (S.ver !== this._ver || (T !== this._T && now - (this._drawn || 0) > 50)) { views.forEach((v) => v.redraw()); this._ver = S.ver; this._T = T; this._drawn = now; }
      else if (now - (this._drawn || 0) > 250) { vCctv.redraw(); this._drawn = now; }   // REC 指示灯闪烁
      const sp = srcLine.geometry.attributes.position;
      const a = vCctv.worldOf(vCctv.cw / 2, vCctv.ch, tmpV.clone());
      sp.setXYZ(0, a.x, a.y, a.z); sp.setXYZ(1, CCTV.x, CCTV.y, CCTV.z); sp.needsUpdate = true; srcLine.computeLineDistances();

      this._links = updateLinks();
      matSel.uniforms.uTime.value = matHov.uniforms.uTime.value = t;
      if (S.sel.size && Math.floor(t * 4) !== this._insp) { this._insp = Math.floor(t * 4); inspect(); }

      if (fly) {
        const f = Math.min((performance.now() - fly.start) / 1300, 1), k = ease.inOutCubic(f);
        camera.position.lerpVectors(fly.p0, fly.p1, k);
        controls.target.lerpVectors(fly.t0, fly.t1, k);
        if (f >= 1) fly = null;
      }
    },
    hudTargets() {
      return [...S.sel].slice(0, 6).filter((id) => aliveAt(byId[id], S.T)).map((id) => {
        const p = byId[id], q = posAt(p, S.T);
        return { position: new THREE.Vector3(q.x, 1.0, q.z), label: p.id, sub: `${tempAt(p, S.T).toFixed(0)}°C`, locked: true, color: p.suspect ? 'red' : 'orange' };
      });
    },
    telemetry() {
      return [fmtT(S.T), `SELECTED ${S.sel.size}`, `LINKED VIEWS ${views.length} · LINKS ${this._links || 0}`];
    },
    key(e) { if (e.key === ' ') { e.preventDefault(); playBtn.click(); } if (e.key === 'Escape') select([]); },
  };
}
