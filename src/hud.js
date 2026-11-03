// 2D HUD 叠加层：把 3D 场景中的目标投影到屏幕，与界面信息融合
import * as THREE from 'three';

const CYAN = '95,243,255';
const ORANGE = '255,173,59';

export class Hud {
  constructor(canvas, camera) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.camera = camera;
    this.cursor = new THREE.Vector2(-999, -999);
    this.helmet = false;
    this.sceneName = '';
    this.pulses = [];
    this._v = new THREE.Vector3();
    this.dpr = 1;
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.c.width = w * this.dpr;
    this.c.height = h * this.dpr;
    this.w = w; this.h = h;
  }

  setScene(name) { this.sceneName = name; this.sceneT = performance.now(); }
  toggleHelmet() { this.helmet = !this.helmet; return this.helmet; }
  pulse(x, y) { this.pulses.push({ x, y, t: performance.now() }); }

  project(p) {
    const v = this._v.copy(p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, behind: v.z > 1 };
  }

  draw(t, { fps, targets, telemetry, gesture }) {
    const g = this.g, w = this.w, h = this.h;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.font = '11px Rajdhani, "PingFang SC", sans-serif';
    g.lineWidth = 1;

    if (this.helmet) this.drawHelmet(t, fps);

    // 屏幕四角括号
    g.strokeStyle = `rgba(${CYAN},.45)`;
    const m = 14, L = 28;
    [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      g.beginPath(); g.moveTo(x, y + L * sy); g.lineTo(x, y); g.lineTo(x + L * sx, y); g.stroke();
    });

    // 遥测文字（右上）
    g.fillStyle = `rgba(${CYAN},.75)`;
    g.textAlign = 'right';
    const lines = [
      `${new Date().toLocaleTimeString('zh-CN', { hour12: false })}  //  ${fps.toFixed(0)} FPS`,
      `MODE: ${this.helmet ? 'HELMET-HUD' : 'WORKSHOP'}  ${gesture?.active ? '/ GESTURE ✓' : ''}`,
      ...telemetry,
    ];
    lines.forEach((s, i) => g.fillText(s, w - 22, 74 + i * 15));
    g.textAlign = 'left';

    // 场景切换时的扫描线
    const st = (performance.now() - this.sceneT) / 900;
    if (st < 1) {
      const y = st * h;
      const grd = g.createLinearGradient(0, y - 60, 0, y);
      grd.addColorStop(0, `rgba(${CYAN},0)`);
      grd.addColorStop(1, `rgba(${CYAN},.25)`);
      g.fillStyle = grd; g.fillRect(0, y - 60, w, 60);
      g.fillStyle = `rgba(${CYAN},.9)`; g.fillRect(0, y, w, 1);
    }

    // 目标锁定框
    for (const tg of targets) {
      const p = this.project(tg.position);
      if (p.behind || p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) continue;
      this.drawLock(p.x, p.y, t, tg);
    }

    // 光标准星
    const { x: cx, y: cy } = this.cursor;
    if (cx > -100) {
      g.save(); g.translate(cx, cy);
      g.strokeStyle = gesture?.pinch ? `rgba(${ORANGE},.95)` : `rgba(${CYAN},.8)`;
      g.rotate(t * 1.5);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, 16, i * 2.094, i * 2.094 + 1.3); g.stroke(); }
      g.rotate(-t * 3.2);
      g.setLineDash([2, 4]); g.beginPath(); g.arc(0, 0, 24, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.restore();
      g.fillStyle = g.strokeStyle; g.fillRect(cx - 1, cy - 1, 2, 2);
    }

    // 点击脉冲
    const now = performance.now();
    this.pulses = this.pulses.filter((p) => now - p.t < 600);
    for (const p of this.pulses) {
      const k = (now - p.t) / 600;
      g.strokeStyle = `rgba(${CYAN},${1 - k})`;
      g.beginPath(); g.arc(p.x, p.y, 10 + k * 50, 0, Math.PI * 2); g.stroke();
    }
  }

  drawLock(x, y, t, tg) {
    const g = this.g;
    const col = tg.color === 'orange' ? ORANGE : tg.color === 'red' ? '255,77,77' : CYAN;
    const r = tg.locked ? 26 + Math.sin(t * 6) * 2 : 18;
    g.save(); g.translate(x, y);
    g.strokeStyle = `rgba(${col},.95)`;
    g.lineWidth = tg.locked ? 1.6 : 1;
    if (tg.locked) g.rotate(t * 0.8);
    // 四段角括号
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.moveTo(r, r - 8); g.lineTo(r, r); g.lineTo(r - 8, r); g.stroke();
    }
    if (tg.locked) {
      g.beginPath(); g.arc(0, 0, r + 8, 0, Math.PI * 0.6); g.stroke();
      g.beginPath(); g.arc(0, 0, r + 8, Math.PI, Math.PI * 1.6); g.stroke();
    }
    g.restore();
    if (tg.label) {
      g.strokeStyle = `rgba(${col},.6)`;
      g.beginPath(); g.moveTo(x + r, y - r); g.lineTo(x + r + 24, y - r - 18); g.lineTo(x + r + 110, y - r - 18); g.stroke();
      g.fillStyle = `rgba(${col},1)`;
      g.fillText(tg.label, x + r + 28, y - r - 22);
      if (tg.sub) { g.fillStyle = `rgba(${col},.65)`; g.fillText(tg.sub, x + r + 28, y - r - 6); }
    }
  }

  // 头盔内视角：弧形边框、地平线、左右仪表、暗角
  drawHelmet(t, fps) {
    const g = this.g, w = this.w, h = this.h, cx = w / 2, cy = h / 2;
    const vg = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,8,14,.85)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);

    g.strokeStyle = `rgba(${CYAN},.35)`;
    // 视野弧
    g.beginPath(); g.ellipse(cx, cy, w * 0.46, h * 0.44, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, w * 0.46, h * 0.44, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();

    // 地平线（随相机俯仰/滚转变化）
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    const hy = cy + pitch * h * 0.9;
    g.save(); g.translate(cx, hy);
    g.strokeStyle = `rgba(${CYAN},.5)`;
    g.beginPath(); g.moveTo(-180, 0); g.lineTo(-40, 0); g.moveTo(40, 0); g.lineTo(180, 0); g.stroke();
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      g.beginPath(); g.moveTo(-60, i * 40); g.lineTo(60, i * 40); g.globalAlpha = 0.35; g.stroke(); g.globalAlpha = 1;
    }
    g.restore();

    // 中心十字
    g.strokeStyle = `rgba(${CYAN},.7)`;
    g.beginPath(); g.moveTo(cx - 12, cy); g.lineTo(cx - 4, cy); g.moveTo(cx + 4, cy); g.lineTo(cx + 12, cy);
    g.moveTo(cx, cy - 12); g.lineTo(cx, cy - 4); g.moveTo(cx, cy + 4); g.lineTo(cx, cy + 12); g.stroke();

    // 顶部罗盘
    const yaw = Math.atan2(dir.x, dir.z);
    g.save(); g.beginPath(); g.rect(cx - 200, 58, 400, 26); g.clip();
    g.fillStyle = `rgba(${CYAN},.8)`; g.textAlign = 'center';
    for (let d = -180; d <= 540; d += 15) {
      const x = cx + (d - (yaw * 180) / Math.PI) * 4;
      g.fillRect(x, 60, 1, d % 45 === 0 ? 10 : 5);
      if (d % 45 === 0) g.fillText(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][((d / 45) % 8 + 8) % 8], x, 82);
    }
    g.restore(); g.textAlign = 'left';

    // 左侧：能量 / 右侧：系统
    const bars = [['ARC', 0.82 + Math.sin(t) * 0.05], ['THR', 0.4 + Math.sin(t * 0.7) * 0.2], ['ARM', 0.93], ['O₂', 0.71]];
    bars.forEach(([k, v], i) => {
      const x = Math.max(340, cx - w * 0.36), y = h * 0.35 + i * 34;
      g.fillStyle = `rgba(${CYAN},.8)`; g.fillText(k, x, y - 4);
      g.strokeStyle = `rgba(${CYAN},.4)`; g.strokeRect(x, y, 120, 8);
      g.fillStyle = v > 0.5 ? `rgba(${CYAN},.8)` : `rgba(${ORANGE},.9)`; g.fillRect(x + 1, y + 1, 118 * v, 6);
    });
    g.textAlign = 'right';
    ['ALT  0412 m', `SPD  ${(320 + Math.sin(t) * 12).toFixed(0)} km/h`, 'TEMP 36.8°C', 'SYS  NOMINAL'].forEach((s, i) => {
      g.fillStyle = `rgba(${CYAN},.8)`; g.fillText(s, w - 40, h * 0.62 + i * 16);
    });
    g.textAlign = 'left';
  }
}
