// 小型 DOM 帮助函数：为每个场景构建控制面板
export function panel(...children) {
  const el = document.createElement('div');
  el.style.display = 'contents';
  children.flat().forEach((c) => c && el.appendChild(c));
  return el;
}

export function row(...children) {
  const el = document.createElement('div');
  el.className = 'row';
  children.forEach((c) => el.appendChild(c));
  return el;
}

export function button(text, onClick, cls = '') {
  const b = document.createElement('button');
  b.textContent = text;
  if (cls) b.className = cls;
  b.onclick = onClick;
  return b;
}

export function slider(text, { min = 0, max = 1, step = 0.01, value = 0 }, onInput) {
  const label = document.createElement('label');
  const span = document.createElement('span');
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min, max, step, value });
  const sync = () => { span.textContent = `${text}：${typeof text === 'string' ? fmt(+input.value) : ''}`; };
  const fmt = (v) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(0));
  input.addEventListener('input', () => { sync(); onInput(+input.value); });
  label.append(span, input);
  sync();
  label.set = (v) => { input.value = v; sync(); };
  return label;
}

export function note(html) {
  const p = document.createElement('div');
  p.style.cssText = 'font-size:12px;opacity:.75;line-height:1.6';
  p.innerHTML = html;
  return p;
}
