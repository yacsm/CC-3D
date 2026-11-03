// 场景 1：工作室全息装甲 —— 爆炸视图 / 手势抓取 / 扔进回收区 / 召唤组装
// 灵感：主角在车库用双手把全息战甲"拉开"成零件，抓起不要的零件随手扔掉。
import * as THREE from 'three';
import { holoMaterial, edgeLines, holoGrid, COLORS, rng, ease } from '../holo.js';
import { panel, row, button, slider, note } from '../ui.js';

const CENTER = new THREE.Vector3(0, 1.0, 0);
const DISCARD_R = 2.4;

function partDefs() {
  const defs = [];
  const add = (name, geo, pos, o = {}) => defs.push({ name, geo, pos: new THREE.Vector3(...pos), ...o });
  const mirror = (name, geoFn, [x, y, z], o = {}) => {
    add(`左${name}`, geoFn(), [-x, y, z], o);
    add(`右${name}`, geoFn(), [x, y, z], o);
  };
  add('头盔', new THREE.SphereGeometry(0.2, 20, 14), [0, 1.74, 0], { scale: [0.9, 1.15, 1.0], spec: '头部 / 传感阵列' });
  add('面甲', new THREE.CylinderGeometry(0.15, 0.11, 0.24, 10, 1, true, -1.2, 2.4), [0, 1.72, 0.06], { spec: '可开合面罩 / 光学 HUD' });
  add('胸甲', new THREE.CylinderGeometry(0.34, 0.26, 0.46, 12), [0, 1.36, 0], { scale: [1, 1, 0.62], spec: '主装甲 / 方舟反应堆舱' });
  add('反应堆', new THREE.TorusGeometry(0.065, 0.018, 10, 28), [0, 1.4, 0.17], { glow: true, spec: '能量核心 / 3 GJ/s' });
  add('腹甲', new THREE.CylinderGeometry(0.24, 0.22, 0.24, 10), [0, 1.04, 0], { scale: [1, 1, 0.62], spec: '分段腹甲 / 柔性关节' });
  add('骨盆', new THREE.CylinderGeometry(0.23, 0.18, 0.18, 10), [0, 0.85, 0], { scale: [1, 1, 0.7], spec: '髋部 / 姿态稳定器' });
  add('背部推进器', new THREE.BoxGeometry(0.34, 0.36, 0.1), [0, 1.36, -0.2], { spec: '襟翼 / 辅助推力' });
  mirror('肩甲', () => new THREE.SphereGeometry(0.13, 14, 10), [0.43, 1.52, 0], { spec: '肩部 / 微型导弹舱' });
  mirror('上臂', () => new THREE.CylinderGeometry(0.075, 0.07, 0.3, 10), [0.48, 1.27, 0], { spec: '上臂伺服' });
  mirror('前臂', () => new THREE.CylinderGeometry(0.08, 0.065, 0.3, 10), [0.5, 0.93, 0], { spec: '前臂 / 激光' });
  mirror('手甲', () => new THREE.BoxGeometry(0.1, 0.15, 0.06), [0.51, 0.7, 0.01], { spec: '掌心冲击炮' });
  mirror('大腿', () => new THREE.CylinderGeometry(0.11, 0.085, 0.4, 10), [0.14, 0.58, 0], { spec: '大腿 / 液压' });
  mirror('小腿', () => new THREE.CylinderGeometry(0.085, 0.07, 0.38, 10), [0.14, 0.2, 0], { spec: '小腿 / 稳定翼' });
  mirror('战靴', () => new THREE.BoxGeometry(0.13, 0.08, 0.24), [0.14, -0.02, 0.03], { spec: '足底推进器' });
  return defs;
}

export function createArmorScene({ camera, ui, hud }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02070c, 0.06);
  const rand = rng(42);

  // 工作台：网格、底座环、回收边界
  scene.add(holoGrid(16, 64, 0x5ff3ff, 0.12));
  const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const [r, w] of [[0.6, 0.01], [0.9, 0.02], [1.0, 0.005]]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 96), ringMat);
    m.rotation.x = -Math.PI / 2; m.position.y = -0.06;
    scene.add(m);
  }
  const discardRing = new THREE.Mesh(new THREE.RingGeometry(DISCARD_R, DISCARD_R + 0.02, 128),
    new THREE.MeshBasicMaterial({ color: COLORS.orange, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  discardRing.rotation.x = -Math.PI / 2; discardRing.position.y = -0.05;
  scene.add(discardRing);

  // 扫描环：自下而上扫过装甲
  const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.58, 96),
    new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  scanRing.rotation.x = -Math.PI / 2;
  scene.add(scanRing);

  // 构建零件
  const parts = partDefs().map((d, i) => {
    const group = new THREE.Group();
    const mat = holoMaterial({ color: d.glow ? COLORS.white : COLORS.cyan, opacity: d.glow ? 1.6 : 0.4 });
    const mesh = new THREE.Mesh(d.geo, mat);
    if (d.scale) mesh.scale.set(...d.scale);
    const edges = edgeLines(d.geo, d.glow ? COLORS.white : COLORS.cyan, 0.5);
    edges.scale.copy(mesh.scale);
    group.add(mesh, edges);
    group.position.copy(d.pos);
    scene.add(group);
    const dir = d.pos.clone().sub(CENTER); dir.y *= 0.55;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    if (d.name === '反应堆' || d.name === '面甲') dir.set(0, 0.1, 1);
    if (d.name === '背部推进器') dir.set(0, 0.1, -1);
    dir.normalize();
    const exploded = d.pos.clone().addScaledVector(dir, 0.55 + rand() * 0.45);
    exploded.y += (rand() - 0.5) * 0.3;
    mesh.userData.part = i;
    return {
      ...d, group, mesh, edges, mat, exploded, index: i,
      integrity: 70 + Math.floor(rand() * 30), mass: (0.6 + rand() * 4).toFixed(2),
      state: 'idle', vel: new THREE.Vector3(), fly: null,
    };
  });
  const meshes = parts.map((p) => p.mesh);

  let explode = 0, explodeTarget = 0, hovered = null, selected = null, dragging = null, discarded = 0, now = 0;
  const dragPlane = new THREE.Plane();
  const dragOffset = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const explodeSlider = slider('展开程度', { value: 0 }, (v) => { explodeTarget = v; });
  const ctl = panel(
    explodeSlider,
    row(
      button('展开', () => setExplode(1)),
      button('合拢', () => setExplode(0)),
      button('召唤组装', () => summon(), 'warn'),
    ),
    row(button('恢复丢弃零件', () => restore())),
    note('• 拖动空白处旋转，滚轮缩放<br>• 点击零件查看参数并锁定<br>• <b>拖动零件</b>到橙色圈外松手 = 丢弃（"不要这个了"）<br>• 手势模式：双手捏合后拉开 = 展开'),
  );

  function setExplode(v) { explodeTarget = v; explodeSlider.set(v); ui.say(v ? '展开结构视图，共 ' + parts.length + ' 个组件。' : '合拢。'); }

  function select(p) {
    if (selected) selected.mat.uniforms.uHighlight.value = 0;
    selected = p;
    if (!p) { ui.inspect(null); return; }
    p.mat.uniforms.uHighlight.value = 1;
    ui.inspect(p.name, [['功能', p.spec], ['材料', '金钛合金'], ['质量', `${p.mass} kg`], ['完整度', `${p.integrity}%`], ['编号', `MK-P${String(p.index).padStart(3, '0')}`]]);
    ui.say(`${p.name}：${p.spec}，完整度 ${p.integrity}%。`);
  }

  function summon() {
    parts.forEach((p, i) => {
      if (p.state === 'gone') return;
      const from = new THREE.Vector3((rand() - 0.5) * 14, 2 + rand() * 4, (rand() - 0.5) * 14);
      p.fly = { from, start: now + 0.15 + i * 0.07 };
      p.group.position.copy(from);
    });
    setExplode(0);
    ui.say('收到。装甲组件正在飞来，逐一锁定到位。');
  }

  function restore() {
    parts.forEach((p) => {
      if (p.state !== 'gone' && p.state !== 'discard') return;
      p.state = 'idle'; p.group.visible = true; p.mat.uniforms.uOpacity.value = 0.4; p.edges.material.opacity = 0.5;
      p.fly = { from: p.group.position.clone().set(0, 6, 0), start: now };
    });
    discarded = 0;
    ui.say('已从回收区恢复全部零件。');
  }

  function partAt(raycaster) {
    const hit = raycaster.intersectObjects(meshes, false).find((h) => parts[h.object.userData.part].state === 'idle');
    return hit ? { part: parts[hit.object.userData.part], point: hit.point } : null;
  }

  return {
    id: 'armor', title: '装甲工作台', scene,
    subtitle: '用手把全息模型"拉开"成零件、抓取、旋转、甩掉 —— 把 CAD 变成可以徒手操作的实体。',
    hint: '拖动零件到橙圈外=丢弃 · H 头盔HUD · G 手势 · 1-4 切换场景',
    cameraPos: new THREE.Vector3(2.4, 1.8, 3.2), target: new THREE.Vector3(0, 0.95, 0),
    minDistance: 1, maxDistance: 12, bloom: 0.75,
    panel: ctl,
    enter() { ui.say('欢迎回来。装甲全息模型已加载，可以开始拆解。'); },

    hover(raycaster) {
      const h = partAt(raycaster);
      const p = h?.part || null;
      if (hovered && hovered !== selected) hovered.mat.uniforms.uHighlight.value = 0;
      hovered = p;
      if (p && p !== selected) p.mat.uniforms.uHighlight.value = 0.45;
      document.body.style.cursor = p ? 'grab' : '';
    },
    pointerDown(raycaster) {
      const h = partAt(raycaster);
      if (!h) return false;
      dragging = h.part;
      dragging.state = 'drag';
      select(dragging);
      camera.getWorldDirection(tmp);
      dragPlane.setFromNormalAndCoplanarPoint(tmp, h.point);
      dragOffset.copy(h.point).sub(dragging.group.position);
      document.body.style.cursor = 'grabbing';
      return true;
    },
    pointerMove(raycaster) {
      if (!dragging) return;
      if (raycaster.ray.intersectPlane(dragPlane, tmp)) dragging.group.position.copy(tmp.sub(dragOffset));
      dragging.moved = true;
      const out = Math.hypot(dragging.group.position.x, dragging.group.position.z) > DISCARD_R;
      discardRing.material.opacity = out ? 0.9 : 0.25;
      dragging.mat.uniforms.uColor.value.copy(out ? COLORS.red : COLORS.cyan);
    },
    pointerUp() {
      if (!dragging) return;
      const p = dragging; dragging = null;
      document.body.style.cursor = '';
      discardRing.material.opacity = 0.25;
      p.mat.uniforms.uColor.value.copy(COLORS.cyan);
      if (Math.hypot(p.group.position.x, p.group.position.z) > DISCARD_R) {
        p.state = 'discard';
        p.vel.copy(p.group.position).setY(0).normalize().multiplyScalar(6).setY(2.5);
        discarded++;
        if (selected === p) select(null);
        ui.say(`${p.name} 已丢弃。已丢弃 ${discarded} 个组件。`);
      } else {
        p.state = 'idle';
        if (p.moved) ui.say(`${p.name} 磁吸归位。`);
        p.moved = false;
      }
    },
    click(raycaster) {
      const h = partAt(raycaster);
      select(h?.part || null);
    },
    spread(delta) {
      explodeTarget = THREE.MathUtils.clamp(explodeTarget + delta * 4, 0, 1);
      explodeSlider.set(explodeTarget);
    },

    update(t, dt) {
      now = t;
      explode += (explodeTarget - explode) * (1 - Math.exp(-dt * 5));
      const k = 1 - Math.exp(-dt * 10);
      scanRing.position.y = 0.9 + Math.sin(t * 0.8) * 0.95;
      scanRing.scale.setScalar(1 + explode * 0.8);
      for (const p of parts) {
        if (p.state === 'discard') {
          p.vel.y -= 9.8 * dt;
          p.group.position.addScaledVector(p.vel, dt);
          p.group.rotation.x += dt * 6; p.group.rotation.z += dt * 4;
          p.mat.uniforms.uOpacity.value *= 0.93;
          p.edges.material.opacity *= 0.93;
          if (p.mat.uniforms.uOpacity.value < 0.02) { p.state = 'gone'; p.group.visible = false; }
          continue;
        }
        if (p.state !== 'idle') continue;
        tmp.copy(p.pos).lerp(p.exploded, explode);
        if (p.fly) {
          const f = THREE.MathUtils.clamp((t - p.fly.start) / 0.9, 0, 1);
          if (t < p.fly.start) { p.group.position.copy(p.fly.from); continue; }
          p.group.position.copy(p.fly.from).lerp(tmp, ease.outCubic(f));
          p.group.rotation.set((1 - f) * 6, (1 - f) * 8, 0);
          if (f >= 1) p.fly = null;
          continue;
        }
        p.group.position.lerp(tmp, k);
        p.group.rotation.x *= 0.9; p.group.rotation.z *= 0.9;
        p.group.rotation.y = explode * Math.sin(t * 0.6 + p.index) * 0.35;
      }
      // 反应堆呼吸光
      const core = parts.find((p) => p.name === '反应堆');
      core.mat.uniforms.uOpacity.value = 1.4 + Math.sin(t * 3) * 0.3;
    },

    hudTargets() {
      const out = [];
      if (selected && selected.state !== 'gone') {
        out.push({ position: selected.group.getWorldPosition(new THREE.Vector3()), label: selected.name, sub: `INTEGRITY ${selected.integrity}%`, locked: true, color: 'orange' });
      }
      if (hovered && hovered !== selected) out.push({ position: hovered.group.getWorldPosition(new THREE.Vector3()), label: hovered.name });
      return out;
    },
    telemetry() {
      return [`PARTS ${parts.filter((p) => p.state !== 'gone').length}/${parts.length}`, `EXPLODE ${(explode * 100).toFixed(0)}%`, `DISCARDED ${discarded}`];
    },
  };
}
