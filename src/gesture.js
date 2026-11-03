// 摄像头手势输入（MediaPipe Hand Landmarker），把手势翻译成统一的输入事件
//  - 单手食指：光标
//  - 单手拇指+食指捏合：按下 / 抓取 / 拖动（空捏拖动 = 旋转视角）
//  - 双手同时捏合并拉开/靠拢：展开（爆炸视图）/ 缩放
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class GestureInput {
  constructor({ video, overlay, input, onStatus }) {
    this.video = video;
    this.overlay = overlay;
    this.input = input;
    this.onStatus = onStatus;
    this.state = { active: false, pinch: false };
    this.landmarker = null;
    this.cursor = null;
    this.pinched = false;
    this.spreadPrev = null;
  }

  async toggle() {
    if (this.state.active) { this.stop(); return false; }
    try {
      this.onStatus('正在初始化手势识别模型……');
      if (!this.landmarker) {
        const { FilesetResolver, HandLandmarker } = await import(/* @vite-ignore */ `${VISION}/vision_bundle.mjs`);
        const fileset = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      }
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.overlay.width = this.video.videoWidth;
      this.overlay.height = this.video.videoHeight;
      this.state.active = true;
      this.onStatus('手势已接管。食指移动光标，捏合抓取/旋转，双手捏合后拉开可展开模型。');
      this.loop();
      return true;
    } catch (err) {
      console.error(err);
      this.onStatus(`手势模块不可用：${err.message || err}。已回退到鼠标操作。`);
      this.stop();
      return false;
    }
  }

  stop() {
    this.state.active = false;
    if (this.pinched) { this.pinched = false; this.input.up(this.cursor?.x ?? 0, this.cursor?.y ?? 0); }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  loop() {
    if (!this.state.active) return;
    if (this.video.readyState >= 2) {
      const res = this.landmarker.detectForVideo(this.video, performance.now());
      this.handle(res.landmarks || []);
      this.drawOverlay(res.landmarks || []);
    }
    requestAnimationFrame(() => this.loop());
  }

  handle(hands) {
    const W = window.innerWidth, H = window.innerHeight;
    const isPinch = (lm, was) => d(lm[4], lm[8]) / Math.max(d(lm[0], lm[9]), 1e-3) < (was ? 0.5 : 0.35);

    if (hands.length === 2) {
      // 双手：结束单手操作，进入张合模式
      if (this.pinched) { this.pinched = false; this.input.up(this.cursor.x, this.cursor.y); }
      const both = isPinch(hands[0], this.spreadPrev != null) && isPinch(hands[1], this.spreadPrev != null);
      const dist = d(hands[0][9], hands[1][9]);
      if (both) {
        if (this.spreadPrev != null) this.input.spread(dist - this.spreadPrev);
        this.spreadPrev = dist;
      } else this.spreadPrev = null;
      this.state.pinch = both;
      return;
    }
    this.spreadPrev = null;
    if (!hands.length) {
      if (this.pinched) { this.pinched = false; this.input.up(this.cursor.x, this.cursor.y); }
      this.state.pinch = false;
      return;
    }

    const lm = hands[0];
    // 镜像 + 平滑 + 中间区域映射到全屏（手不必伸到画面边缘）
    const rx = (1 - (lm[8].x + lm[4].x) / 2 - 0.15) / 0.7;
    const ry = ((lm[8].y + lm[4].y) / 2 - 0.15) / 0.7;
    const tx = Math.min(Math.max(rx, 0), 1) * W, ty = Math.min(Math.max(ry, 0), 1) * H;
    const prev = this.cursor || { x: tx, y: ty };
    this.cursor = { x: prev.x + (tx - prev.x) * 0.35, y: prev.y + (ty - prev.y) * 0.35 };
    const { x, y } = this.cursor;

    const p = isPinch(lm, this.pinched);
    if (p && !this.pinched) { this.pinched = true; this.input.down(x, y); }
    else if (!p && this.pinched) { this.pinched = false; this.input.up(x, y); }
    if (this.pinched) this.input.orbit((x - prev.x) / W, (y - prev.y) / H);
    this.input.move(x, y);
    this.state.pinch = this.pinched;
  }

  drawOverlay(hands) {
    const g = this.overlay.getContext('2d');
    const w = this.overlay.width, h = this.overlay.height;
    g.clearRect(0, 0, w, h);
    g.lineWidth = 2;
    for (const lm of hands) {
      g.strokeStyle = this.state.pinch ? '#ffad3b' : '#5ff3ff';
      for (const [a, b] of CONNECTIONS) {
        g.beginPath(); g.moveTo(lm[a].x * w, lm[a].y * h); g.lineTo(lm[b].x * w, lm[b].y * h); g.stroke();
      }
      g.fillStyle = '#fff';
      for (const p of lm) g.fillRect(p.x * w - 2, p.y * h - 2, 4, 4);
    }
  }
}
