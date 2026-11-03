// 共享的全息材质：菲涅尔边缘光 + 扫描线 + 高亮
import * as THREE from 'three';

export const holoTime = { value: 0 };

export const COLORS = {
  cyan: new THREE.Color(0x5ff3ff),
  orange: new THREE.Color(0xffad3b),
  red: new THREE.Color(0xff4d4d),
  white: new THREE.Color(0xffffff),
};

export function holoMaterial({ color = COLORS.cyan, opacity = 0.7, power = 2.2, scan = 60 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: holoTime,
      uColor: { value: color.clone() },
      uOpacity: { value: opacity },
      uPower: { value: power },
      uScan: { value: scan },
      uHighlight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = wp.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity, uPower, uScan, uTime, uHighlight;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        float s = 0.5 + 0.5 * sin(vY * uScan - uTime * 3.0);
        float a = (0.06 + f * 0.95 + s * 0.05) * uOpacity * (1.0 + uHighlight * 1.5);
        vec3 c = mix(uColor, vec3(1.0, 0.68, 0.23), uHighlight * 0.85) * (1.0 + f * 0.6);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function edgeLines(geometry, color = COLORS.cyan, opacity = 0.55, threshold = 20) {
  const g = new THREE.EdgesGeometry(geometry, threshold);
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  return new THREE.LineSegments(g, m);
}

/** 带网格的全息地面 */
export function holoGrid(size = 20, divisions = 40, color = 0x5ff3ff, opacity = 0.18) {
  const grid = new THREE.GridHelper(size, divisions, color, color);
  grid.material.transparent = true;
  grid.material.opacity = opacity;
  grid.material.depthWrite = false;
  grid.material.blending = THREE.AdditiveBlending;
  return grid;
}

/** 软圆点精灵纹理（点云用） */
let _dot;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}

/** 可复现的伪随机数 */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
