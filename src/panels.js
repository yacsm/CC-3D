// 悬浮视图框架：每个视图是空中的一块全息面板
//  - 内容由 Canvas 2D 绘制（图表 / 列表 / 标注），可选叠加一个 RenderTarget（另一台相机的实时画面）
//  - 射线命中 → uv → 面板像素坐标，交给视图自己处理（悬停 / 点击 / 拖拽刷选）
//  - 标题栏可拖动面板在空间中移动；右上角 ⤢ 聚焦到该面板
import * as THREE from 'three';

export const TITLE_H = 0.36;     // 标题栏高度（世界单位）
const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';

export class FloatPanel {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {string} o.title
   * @param {number} o.w   世界宽度
   * @param {number} o.h   世界高度
   * @param {THREE.Vector3} o.pos
   * @param {THREE.WebGLRenderTarget} [o.rt]  内容区底图
   * @param {(g:CanvasRenderingContext2D, p:FloatPanel)=>void} o.draw
   * @param {(type:string, x:number, y:number, p:FloatPanel)=>void} [o.onPointer]
   * @param {(id:any, p:FloatPanel)=>{x:number,y:number}|null} [o.anchor]  某条数据在本视图中的像素位置
   */
  constructor(o) {
    Object.assign(this, o);
    this.res = o.res || 220;
    this.cw = Math.round(o.w * this.res);
    this.ch = Math.round(o.h * this.res);
    this.titlePx = Math.round(TITLE_H * this.res);
    this.content = { x: 0, y: this.titlePx, w: this.cw, h: this.ch - this.titlePx };
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.base = o.pos.clone();
    this.phase = Math.random() * 6;
    this.active = 0;   // 悬停 / 联动时的边框高亮

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tOverlay: { value: this.tex },
        tRT: { value: o.rt ? o.rt.texture : null },
        uHasRT: { value: o.rt ? 1 : 0 },
        uContent: { value: (o.h - TITLE_H) / o.h },
        uActive: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tOverlay, tRT; uniform float uHasRT, uContent, uActive; varying vec2 vUv;
        void main(){
          vec4 o = texture2D(tOverlay, vUv);
          vec3 base = vec3(0.004, 0.03, 0.045);
          float a = 0.62;
          if (uHasRT > 0.5 && vUv.y < uContent) {
            base += texture2D(tRT, vec2(vUv.x, vUv.y / uContent)).rgb * 0.9;
            a = 0.9;
          }
          float scan = 0.96 + 0.04 * sin(vUv.y * 600.);
          vec3 c = mix(base, o.rgb, o.a) * scan;
          gl_FragColor = vec4(c * 0.85, max(a, o.a) * (0.92 + uActive * 0.08));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), this.material);
    this.mesh.userData.panel = this;
    this.mesh.renderOrder = 10;

    // 外框
    const fr = new THREE.EdgesGeometry(new THREE.PlaneGeometry(o.w + 0.04, o.h + 0.04));
    this.frame = new THREE.LineSegments(fr, new THREE.LineBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.frame);
    this.group.position.copy(this.base);

    // 落地投影光束：强调"悬浮"
    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.beam = new THREE.Line(beamGeo, new THREE.LineDashedMaterial({ color: 0x5ff3ff, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.35, depthWrite: false }));
    this.foot = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.22, 40), new THREE.MeshBasicMaterial({ color: 0x5ff3ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.foot.rotation.x = -Math.PI / 2;
  }

  addTo(parent) { parent.add(this.group, this.beam, this.foot); }

  /** 面板像素坐标 → 世界坐标 */
  worldOf(x, y, out = new THREE.Vector3()) {
    out.set((x / this.cw - 0.5) * this.w, (0.5 - y / this.ch) * this.h, 0.01);
    return this.mesh.localToWorld(out);
  }

  uvToPx(uv) { return { x: uv.x * this.cw, y: (1 - uv.y) * this.ch }; }

  /** 命中区域：title / focus / content */
  zone(x, y) {
    if (y < this.titlePx) return x > this.cw - this.titlePx * 1.3 ? 'focus' : 'title';
    return 'content';
  }

  update(t, camera, face) {
    this.group.position.copy(this.base);
    this.group.position.y += Math.sin(t * 0.6 + this.phase) * 0.06;
    if (face) {
      // 绕竖直轴朝向观察者，保持文字可读
      const c = camera.position;
      this.group.rotation.set(0, Math.atan2(c.x - this.group.position.x, c.z - this.group.position.z), 0);
    }
    this.active += ((this.hot ? 1 : 0) - this.active) * 0.15;
    this.material.uniforms.uActive.value = this.active;
    this.frame.material.opacity = 0.45 + this.active * 0.5;
    this.frame.material.color.setHex(this.active > 0.5 ? 0xffad3b : 0x5ff3ff);
    const bottom = this.group.position.clone(); bottom.y -= this.h / 2;
    const p = this.beam.geometry.attributes.position;
    p.setXYZ(0, bottom.x, bottom.y, bottom.z); p.setXYZ(1, bottom.x, 0.01, bottom.z); p.needsUpdate = true;
    this.beam.computeLineDistances();
    this.foot.position.set(bottom.x, 0.02, bottom.z);
  }

  redraw() {
    const g = this.g, w = this.cw, h = this.ch, th = this.titlePx;
    g.clearRect(0, 0, w, h);
    g.save();
    // 标题栏
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(95,243,255,.32)'); grd.addColorStop(1, 'rgba(95,243,255,.06)');
    g.fillStyle = grd; g.fillRect(0, 0, w, th);
    g.fillStyle = '#bff9ff';
    g.font = `600 ${Math.round(th * 0.46)}px ${FONT}`;
    g.textBaseline = 'middle';
    g.fillText(this.title, th * 0.45, th / 2);
    if (this.tag) {
      g.font = `${Math.round(th * 0.34)}px ${FONT}`;
      g.fillStyle = 'rgba(255,173,59,.95)';
      g.textAlign = 'right';
      g.fillText(this.tag, w - th * 1.5, th / 2);
      g.textAlign = 'left';
    }
    // 聚焦按钮 + 拖动手柄
    g.strokeStyle = '#bff9ff'; g.lineWidth = 2;
    const fx = w - th * 0.65, fy = th / 2, s = th * 0.2;
    g.strokeRect(fx - s, fy - s, s * 2, s * 2);
    g.fillStyle = 'rgba(191,249,255,.5)';
    for (let i = 0; i < 3; i++) g.fillRect(th * 0.15, th * 0.3 + i * th * 0.16, th * 0.14, th * 0.06);
    // 角括号
    g.strokeStyle = 'rgba(95,243,255,.9)'; g.lineWidth = 3;
    const L = th * 0.6;
    [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(([x, y, sx, sy]) => {
      g.beginPath(); g.moveTo(x, y + L * sy); g.lineTo(x, y); g.lineTo(x + L * sx, y); g.stroke();
    });
    g.restore();
    g.save();
    g.beginPath(); g.rect(0, th, w, h - th); g.clip();
    g.font = `${Math.round(this.res * 0.075)}px ${FONT}`;
    this.draw(g, this);
    g.restore();
    this.tex.needsUpdate = true;
  }
}

export { FONT };
