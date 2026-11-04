// 场景 2：爆炸现场全息重建 —— 点云 + 时间轴 + 热力图 + 监控视角 + 反向弹道
// 灵感：主角把现场勘查数据、监控录像、温度读数融合成一个可以走进去的 1:1 全息现场，
//      并在热信号中发现"没有炸弹残片、只有超高温热源"这一关键线索。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COLORS, dotTexture, rng, ease, holoGrid } from '../holo.js';
import { panel, row, button, slider, note } from '../ui.js';

export const BLAST = new THREE.Vector3(0, 0.6, 2.2);
const T_MIN = -8, T_MAX = 22;
export const CCTV = new THREE.Vector3(-7.5, 4.2, 9);

export function buildCloud(rand, withPeople = true) {
  const pos = [], typ = [], rnd = [];
  const push = (x, y, z, t) => { pos.push(x, y, z); typ.push(t); rnd.push(rand()); };
  // 在长方体表面按面积采样
  const box = (cx, cy, cz, sx, sy, sz, density = 60, t = 0) => {
    const faces = [[sx, sy, 'z'], [sx, sz, 'y'], [sy, sz, 'x']];
    for (const [a, b, ax] of faces) {
      const n = Math.floor(a * b * density);
      for (let i = 0; i < n; i++) {
        const u = (rand() - 0.5) * a, v = (rand() - 0.5) * b, s = rand() < 0.5 ? -0.5 : 0.5;
        if (ax === 'z') push(cx + u, cy + v, cz + s * sz, t);
        if (ax === 'y') push(cx + u, cy + s * sy, cz + v, t);
        if (ax === 'x') push(cx + s * sx, cy + u, cz + v, t);
      }
    }
  };
  const cyl = (cx, cz, r, h, density = 60, t = 0, y0 = 0) => {
    const n = Math.floor(2 * Math.PI * r * h * density);
    for (let i = 0; i < n; i++) { const a = rand() * Math.PI * 2; push(cx + Math.cos(a) * r, y0 + rand() * h, cz + Math.sin(a) * r, t); }
  };
  // 后方主立面 + 层叠屋檐 + 两侧翼墙
  box(0, 3, -6, 12, 6, 0.6, 22);
  box(0, 6.4, -5.4, 14, 0.3, 2.4, 22);
  box(0, 7.6, -5.7, 10, 0.3, 1.8, 22);
  box(0, 8.6, -5.9, 6, 0.3, 1.2, 22);
  box(-8, 2.2, -1, 0.6, 4.4, 10, 18);
  box(8, 2.2, -1, 0.6, 4.4, 10, 18);
  // 门前两根立柱
  cyl(-3, -3.4, 0.35, 6, 40); cyl(3, -3.4, 0.35, 6, 40);
  // 台阶
  for (let i = 0; i < 4; i++) box(0, 0.12 + i * 0.24, -4.6 + i * 0.3 - 1.2, 9 - i, 0.24, 0.3, 18);
  // 售票亭、路灯、隔离柱
  box(5, 1.1, 1.2, 1.4, 2.2, 1.2, 45);
  [[-5, 4], [5, 5], [-5.5, -2], [5.5, -2]].forEach(([x, z]) => { cyl(x, z, 0.06, 3.6, 120); box(x, 3.7, z, 0.6, 0.12, 0.2, 200); });
  for (let i = -4; i <= 4; i++) cyl(i * 1.2, 6.5, 0.1, 0.9, 120);
  // 车辆
  [[-4.2, 7.8, 0], [2.6, 8.4, 0.3], [6.5, 3.2, 1.5]].forEach(([x, z, r]) => {
    const c = Math.cos(r), s = Math.sin(r), start = pos.length;
    box(0, 0.55, 0, 1.8, 0.7, 4.0, 40, 2); box(0, 1.15, -0.2, 1.6, 0.6, 2.2, 40, 2);
    for (let i = start; i < pos.length; i += 3) { const px = pos[i], pz = pos[i + 2]; pos[i] = x + px * c - pz * s; pos[i + 2] = z + px * s + pz * c; }
  });
  // 人群（简化人形）
  const person = (x, z, t = 1) => { cyl(x, z, 0.17, 1.35, 90, t); box(x, 1.55, z, 0.22, 0.26, 0.22, 400, t); };
  if (withPeople) for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = 2 + rand() * 7;
    person(BLAST.x + Math.cos(a) * r, BLAST.z + Math.sin(a) * r * 0.7);
  }
  if (withPeople) person(BLAST.x, BLAST.z, 3); // 爆炸中心站着的那个人：线索
  return { pos: new Float32Array(pos), typ: new Float32Array(typ), rnd: new Float32Array(rnd) };
}

export function createCrimeScene({ camera, controls, ui }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02070c, 0.025);
  const rand = rng(7);
  const uT = { value: T_MIN };

  // ---------- 地面：网格 + 热力图 ----------
  const groundMat = new THREE.ShaderMaterial({
    uniforms: { uT, uBlast: { value: BLAST }, uHeat: { value: 1 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      uniform float uT, uHeat; uniform vec3 uBlast; varying vec3 vW;
      vec3 ramp(float h){ return mix(mix(vec3(0.05,0.2,0.9), vec3(1.,0.85,0.2), smoothstep(0.,0.5,h)), vec3(1.,0.2,0.1), smoothstep(0.5,1.,h)); }
      void main(){
        vec2 g = abs(fract(vW.xz) - 0.5);
        float line = 1. - smoothstep(0., 0.03, min(g.x, g.y));
        float d = distance(vW.xz, uBlast.xz);
        float t = max(uT, 0.);
        float r = 1.5 + 5.0 * (1. - exp(-t * 1.2));
        float h = uT > 0. ? exp(-d*d/(r*r)) * (0.35 + 0.65*exp(-t*0.15)) * uHeat : 0.;
        float rings = uT > 0. ? (1. - smoothstep(0., .04, abs(fract(d*0.5 - 0.5) - 0.5))) * 0.25 * step(d, 12.) : 0.;
        vec3 c = vec3(0.37,0.95,1.) * (line * 0.22 + rings);
        c += ramp(h) * h * 1.3;
        float a = clamp(line*0.35 + h + rings, 0., 1.) * (1. - smoothstep(14., 22., length(vW.xz)));
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ---------- 现场点云 ----------
  const cloud = buildCloud(rand);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cloud.pos, 3));
  geo.setAttribute('aType', new THREE.BufferAttribute(cloud.typ, 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(cloud.rnd, 1));
  const pointsMat = new THREE.ShaderMaterial({
    uniforms: { uT, uBlast: { value: BLAST }, uTex: { value: dotTexture() }, uPx: { value: window.devicePixelRatio } },
    vertexShader: /* glsl */ `
      uniform float uT, uPx; uniform vec3 uBlast;
      attribute float aType, aRand; varying vec3 vC; varying float vA;
      void main(){
        float d = distance(position, uBlast);
        float arrive = d / 35.0;
        float k = clamp((uT - arrive) * 1.6, 0., 1.);
        k = 1. - pow(1. - k, 3.);
        float force = 1. - smoothstep(0., 11., d);
        vec3 dir = normalize(position - uBlast + vec3(0., 0.8, 0.));
        float mobility = aType == 0. ? 0.35 : (aType == 2. ? 0.7 : 1.4);
        vec3 p = position + dir * force * force * 4.5 * mobility * k * (0.4 + aRand);
        p.y = max(p.y - k * k * force * 1.2 * aRand, 0.02);   // 碎片落地
        float heat = uT > 0. ? force * exp(-uT * 0.12) : 0.;
        vec3 base = aType == 1. ? vec3(0.8, 1., 1.) : (aType == 2. ? vec3(0.5, 0.8, 1.) : vec3(0.37, 0.95, 1.));
        if (aType == 3.) base = uT < 0. ? vec3(1., 0.3, 0.25) * (1.2 + 0.6 * sin(uT * 8.)) : vec3(1.,0.6,0.2);
        vC = mix(base, vec3(1., 0.55, 0.15), clamp(heat * 1.6, 0., 1.));
        vA = aType == 3. && uT > 0.2 ? 0. : 0.85;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (aType == 0. ? 1.8 : 2.4) * uPx * (12. / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geo, pointsMat));

  // ---------- 爆炸：闪光球 + 冲击波环 ----------
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.position.copy(BLAST);
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 128),
    new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  shock.rotation.x = -Math.PI / 2; shock.position.set(BLAST.x, 0.05, BLAST.z);
  scene.add(flash, shock);

  // ---------- 反向弹道：碎片 → 源点 ----------
  const traceGeo = new THREE.BufferGeometry();
  const tp = [];
  for (let i = 0; i < 70; i++) {
    const idx = Math.floor(rand() * (cloud.pos.length / 3));
    const p = new THREE.Vector3(cloud.pos[idx * 3], cloud.pos[idx * 3 + 1], cloud.pos[idx * 3 + 2]);
    if (p.distanceTo(BLAST) > 10) { i--; continue; }
    const dir = p.clone().sub(BLAST).add(new THREE.Vector3(0, 0.8, 0)).normalize();
    const end = p.clone().addScaledVector(dir, (1 - p.distanceTo(BLAST) / 11) ** 2 * 4.5 * (0.6 + rand()));
    end.y = Math.max(end.y, 0.05);
    tp.push(end.x, end.y, end.z, BLAST.x, BLAST.y, BLAST.z);
  }
  traceGeo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  const traces = new THREE.LineSegments(traceGeo, new THREE.LineBasicMaterial({ color: COLORS.red, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(traces);

  // ---------- 监控摄像机视锥（录像与三维现场对齐） ----------
  const cctvCam = new THREE.PerspectiveCamera(34, 16 / 9, 0.5, 4);
  cctvCam.position.copy(CCTV); cctvCam.lookAt(BLAST); cctvCam.updateMatrixWorld();
  const frustum = new THREE.CameraHelper(cctvCam);
  frustum.material.transparent = true; frustum.material.opacity = 0.3;
  frustum.setColors(COLORS.orange, COLORS.orange, COLORS.orange, COLORS.orange, COLORS.orange);
  scene.add(frustum);
  scene.add(holoGrid(44, 22, 0x5ff3ff, 0.05));

  // ---------- 证据标注 ----------
  const evidence = [
    { key: 'origin', pos: BLAST.clone().setY(2.3), cls: 'red', title: '热源中心', text: '峰值 >3000°C · 无爆炸物残片', minT: 0,
      view: [new THREE.Vector3(3.5, 3, 7), BLAST], say: '奇怪：没有任何炸弹残片，热信号却超过三千度。爆炸源更像是……一个人。' },
    { key: 'tag', pos: new THREE.Vector3(BLAST.x + 1.4, 0.3, BLAST.z + 1.1), cls: 'orange', title: '熔融军籍牌', text: '烙印在地面 · 主人生前站在中心', minT: 0,
      view: [new THREE.Vector3(BLAST.x + 2.8, 1.6, BLAST.z + 3.2), new THREE.Vector3(BLAST.x + 1.4, 0, BLAST.z + 1.1)], say: '一块熔进地面的军籍牌。它的主人就站在爆心——爆炸前没有任何携带爆炸物的迹象。' },
    { key: 'cctv', pos: CCTV.clone(), cls: 'orange', title: 'CCTV-07', text: '录像已与时间轴同步', minT: T_MIN,
      view: [CCTV.clone(), BLAST], say: '已切换到 7 号监控机位。把录像投影回三维现场，可以逐帧对齐每个人的位置。' },
    { key: 'radius', pos: new THREE.Vector3(BLAST.x + 9, 0.4, BLAST.z), cls: '', title: '冲击波半径', text: '≈ 11 m 致损范围', minT: 0.4,
      view: [new THREE.Vector3(0, 18, BLAST.z + 0.1), BLAST], say: '俯视：冲击波有效半径约 11 米，碎片分布呈径向对称——单一点源。' },
  ];
  let fly = null;
  const flyTo = (pos, target) => { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), k: 0 }; };
  for (const e of evidence) {
    const el = document.createElement('div');
    el.className = `label3d ${e.cls}`;
    el.innerHTML = `<b>${e.title}</b>${e.text}`;
    el.onclick = () => { flyTo(...e.view); ui.say(e.say); ui.inspect(e.title, [['说明', e.text], ['时间', `T${uT.value >= 0 ? '+' : ''}${uT.value.toFixed(1)} s`]]); };
    e.obj = new CSS2DObject(el);
    e.obj.position.copy(e.pos);
    scene.add(e.obj);
  }

  // ---------- 控制面板 ----------
  let playing = true, traceOn = false;
  const tSlider = slider('时间轴 T(s)', { min: T_MIN, max: T_MAX, step: 0.1, value: T_MIN }, (v) => { uT.value = v; playing = false; playBtn.textContent = '▶ 播放'; });
  const playBtn = button('❚❚ 暂停', () => { playing = !playing; playBtn.textContent = playing ? '❚❚ 暂停' : '▶ 播放'; if (playing && uT.value >= T_MAX - 0.1) uT.value = T_MIN; });
  const traceBtn = button('反向弹道追溯', () => { traceOn = !traceOn; traceBtn.classList.toggle('active', traceOn); if (traceOn) ui.say('把每块碎片的飞行轨迹反推回去……全部汇聚到同一点。'); }, 'warn');
  const ctl = panel(
    tSlider,
    row(playBtn, button('⟲ 重放', () => { uT.value = T_MIN; playing = true; playBtn.textContent = '❚❚ 暂停'; })),
    row(traceBtn, button('监控视角', () => evidence[2].obj.element.click())),
    row(button('俯视', () => evidence[3].obj.element.click()), button('现场漫游', () => flyTo(new THREE.Vector3(1.5, 1.7, 6.5), BLAST))),
    note('点击场景中的<b>证据标签</b>可飞到对应视角。拖动时间轴可在爆炸前后来回"倒带"——红色人影即爆心位置的人。'),
  );

  return {
    id: 'scene', title: '现场重建', scene,
    subtitle: '把勘查点云、监控录像、热成像和时间轴融合为一个可"走进去"的全息现场，逆向推理爆炸源。',
    hint: '拖动时间轴倒带 · 点击证据标签飞行 · H 头盔HUD',
    cameraPos: new THREE.Vector3(10, 7, 14), target: new THREE.Vector3(0, 1, 0),
    minDistance: 1, maxDistance: 40, bloom: 0.6,
    panel: ctl,
    enter() { uT.value = T_MIN; playing = true; playBtn.textContent = '❚❚ 暂停'; ui.say('重建完成：现场点云 ' + (cloud.pos.length / 3).toLocaleString() + ' 点，监控录像已同步。开始回放。'); },
    update(t, dt) {
      if (playing) {
        uT.value += dt * (uT.value > -0.5 && uT.value < 3 ? 0.35 : 1.5);   // 爆炸附近放慢
        if (uT.value >= T_MAX) { uT.value = T_MAX; playing = false; playBtn.textContent = '▶ 播放'; }
        tSlider.set(uT.value);
      }
      const T = uT.value;
      // 闪光与冲击波
      const ft = T > 0 ? T : -1;
      flash.material.opacity = ft >= 0 ? Math.max(0, 1 - ft * 1.2) : 0;
      flash.scale.setScalar(ft >= 0 ? 0.3 + ease.outCubic(Math.min(ft * 2, 1)) * 2.5 : 0.01);
      shock.material.opacity = ft >= 0 ? Math.max(0, 1 - ft / 1.2) : 0;
      shock.scale.setScalar(ft >= 0 ? 0.1 + ft * 18 : 0.01);
      traces.material.opacity += ((traceOn && T > 1 ? 0.55 : 0) - traces.material.opacity) * 0.1;
      for (const e of evidence) e.obj.visible = T >= e.minT;
      if (fly) {
        fly.k = Math.min(fly.k + dt / 1.4, 1);
        const k = ease.inOutCubic(fly.k);
        camera.position.lerpVectors(fly.p0, fly.p1, k);
        controls.target.lerpVectors(fly.t0, fly.t1, k);
        if (fly.k >= 1) fly = null;
      }
    },
    hudTargets() {
      const T = uT.value;
      return T > 0
        ? [{ position: BLAST, label: 'HEAT SOURCE', sub: `${Math.round(3000 * Math.exp(-T * 0.05) + 400)}°C`, locked: true, color: 'red' }]
        : [{ position: BLAST.clone().setY(1), label: 'SUBJECT #27', sub: 'THERMAL ANOMALY', color: 'orange' }];
    },
    telemetry() {
      const T = uT.value;
      return [`T ${T >= 0 ? '+' : ''}${T.toFixed(1)} s`, `SHOCK R ${T > 0 ? Math.min(T * 18, 99).toFixed(1) : '0.0'} m`, `POINTS ${(cloud.pos.length / 3).toLocaleString()}`];
    },
  };
}
