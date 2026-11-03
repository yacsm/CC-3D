// 场景 4：全球信号溯源 —— 地球全息 + 中继跳转弧线 + 逐跳破解 + 最终定位
// 灵感：反派的电视讲话信号在全球中继站之间来回反弹以隐藏来源，主角让 AI 管家逐跳追踪，
//      最后在地图上锁定真实发射点。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { holoMaterial, dotTexture, rng, ease, COLORS } from '../holo.js';
import { panel, row, button, note } from '../ui.js';

const R = 2;
const ll = (lat, lon, r = R) => {
  const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
};
// 粗略的大陆轮廓（lat, lon, 纬向半径, 经向半径）
const LAND = [
  [50, -100, 18, 30], [35, -95, 10, 18], [64, -125, 10, 28], [20, -100, 8, 9], [72, -40, 8, 14], [12, -85, 5, 5],
  [-8, -60, 15, 14], [-28, -62, 12, 9], [-45, -70, 8, 4],
  [50, 10, 9, 17], [61, 20, 8, 14], [40, -4, 4, 5], [54, -3, 4, 3],
  [12, 15, 14, 22], [-8, 24, 12, 12], [-24, 26, 9, 9], [5, 40, 6, 6],
  [55, 90, 14, 45], [36, 102, 12, 24], [21, 78, 9, 7], [15, 103, 8, 6], [66, 140, 8, 28], [24, 46, 8, 9], [33, 65, 7, 12],
  [-25, 134, 10, 16], [-2, 113, 4, 14], [37, 138, 5, 3], [-42, 172, 4, 3], [7, 124, 5, 4],
];
const HOPS = [
  { name: '卡拉奇', en: 'KARACHI', lat: 24.86, lon: 67.0 },
  { name: '莫斯科', en: 'MOSCOW', lat: 55.75, lon: 37.6 },
  { name: '拉各斯', en: 'LAGOS', lat: 6.5, lon: 3.4 },
  { name: '伦敦', en: 'LONDON', lat: 51.5, lon: -0.13 },
  { name: '首尔', en: 'SEOUL', lat: 37.57, lon: 126.98 },
  { name: '圣保罗', en: 'SÃO PAULO', lat: -23.55, lon: -46.63 },
  { name: '迈阿密', en: 'MIAMI', lat: 25.76, lon: -80.19, final: true },
];

export function createGlobeScene({ camera, controls, ui }) {
  const scene = new THREE.Scene();
  const rand = rng(99);
  const globe = new THREE.Group();
  scene.add(globe);

  // 外壳 + 大气辉光
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.995, 64, 32), Object.assign(holoMaterial({ opacity: 0.12, power: 3 }), { side: THREE.FrontSide })));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 64, 32), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 4.); gl_FragColor = vec4(0.3,0.85,1., f * 0.55); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  }));
  scene.add(atmo);

  // 经纬线
  const gl = [];
  for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 4) { gl.push(...ll(lat, lon, R * 1.002).toArray(), ...ll(lat, lon + 4, R * 1.002).toArray()); }
  for (let lon = -180; lon < 180; lon += 15) for (let lat = -88; lat < 88; lat += 4) { gl.push(...ll(lat, lon, R * 1.002).toArray(), ...ll(lat + 4, lon, R * 1.002).toArray()); }
  const glGeo = new THREE.BufferGeometry(); glGeo.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
  globe.add(new THREE.LineSegments(glGeo, new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false })));

  // 陆地点阵（斐波那契球面采样 + 大陆椭圆遮罩）
  const land = [];
  const NPTS = 26000, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NPTS; i++) {
    const y = 1 - (i / (NPTS - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
    const lat = THREE.MathUtils.radToDeg(Math.asin(y));
    let lon = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(th) * rr, Math.cos(th) * rr));
    const noise = 0.25 * Math.sin(lat * 0.37 + lon * 0.21) * Math.sin(lon * 0.29 - lat * 0.13);
    if (LAND.some(([a, b, ra, ro]) => { let dl = lon - b; if (dl > 180) dl -= 360; if (dl < -180) dl += 360; return ((lat - a) / ra) ** 2 + (dl / ro) ** 2 < 1 + noise; })) {
      land.push(...ll(lat, lon, R * 1.005).toArray());
    }
  }
  const landGeo = new THREE.BufferGeometry(); landGeo.setAttribute('position', new THREE.Float32BufferAttribute(land, 3));
  globe.add(new THREE.Points(landGeo, new THREE.PointsMaterial({ color: 0x6ff5ff, size: 0.022, map: dotTexture(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })));

  // 干扰中继点（闪烁）
  const decoyPos = [], decoyRand = [];
  for (let i = 0; i < 160; i++) { decoyPos.push(...ll(rand() * 130 - 55, rand() * 360 - 180, R * 1.01).toArray()); decoyRand.push(rand()); }
  const decoyGeo = new THREE.BufferGeometry();
  decoyGeo.setAttribute('position', new THREE.Float32BufferAttribute(decoyPos, 3));
  decoyGeo.setAttribute('aR', new THREE.Float32BufferAttribute(decoyRand, 1));
  const uTime = { value: 0 };
  globe.add(new THREE.Points(decoyGeo, new THREE.ShaderMaterial({
    uniforms: { uTime, uTex: { value: dotTexture() }, uPx: { value: window.devicePixelRatio } },
    vertexShader: `uniform float uTime, uPx; attribute float aR; varying float vA; void main(){ vA = step(0.85, fract(uTime*0.4 + aR*13.)); vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = 9. * uPx * (4. / -mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ gl_FragColor = vec4(1.,.68,.23, texture2D(uTex, gl_PointCoord).a * (0.15 + vA*0.85)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // 跳转节点 + 弧线
  const ringGeo = new THREE.RingGeometry(0.05, 0.06, 48);
  const hops = HOPS.map((h, i) => {
    const p = ll(h.lat, h.lon, R * 1.01);
    const marker = new THREE.Group();
    marker.position.copy(p); marker.lookAt(p.clone().multiplyScalar(2));
    const rings = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: h.final ? COLORS.red : COLORS.orange, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      marker.add(m); return m;
    });
    globe.add(marker);
    const el = document.createElement('div');
    el.className = `label3d ${h.final ? 'red' : 'orange'}`;
    el.innerHTML = `<b>${String(i + 1).padStart(2, '0')} · ${h.name}</b>${h.final ? '信号源 · 已锁定' : '中继 · 已绕过'}`;
    const label = new CSS2DObject(el); label.position.copy(p.clone().multiplyScalar(1.04)); label.visible = false;
    globe.add(label);
    let arc = null;
    if (i > 0) {
      const a = ll(HOPS[i - 1].lat, HOPS[i - 1].lon, R * 1.01);
      const mid = a.clone().add(p).multiplyScalar(0.5);
      mid.setLength(R * (1.08 + a.distanceTo(p) * 0.22));
      const curve = new THREE.QuadraticBezierCurve3(a, mid, p);
      const pts = curve.getPoints(80);
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setDrawRange(0, 0);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: h.final ? COLORS.red : COLORS.orange, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      globe.add(line);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      head.visible = false; globe.add(head);
      arc = { line, curve, head };
    }
    return { ...h, p, marker, rings, label, arc, reached: -1 };
  });

  let trace = null, auto = true, fly = null;
  const resetTrace = () => {
    trace = null;
    hops.forEach((h) => { h.reached = -1; h.label.visible = false; h.rings.forEach((r) => (r.material.opacity = 0)); if (h.arc) { h.arc.line.geometry.setDrawRange(0, 0); h.arc.head.visible = false; } });
  };
  const startTrace = () => {
    resetTrace();
    trace = { hop: 0, k: 0, t0: uTime.value };
    hops[0].reached = uTime.value; hops[0].label.visible = true;
    auto = true;
    ui.say(`开始追踪广播信号。第一个跳点：${hops[0].name}。信号在不断反弹……`);
  };

  const ctl = panel(
    row(button('开始追踪', startTrace, 'warn'), button('重置', () => { resetTrace(); ui.say('追踪已重置。'); })),
    row(button('自动旋转', () => { auto = !auto; })),
    note('橙色闪点是伪装用的干扰中继。AI 逐跳破解路由后，弧线会依次点亮，最终在真实发射点出现红色锁定标记。<br><br><i>大陆轮廓为示意性程序化生成。</i>'),
  );

  return {
    id: 'trace', title: '信号溯源', scene,
    subtitle: '把"网络路由"这种看不见的数据变成地球上的弧线与跳点 —— 让推理过程本身可视。',
    hint: '点"开始追踪"观看逐跳破解 · 拖动旋转地球',
    cameraPos: new THREE.Vector3(0, 1.8, 6.2), target: new THREE.Vector3(0, 0, 0),
    minDistance: 2.6, maxDistance: 14, bloom: 0.7,
    panel: ctl,
    enter() { ui.say('全球中继网络已载入。检测到伪装信号，准备溯源。'); },
    update(t, dt) {
      uTime.value = t;
      if (auto && !fly) globe.rotation.y += dt * (trace ? 0.05 : 0.12);
      if (trace && trace.hop < hops.length - 1) {
        const next = hops[trace.hop + 1];
        trace.k = Math.min(trace.k + dt / 1.6, 1);
        const n = Math.floor(ease.inOutCubic(trace.k) * 81);
        next.arc.line.geometry.setDrawRange(0, n);
        next.arc.head.visible = trace.k < 1;
        next.arc.head.position.copy(next.arc.curve.getPoint(ease.inOutCubic(trace.k)));
        if (trace.k >= 1) {
          trace.hop++; trace.k = 0;
          next.reached = t; next.label.visible = true;
          if (next.final) {
            ui.say(`追踪完成。所有跳点都是伪装 —— 真实信号源位于${next.name}。已锁定坐标 ${next.lat.toFixed(2)}°N, ${Math.abs(next.lon).toFixed(2)}°W。`);
            auto = false;
            const w = globe.localToWorld(next.p.clone());
            fly = { p0: camera.position.clone(), p1: w.clone().setLength(5.2), k: 0 };
          } else ui.say(`${next.name}：中继站，已绕过。继续追踪下一跳……`);
        }
      }
      for (const h of hops) {
        if (h.reached < 0) continue;
        h.rings.forEach((r, i) => {
          const k = ((t - h.reached) * (h.final ? 0.9 : 0.6) + i / 3) % 1;
          r.scale.setScalar(1 + k * (h.final ? 6 : 3));
          r.material.opacity = (1 - k) * (h.final ? 1 : 0.7);
        });
      }
      if (fly) {
        fly.k = Math.min(fly.k + dt / 2, 1);
        camera.position.lerpVectors(fly.p0, fly.p1, ease.inOutCubic(fly.k));
        controls.target.set(0, 0, 0);
        if (fly.k >= 1) fly = null;
      }
    },
    hudTargets() {
      if (!trace) return [];
      const cur = hops[Math.min(trace.hop, hops.length - 1)];
      const w = globe.localToWorld(cur.p.clone());
      if (w.clone().sub(camera.position).dot(w) > 0) return [];  // 在地球背面
      return [{ position: w, label: cur.en, sub: cur.final ? 'SOURCE LOCKED' : 'RELAY', locked: !!cur.final, color: cur.final ? 'red' : 'orange' }];
    },
    telemetry() {
      return [`HOPS ${trace ? trace.hop + 1 : 0}/${hops.length}`, `DECOYS 160`, trace && hops[trace.hop].final ? 'STATUS: LOCKED' : trace ? 'STATUS: TRACING' : 'STATUS: IDLE'];
    },
  };
}
