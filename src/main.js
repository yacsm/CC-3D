import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { holoTime } from './holo.js';
import { Hud } from './hud.js';
import { GestureInput } from './gesture.js';
import { createArmorScene } from './scenes/armor.js';
import { createCrimeScene } from './scenes/crime.js';
import { createBrainScene } from './scenes/brain.js';
import { createGlobeScene } from './scenes/globe.js';

// ---------- 渲染基础 ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x02070c, 1);

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.4, 0.22);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const hud = new Hud(document.getElementById('hud'), camera);

// ---------- 界面 / 语音提示 ----------
const ui = {
  title: document.getElementById('scene-title'),
  sub: document.getElementById('scene-sub'),
  controls: document.getElementById('scene-controls'),
  inspector: document.getElementById('inspector'),
  hint: document.getElementById('hint'),
  voiceEl: document.getElementById('voice-text'),
  say(text) {
    // 打字机效果模拟 AI 管家的语音播报
    clearInterval(this._t);
    let i = 0;
    this.voiceEl.textContent = '';
    this._t = setInterval(() => {
      this.voiceEl.textContent = text.slice(0, ++i);
      if (i >= text.length) clearInterval(this._t);
    }, 22);
  },
  inspect(title, rows) {
    if (!title) { this.inspector.classList.add('hidden'); return; }
    this.inspector.classList.remove('hidden');
    this.inspector.innerHTML = `<h3>${title}</h3><table>${rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  },
};

const ctx = { renderer, camera, controls, hud, ui, bloom };
const scenes = [createArmorScene(ctx), createCrimeScene(ctx), createBrainScene(ctx), createGlobeScene(ctx)];
let active = null;

// ---------- 场景切换 ----------
const tabs = document.getElementById('tabs');
scenes.forEach((s, i) => {
  const b = document.createElement('button');
  b.textContent = `${i + 1}·${s.title}`;
  b.onclick = () => activate(i);
  s._tab = b;
  tabs.appendChild(b);
});

function activate(i) {
  const next = scenes[i];
  if (active === next) return;
  if (active) { active.exit?.(); active._tab.classList.remove('active'); }
  active = next;
  next._tab.classList.add('active');
  labelRenderer.domElement.replaceChildren();
  renderPass.scene = next.scene;
  ui.title.textContent = next.title;
  ui.sub.textContent = next.subtitle;
  ui.controls.replaceChildren(next.panel);
  ui.inspect(null);
  ui.hint.textContent = next.hint || '';
  camera.position.copy(next.cameraPos);
  controls.target.copy(next.target);
  controls.minDistance = next.minDistance ?? 0.5;
  controls.maxDistance = next.maxDistance ?? 60;
  controls.update();
  bloom.strength = next.bloom ?? 0.7;
  hud.setScene(next.title);
  next.enter?.();
  history.replaceState(null, '', `#${next.id}`);
}

// ---------- 统一输入：鼠标 + 手势 都走这里 ----------
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 0.05;
const ndc = new THREE.Vector2();
let pointerDown = false, captured = false, downAt = { x: 0, y: 0 };

function toNdc(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
const input = {
  move(x, y) {
    toNdc(x, y);
    hud.cursor.set(x, y);
    if (pointerDown && captured) active.pointerMove?.(raycaster, ndc);
    else active.hover?.(raycaster, ndc);
  },
  down(x, y) {
    toNdc(x, y);
    pointerDown = true; downAt = { x, y };
    captured = !!active.pointerDown?.(raycaster, ndc);
    controls.enabled = !captured;
    hud.pulse(x, y);
  },
  up(x, y) {
    toNdc(x, y);
    const click = Math.hypot(x - downAt.x, y - downAt.y) < 5;
    if (captured) active.pointerUp?.(raycaster, ndc);
    else if (click) active.click?.(raycaster, ndc);
    pointerDown = false; captured = false; controls.enabled = true;
  },
  // 手势：未抓取物体时，捏合拖动 = 旋转视角
  orbit(dx, dy) {
    if (captured) return;
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta -= dx * 4; sph.phi = THREE.MathUtils.clamp(sph.phi - dy * 4, 0.1, Math.PI - 0.1);
    camera.position.copy(controls.target).add(off.setFromSpherical(sph));
  },
  // 双手张合 = 展开 / 缩放
  spread(delta) {
    if (active.spread) active.spread(delta);
    else {
      const off = camera.position.clone().sub(controls.target);
      off.multiplyScalar(THREE.MathUtils.clamp(1 - delta * 2, 0.9, 1.1));
      camera.position.copy(controls.target).add(off);
    }
  },
};

canvas.addEventListener('pointermove', (e) => input.move(e.clientX, e.clientY));
canvas.addEventListener('pointerdown', (e) => input.down(e.clientX, e.clientY));
window.addEventListener('pointerup', (e) => pointerDown && input.up(e.clientX, e.clientY));

const gesture = new GestureInput({
  video: document.getElementById('cam'),
  overlay: document.getElementById('cam-overlay'),
  input,
  onStatus: (msg) => ui.say(msg),
});

const helmetBtn = document.getElementById('btn-helmet');
const gestureBtn = document.getElementById('btn-gesture');
helmetBtn.onclick = () => helmetBtn.classList.toggle('active', hud.toggleHelmet());
gestureBtn.onclick = async () => {
  const on = await gesture.toggle();
  gestureBtn.classList.toggle('active', on);
  document.body.classList.toggle('gesture', on);
};
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'h' || e.key === 'H') helmetBtn.click();
  if (e.key === 'g' || e.key === 'G') gestureBtn.click();
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= scenes.length) activate(n - 1);
  active.key?.(e);
});

// ---------- 尺寸 / 主循环 ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

const startIdx = Math.max(0, scenes.findIndex((s) => `#${s.id}` === location.hash));
activate(startIdx);

const clock = new THREE.Clock();
let fps = 60;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  holoTime.value = t;
  controls.update();
  active.update(t, dt);
  composer.render();
  labelRenderer.render(active.scene, camera);
  hud.draw(t, {
    fps,
    targets: active.hudTargets?.() || [],
    telemetry: active.telemetry?.() || [],
    gesture: gesture.state,
  });
});

// 便于调试
window.__holo = { scenes, activate, camera, controls };
