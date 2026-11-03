// 场景 3：可走入的全息大脑 —— 神经脉冲 / 脑区选择 / "注入"波前 / 飞入内部
// 灵感：反派在会议室投射出自己大脑的实时全息扫描，邀请访客"走进"大脑里观察神经活动。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { dotTexture, rng, ease } from '../holo.js';
import { panel, row, button, note } from '../ui.js';

const REGIONS = [
  { name: '额叶', en: 'FRONTAL', c: [0, 0.35, 0.85], fn: '决策 · 规划 · 人格' },
  { name: '顶叶', en: 'PARIETAL', c: [0, 0.75, -0.2], fn: '空间感知 · 触觉整合' },
  { name: '颞叶', en: 'TEMPORAL', c: [0.85, -0.15, 0.15], fn: '听觉 · 语言 · 记忆' },
  { name: '枕叶', en: 'OCCIPITAL', c: [0, 0.2, -1.05], fn: '视觉处理' },
  { name: '运动皮层', en: 'MOTOR', c: [0, 0.85, 0.3], fn: '随意运动控制' },
  { name: '小脑', en: 'CEREBELLUM', c: [0, -0.55, -0.85], fn: '平衡 · 协调 · 运动学习' },
  { name: '脑干', en: 'BRAINSTEM', c: [0, -0.9, -0.25], fn: '呼吸 · 心率 · 自主神经' },
];

function brainShape(rand, n) {
  const pos = new Float32Array(n * 3), reg = new Float32Array(n), rnd = new Float32Array(n);
  const v = new THREE.Vector3();
  const regionVecs = REGIONS.map((r) => new THREE.Vector3(...r.c));
  let i = 0;
  while (i < n) {
    const kind = rand();
    if (kind < 0.8) {
      // 大脑半球：椭球 + 沟回褶皱
      v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
      const surface = rand() < 0.75;
      v.normalize();
      const fold = 0.06 * Math.sin(v.x * 11 + Math.sin(v.y * 7) * 2) * Math.sin(v.z * 9 + v.y * 5) + 0.03 * Math.sin(v.y * 23 + v.z * 17);
      const r = surface ? 1 + fold : Math.cbrt(rand()) * 0.92;
      v.multiplyScalar(r);
      if (Math.abs(v.x) < 0.04) continue;            // 纵裂
      v.x += Math.sign(v.x) * 0.04;
      v.multiply(new THREE.Vector3(0.82, 0.78, 1.15));
      if (v.y < -0.45 && v.z < -0.3) continue;        // 给小脑留空间
      v.y += 0.12;
    } else if (kind < 0.93) {
      // 小脑
      v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (v.lengthSq() > 1) continue;
      v.normalize().multiplyScalar(1 + 0.05 * Math.sin(v.y * 40));
      v.multiply(new THREE.Vector3(0.55, 0.28, 0.35)).add(new THREE.Vector3(0, -0.55, -0.82));
    } else {
      // 脑干
      const a = rand() * Math.PI * 2, h = rand();
      const r = 0.13 * (1 - h * 0.3);
      v.set(Math.cos(a) * r, -0.35 - h * 0.85, -0.2 - h * 0.15 + Math.sin(a) * r);
    }
    pos.set([v.x, v.y, v.z], i * 3);
    let best = 0, bd = 1e9;
    regionVecs.forEach((rv, k) => { const dd = rv.distanceToSquared(v.clone().setX(Math.abs(v.x) * (k === 2 ? 1 : 0.3))); if (dd < bd) { bd = dd; best = k; } });
    reg[i] = best;
    rnd[i] = rand();
    i++;
  }
  return { pos, reg, rnd };
}

export function createBrainScene({ camera, controls, ui }) {
  const scene = new THREE.Scene();
  const rand = rng(1337);
  const N = 26000;
  const uTime = { value: 0 }, uRegion = { value: -1 }, uWave = { value: -10 };
  const brain = new THREE.Group();
  brain.position.y = 1.4;
  scene.add(brain);

  // ---------- 神经元点云 ----------
  const data = brainShape(rand, N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
  geo.setAttribute('aRegion', new THREE.BufferAttribute(data.reg, 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(data.rnd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime, uRegion, uWave, uTex: { value: dotTexture() }, uPx: { value: window.devicePixelRatio } },
    vertexShader: /* glsl */ `
      uniform float uTime, uRegion, uWave, uPx; attribute float aRegion, aRand; varying vec3 vC; varying float vA;
      void main(){
        float sel = uRegion >= 0. ? (abs(aRegion - uRegion) < .5 ? 1. : 0.) : -1.;
        float fire = pow(0.5 + 0.5 * sin(uTime * (1.5 + aRand * 4.) + aRand * 60.), 24.);
        // 注入波前：从脑干向外扩散的橙色波
        float d = distance(position, vec3(0., -1., -0.3));
        float front = uWave - d;
        float wave = smoothstep(0., .08, front) * (1. - smoothstep(.08, .6, front));
        float infused = smoothstep(0., .5, front) * step(0., uWave);
        vec3 base = mix(vec3(0.3, 0.8, 1.), vec3(1., .55, .15), infused * 0.85);
        vC = base * (0.55 + fire * 1.6) + vec3(1., .75, .3) * wave * 2.;
        vA = sel < 0. ? 0.75 : mix(0.12, 1., sel);
        if (sel > 0.) vC = mix(vC, vec3(1., .7, .25), .7);
        vec3 p = position * (1. + wave * 0.04);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (1.4 + fire * 2.5 + sel * 1.2 + wave * 3.) * uPx * (3.2 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA;
      void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vC, a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  brain.add(points);

  // ---------- 神经连接 + 沿线传播的脉冲 ----------
  const lp = [], lt = [], lph = [];
  const P = (k) => new THREE.Vector3(data.pos[k * 3], data.pos[k * 3 + 1], data.pos[k * 3 + 2]);
  for (let c = 0; c < 1800; c++) {
    const a = P(Math.floor(rand() * N));
    let b = null;
    for (let tries = 0; tries < 40 && !b; tries++) {
      const cand = P(Math.floor(rand() * N));
      const dd = cand.distanceTo(a);
      if (dd > 0.08 && dd < 0.35) b = cand;
    }
    if (!b) continue;
    const ph = rand();
    // 每条连接分 6 段，以便沿线做脉冲渐变
    for (let s = 0; s < 6; s++) {
      const p0 = a.clone().lerp(b, s / 6), p1 = a.clone().lerp(b, (s + 1) / 6);
      lp.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); lt.push(s / 6, (s + 1) / 6); lph.push(ph, ph);
    }
  }
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lgeo.setAttribute('aT', new THREE.Float32BufferAttribute(lt, 1));
  lgeo.setAttribute('aPh', new THREE.Float32BufferAttribute(lph, 1));
  const lmat = new THREE.ShaderMaterial({
    uniforms: { uTime, uWave },
    vertexShader: `attribute float aT, aPh; varying float vT, vPh; varying vec3 vP; void main(){ vT=aT; vPh=aPh; vP=position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uWave; varying float vT, vPh; varying vec3 vP;
      void main(){
        float head = fract(uTime * (0.3 + vPh * 0.5) + vPh * 7.);
        float pulse = smoothstep(0.25, 0., abs(vT - head));
        float infused = step(0., uWave) * smoothstep(0., .5, uWave - distance(vP, vec3(0.,-1.,-0.3)));
        vec3 c = mix(vec3(0.35, 0.85, 1.), vec3(1., .6, .2), infused);
        gl_FragColor = vec4(c, 0.04 + pulse * 0.7);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  brain.add(new THREE.LineSegments(lgeo, lmat));

  // 投影仪光锥（从地面投射出全息影像）
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.9, 48, 1, true),
    new THREE.ShaderMaterial({
      vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying float vY; void main(){ gl_FragColor = vec4(0.37,0.95,1., 0.05 * (0.5 + vY / 0.9)); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
  cone.rotation.x = Math.PI; cone.position.y = 0.45;
  scene.add(cone);
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.08, 32), new THREE.MeshBasicMaterial({ color: 0x5fc8d8 }));
  base.rotation.x = -Math.PI / 2; base.position.y = 0.0;
  scene.add(base);

  // 脑区标签
  const labels = REGIONS.map((r, k) => {
    const el = document.createElement('div');
    el.className = 'label3d';
    el.innerHTML = `<b>${r.name}</b>${r.en}`;
    el.onclick = () => selectRegion(k);
    const o = new CSS2DObject(el);
    const p = new THREE.Vector3(...r.c).multiplyScalar(1.25);
    if (k === 2) p.x = 1.25;
    o.position.copy(p);
    brain.add(o);
    return o;
  });

  let auto = true, fly = null, regionSel = -1;
  function selectRegion(k) {
    regionSel = regionSel === k ? -1 : k;
    uRegion.value = regionSel;
    labels.forEach((l, i) => l.element.classList.toggle('orange', i === regionSel));
    if (regionSel < 0) { ui.inspect(null); return; }
    const r = REGIONS[k];
    const cnt = data.reg.filter((x) => x === k).length;
    ui.inspect(`${r.name} · ${r.en}`, [['功能', r.fn], ['采样神经元', cnt.toLocaleString()], ['活跃度', `${(40 + Math.random() * 55).toFixed(1)}%`], ['突触密度', `${(1 + Math.random()).toFixed(2)}×10⁹/mm³`]]);
    ui.say(`隔离显示${r.name}：${r.fn}。`);
  }
  const flyTo = (p, t) => { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, k: 0 }; };

  const autoBtn = button('自动旋转', () => { auto = !auto; autoBtn.classList.toggle('active', auto); });
  autoBtn.classList.add('active');
  const ctl = panel(
    row(button('注入波前', () => { uWave.value = 0; ui.say('注入开始：改造信号从脑干向整个皮层扩散，神经活动被重新"编程"。'); }, 'warn'), button('复位', () => { uWave.value = -10; })),
    row(button('走进大脑', () => { flyTo(new THREE.Vector3(0.15, 1.55, 0.25), new THREE.Vector3(0, 1.45, -0.6)); ui.say('你现在站在大脑内部。每一个光点是一个被扫描到的神经元。'); }),
      button('退出', () => flyTo(new THREE.Vector3(2.6, 2.0, 3.2), new THREE.Vector3(0, 1.4, 0)))),
    row(autoBtn),
    note('点击<b>脑区标签</b>可隔离显示该区域。滚轮可以直接缩放进入大脑内部 —— 全息影像没有"外壳"，观察者可以站进数据里。'),
  );

  return {
    id: 'brain', title: '全息大脑', scene,
    subtitle: '把实时脑扫描投射成可以站进去的立体影像：数据不再在屏幕里，人在数据里。',
    hint: '点击脑区标签隔离显示 · 滚轮放大进入内部',
    cameraPos: new THREE.Vector3(2.6, 2.0, 3.2), target: new THREE.Vector3(0, 1.4, 0),
    minDistance: 0.05, maxDistance: 12, bloom: 0.8,
    panel: ctl,
    enter() { ui.say('脑部扫描投影中。' + N.toLocaleString() + ' 个神经元节点，实时活动。'); },
    update(t, dt) {
      uTime.value = t;
      if (uWave.value >= 0 && uWave.value < 4) uWave.value += dt * 0.7;
      if (auto && !fly) brain.rotation.y += dt * 0.12;
      if (fly) {
        fly.k = Math.min(fly.k + dt / 1.8, 1);
        const k = ease.inOutCubic(fly.k);
        camera.position.lerpVectors(fly.p0, fly.p1, k);
        controls.target.lerpVectors(fly.t0, fly.t1, k);
        if (fly.k >= 1) fly = null;
      }
    },
    hudTargets() {
      if (regionSel < 0) return [];
      const p = labels[regionSel].getWorldPosition(new THREE.Vector3());
      return [{ position: p, label: REGIONS[regionSel].en, sub: 'ISOLATED', locked: true, color: 'orange' }];
    },
    telemetry() {
      const inside = camera.position.distanceTo(brain.position) < 1.0;
      return [`NEURONS ${N.toLocaleString()}`, `INFUSION ${uWave.value < 0 ? '—' : Math.min(100, (uWave.value / 2.6) * 100).toFixed(0) + '%'}`, inside ? 'VIEW: INSIDE' : 'VIEW: EXTERNAL'];
    },
  };
}
