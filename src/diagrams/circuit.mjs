// Schematic DSL -> SVG string. Grid unit U = 20px. See docs/AUTHORING.md for the spec.
const U = 20;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f = n => Math.round(n * 100) / 100;
const COLORS = ['accent', 'red', 'blue', 'green', 'orange', 'purple', 'muted'];
const cls = (base, el) => base + (el && COLORS.includes(el.color) ? ` ck-c-${el.color}` : '') + (el && el.bold ? ' ck-bold' : '');

/** Rich label: supports X_{sub}, X_s (single char), X^{sup}. Returns tspans. */
export function richText(t) {
  t = String(t ?? '');
  let out = ''; let i = 0; let plain = '';
  const flush = () => { if (plain) { out += esc(plain); plain = ''; } };
  while (i < t.length) {
    const c = t[i];
    if ((c === '_' || c === '^') && i + 1 < t.length) {
      let content; let j;
      if (t[i + 1] === '{') { j = t.indexOf('}', i + 2); if (j < 0) j = t.length; content = t.slice(i + 2, j); i = j + 1; }
      else { const m = t.slice(i + 1).match(/^[A-Za-z0-9]+/); content = m ? m[0] : t[i + 1]; i += 1 + content.length; }
      flush();
      const dy = c === '_' ? '0.3em' : '-0.45em';
      const back = c === '_' ? '-0.3em' : '0.45em';
      out += `<tspan dy="${dy}" font-size="72%">${esc(content)}</tspan><tspan dy="${back}">​</tspan>`;
      continue;
    }
    plain += c; i++;
  }
  flush();
  return out;
}

function text(x, y, t, opts = {}) {
  const anchor = opts.anchor || 'middle';
  const size = opts.size || 13;
  const klass = opts.klass || 'ck-label';
  const lines = String(t).split('\n');
  return lines.map((ln, k) => `<text x="${f(x)}" y="${f(y + k * size * 1.2)}" text-anchor="${anchor}" font-size="${size}" class="${klass}" dominant-baseline="middle">${richText(ln)}</text>`).join('');
}

// ---------- two-terminal symbol bodies, drawn in local frame: centered at 0, axis along +x ----------
// Each returns { half: half-length of body in px, svg }
const BODIES = {
  R: () => {
    const h = 20, a = 7, n = 6; let d = `M ${-h} 0`;
    for (let k = 0; k < n; k++) { const x = -h + (k + 0.5) * (2 * h / n); d += ` L ${f(x)} ${k % 2 ? a : -a}`; }
    d += ` L ${h} 0`;
    return { half: h, svg: `<path d="${d}" class="ck-line"/>` };
  },
  Rbox: () => ({ half: 18, svg: `<rect x="-18" y="-7" width="36" height="14" class="ck-line" fill="none"/>` }),
  Z: () => ({ half: 18, svg: `<rect x="-18" y="-8" width="36" height="16" class="ck-line ck-fill-bg"/>` }),
  FB: () => ({ half: 14, svg: `<rect x="-14" y="-6" width="28" height="12" class="ck-line ck-fill-ink"/>` }),
  C: () => ({ half: 4, svg: `<line x1="-4" y1="-12" x2="-4" y2="12" class="ck-line"/><line x1="4" y1="-12" x2="4" y2="12" class="ck-line"/>` }),
  Cpol: () => ({ half: 5, svg: `<line x1="-5" y1="-12" x2="-5" y2="12" class="ck-line"/><path d="M 8 -12 Q 2 0 8 12" class="ck-line" fill="none"/><text x="-12" y="-12" font-size="12" class="ck-label" text-anchor="middle" dominant-baseline="middle">+</text>` }),
  L: () => {
    const h = 20; let d = `M ${-h} 0`;
    for (let k = 0; k < 4; k++) d += ` A 5 5 0 0 1 ${-h + (k + 1) * 10} 0`;
    return { half: h, svg: `<path d="${d}" class="ck-line" fill="none"/>` };
  },
  Lcore: () => {
    const h = 20; let d = `M ${-h} 0`;
    for (let k = 0; k < 4; k++) d += ` A 5 5 0 0 1 ${-h + (k + 1) * 10} 0`;
    return { half: h, svg: `<path d="${d}" class="ck-line" fill="none"/><line x1="-20" y1="-9" x2="20" y2="-9" class="ck-line"/><line x1="-20" y1="-12" x2="20" y2="-12" class="ck-line"/>` };
  },
  V: () => ({ half: 15, svg: `<circle r="15" class="ck-line ck-fill-bg"/><text x="-7" y="0" font-size="13" class="ck-label" text-anchor="middle" dominant-baseline="middle" transform-origin="-7 0">+</text><text x="7" y="0" font-size="14" class="ck-label" text-anchor="middle" dominant-baseline="middle">−</text>`, upright: [[-7, 0, '+'], [7, 0, '−']] }),
  Vac: () => ({ half: 15, svg: `<circle r="15" class="ck-line ck-fill-bg"/><path d="M -9 0 C -6 -10 -2 -10 0 0 C 2 10 6 10 9 0" class="ck-line" fill="none"/>` }),
  Vsq: () => ({ half: 15, svg: `<circle r="15" class="ck-line ck-fill-bg"/><path d="M -9 5 L -9 -5 L 0 -5 L 0 5 L 9 5 L 9 -5" class="ck-line" fill="none"/>` }),
  I: () => ({ half: 15, svg: `<circle r="15" class="ck-line ck-fill-bg"/><line x1="-9" y1="0" x2="7" y2="0" class="ck-line"/><path d="M 9 0 L 3 -4 L 3 4 Z" class="ck-fill-ink"/>` }),
  Vdep: () => ({ half: 15, svg: `<path d="M -15 0 L 0 -15 L 15 0 L 0 15 Z" class="ck-line ck-fill-bg"/>`, upright: [[-7, 0, '+'], [7, 0, '−']] }),
  Idep: () => ({ half: 15, svg: `<path d="M -15 0 L 0 -15 L 15 0 L 0 15 Z" class="ck-line ck-fill-bg"/><line x1="-8" y1="0" x2="6" y2="0" class="ck-line"/><path d="M 8 0 L 2 -4 L 2 4 Z" class="ck-fill-ink"/>` }),
  battery: () => ({ half: 9, svg: `<line x1="-9" y1="-14" x2="-9" y2="14" class="ck-line"/><line x1="-3" y1="-7" x2="-3" y2="7" class="ck-line ck-thick"/><line x1="3" y1="-14" x2="3" y2="14" class="ck-line"/><line x1="9" y1="-7" x2="9" y2="7" class="ck-line ck-thick"/>`, upright: [[-15, -14, '+']] }),
  cell: () => ({ half: 4, svg: `<line x1="-4" y1="-14" x2="-4" y2="14" class="ck-line"/><line x1="4" y1="-7" x2="4" y2="7" class="ck-line ck-thick"/>`, upright: [[-11, -14, '+']] }),
  D: () => ({ half: 9, svg: `<path d="M -9 -9 L -9 9 L 7 0 Z" class="ck-line ck-fill-bg"/><line x1="8" y1="-9" x2="8" y2="9" class="ck-line"/>` }),
  Zener: () => ({ half: 9, svg: `<path d="M -9 -9 L -9 9 L 7 0 Z" class="ck-line ck-fill-bg"/><path d="M 4 -11 L 8 -9 L 8 9 L 12 11" class="ck-line" fill="none"/>` }),
  Schottky: () => ({ half: 9, svg: `<path d="M -9 -9 L -9 9 L 7 0 Z" class="ck-line ck-fill-bg"/><path d="M 12 -6 L 12 -9 L 8 -9 L 8 9 L 4 9 L 4 6" class="ck-line" fill="none"/>` }),
  TVS: () => ({ half: 16, svg: `<path d="M -16 -9 L -16 9 L 0 0 Z" class="ck-line ck-fill-bg"/><path d="M 16 -9 L 16 9 L 0 0 Z" class="ck-line ck-fill-bg"/><path d="M -4 -11 L 0 -9 L 0 9 L 4 11" class="ck-line" fill="none"/>` }),
  LED: () => ({ half: 9, svg: `<path d="M -9 -9 L -9 9 L 7 0 Z" class="ck-line ck-fill-bg"/><line x1="8" y1="-9" x2="8" y2="9" class="ck-line"/><path d="M -1 -11 L 5 -19 M 5 -19 L 1 -18 M 5 -19 L 5 -15 M 5 -9 L 11 -17 M 11 -17 L 7 -16 M 11 -17 L 11 -13" class="ck-line ck-thin" fill="none"/>` }),
  photodiode: () => ({ half: 9, svg: `<path d="M -9 -9 L -9 9 L 7 0 Z" class="ck-line ck-fill-bg"/><line x1="8" y1="-9" x2="8" y2="9" class="ck-line"/><path d="M 5 -19 L -1 -11 M -1 -11 L 3 -12 M -1 -11 L -1 -15 M 11 -17 L 5 -9 M 5 -9 L 9 -10 M 5 -9 L 5 -13" class="ck-line ck-thin" fill="none"/>` }),
  SW: () => ({ half: 14, svg: `<circle cx="-12" cy="0" r="2.5" class="ck-line ck-fill-bg"/><circle cx="12" cy="0" r="2.5" class="ck-line ck-fill-bg"/><line x1="-10" y1="-1" x2="11" y2="-12" class="ck-line"/>` }),
  SWclosed: () => ({ half: 14, svg: `<circle cx="-12" cy="0" r="2.5" class="ck-line ck-fill-bg"/><circle cx="12" cy="0" r="2.5" class="ck-line ck-fill-bg"/><line x1="-10" y1="-1" x2="12" y2="-3" class="ck-line"/>` }),
  PB: () => ({ half: 14, svg: `<circle cx="-12" cy="0" r="2.5" class="ck-line ck-fill-bg"/><circle cx="12" cy="0" r="2.5" class="ck-line ck-fill-bg"/><line x1="-14" y1="-8" x2="14" y2="-8" class="ck-line"/><line x1="0" y1="-8" x2="0" y2="-16" class="ck-line"/><line x1="-6" y1="-16" x2="6" y2="-16" class="ck-line"/>` }),
  F: () => ({ half: 16, svg: `<rect x="-16" y="-6" width="32" height="12" class="ck-line ck-fill-bg"/><line x1="-16" y1="0" x2="16" y2="0" class="ck-line ck-thin"/>` }),
  lamp: () => ({ half: 12, svg: `<circle r="12" class="ck-line ck-fill-bg"/><path d="M -8.5 -8.5 L 8.5 8.5 M -8.5 8.5 L 8.5 -8.5" class="ck-line"/>` }),
  M: () => ({ half: 15, svg: `<circle r="15" class="ck-line ck-fill-bg"/>`, upright: [[0, 0, 'M']] }),
  A: () => ({ half: 13, svg: `<circle r="13" class="ck-line ck-fill-bg"/>`, upright: [[0, 0, 'A']] }),
  VM: () => ({ half: 13, svg: `<circle r="13" class="ck-line ck-fill-bg"/>`, upright: [[0, 0, 'V']] }),
  xtal: () => ({ half: 10, svg: `<line x1="-10" y1="-11" x2="-10" y2="11" class="ck-line"/><rect x="-6" y="-9" width="12" height="18" class="ck-line ck-fill-bg"/><line x1="10" y1="-11" x2="10" y2="11" class="ck-line"/>` }),
  pot: () => {
    const r = BODIES.R();
    return { half: r.half, svg: r.svg + `<line x1="0" y1="-22" x2="0" y2="-9" class="ck-line"/><path d="M 0 -8 L -4 -15 L 4 -15 Z" class="ck-fill-ink"/>` };
  },
  thermistor: () => {
    const r = BODIES.Rbox();
    return { half: r.half, svg: r.svg + `<path d="M -16 12 L -8 12 L 14 -12" class="ck-line ck-thin" fill="none"/>` };
  },
  open: () => ({ half: 0, svg: '' }),
};
export const TWO_TERMINAL = Object.keys(BODIES).filter(k => k !== 'open');

function twoTerminal(el) {
  const [ax, ay] = el.a.map(v => v * U); const [bx, by] = el.b.map(v => v * U);
  const dx = bx - ax, dy = by - ay; const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const body = BODIES[el.t](el);
  const half = Math.min(body.half, L / 2);
  const cx = (ax + bx) / 2, cy = (ay + by) / 2;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  let s = '';
  s += `<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(cx - ux * half)}" y2="${f(cy - uy * half)}" class="${cls('ck-line', el)}"/>`;
  s += `<line x1="${f(cx + ux * half)}" y1="${f(cy + uy * half)}" x2="${f(bx)}" y2="${f(by)}" class="${cls('ck-line', el)}"/>`;
  const mirror = el.mirror ? ' scale(1,-1)' : '';
  s += `<g transform="translate(${f(cx)},${f(cy)}) rotate(${f(ang)})${mirror}" class="${cls('', el)}">${body.svg.replace(/<text[^>]*>[+−]<\/text>/g, '')}</g>`;
  // Upright glyphs (+/− signs, letters) placed in rotated frame but drawn unrotated
  const glyphs = body.upright || [];
  for (const [gx, gy, g] of glyphs) {
    const rad = ang * Math.PI / 180; const yy = el.mirror ? -gy : gy;
    const px = cx + gx * Math.cos(rad) - yy * Math.sin(rad);
    const py = cy + gx * Math.sin(rad) + yy * Math.cos(rad);
    s += text(px, py + 0.5, g, { size: g.length > 1 ? 11 : 14, klass: cls('ck-label', el) });
  }
  if (el.t === 'Cpol') {
    const rad = ang * Math.PI / 180; const gx = -12, gy = el.mirror ? 12 : -12;
    s += text(cx + gx * Math.cos(rad) - gy * Math.sin(rad), cy + gx * Math.sin(rad) + gy * Math.cos(rad), '+', { size: 13 });
  }
  // label placement: perpendicular offset
  const lab = [el.label, el.value].filter(v => v !== undefined && v !== null && v !== '').join('\n');
  if (lab) {
    const horiz = Math.abs(dx) >= Math.abs(dy);
    let side = el.labelSide === 'other' ? -1 : 1;
    const nLines = lab.split('\n').length;
    const W = { R: 8, Rbox: 8, Z: 9, FB: 7, C: 13, Cpol: 13, L: 7, Lcore: 13, V: 16, Vac: 16, Vsq: 16, I: 16, Vdep: 16, Idep: 16, battery: 15, cell: 15, D: 10, Zener: 11, Schottky: 10, TVS: 11, LED: 19, photodiode: 19, SW: 12, SWclosed: 8, PB: 16, F: 7, lamp: 13, M: 16, A: 14, VM: 14, xtal: 12, pot: 22, thermistor: 13 }[el.t] ?? 10;
    if (horiz) {
      const off = W + 9 + (side > 0 ? (nLines - 1) * 15.6 : 0);
      s += text(cx, cy - side * off, lab, { size: 13, klass: cls('ck-label', el) });
    } else {
      const off = W + 6;
      s += text(cx + side * off, cy - (nLines - 1) * 7.8, lab, { anchor: side > 0 ? 'start' : 'end', size: 13, klass: cls('ck-label', el) });
    }
  }
  return { svg: s, pts: [[ax, ay], [bx, by], [cx + 30, cy + 30], [cx - 30, cy - 30]] };
}

// ---------- multi-terminal parts (absolute coords) ----------
function mos(el) {
  const p = el.t === 'pmos'; const dep = !!el.depletion;
  const [x0, y0] = el.at; const sx = el.flip ? -1 : 1;
  const X = dx => (x0 + sx * dx) * U, Y = dy => (y0 + dy) * U;
  const c = cls('ck-line', el); let s = '';
  // gate lead + plate
  if (p && el.bubble) { s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(0.55)}" y2="${Y(0)}" class="${c}"/><circle cx="${X(0.72)}" cy="${Y(0)}" r="3.4" class="${c} ck-fill-bg"/>`; }
  else s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(0.9)}" y2="${Y(0)}" class="${c}"/>`;
  s += `<line x1="${X(0.9)}" y1="${Y(-0.9)}" x2="${X(0.9)}" y2="${Y(0.9)}" class="${c}"/>`;
  // channel
  if (dep) s += `<line x1="${X(1.2)}" y1="${Y(-1)}" x2="${X(1.2)}" y2="${Y(1)}" class="${c}"/>`;
  else for (const [a, b] of [[-1, -0.5], [-0.25, 0.25], [0.5, 1]]) s += `<line x1="${X(1.2)}" y1="${Y(a)}" x2="${X(1.2)}" y2="${Y(b)}" class="${c}"/>`;
  // top & bottom terminals: NMOS top=drain, bottom=source ; PMOS top=source, bottom=drain
  s += `<path d="M ${X(1.2)} ${Y(-0.75)} L ${X(2)} ${Y(-0.75)} L ${X(2)} ${Y(-2)}" class="${c}" fill="none"/>`;
  s += `<path d="M ${X(1.2)} ${Y(0.75)} L ${X(2)} ${Y(0.75)} L ${X(2)} ${Y(2)}" class="${c}" fill="none"/>`;
  // body connection to source
  const srcY = p ? -0.75 : 0.75;
  s += `<path d="M ${X(1.2)} ${Y(0)} L ${X(2)} ${Y(0)} L ${X(2)} ${Y(srcY)}" class="${c}" fill="none"/>`;
  // arrow on body: NMOS points into channel, PMOS points out
  const tip = p ? 1.95 : 1.25, tail = p ? 1.35 : 1.85;
  const tx = X(tip), ty = Y(0); const dir = Math.sign(X(tip) - X(tail));
  s += `<path d="M ${tx} ${ty} L ${tx - dir * 8} ${ty - 4.5} L ${tx - dir * 8} ${ty + 4.5} Z" class="ck-fill-ink${el.color ? ' ck-c-' + el.color : ''}"/>`;
  if (el.bodyDiode) {
    // diode from source side (anode) to drain side (cathode), drawn at x+2.9
    const xd = X(2.9); const yTop = Y(-0.75), yBot = Y(0.75);
    s += `<path d="M ${X(2)} ${yTop} L ${xd} ${yTop} L ${xd} ${yBot} L ${X(2)} ${yBot}" class="${c} ck-thin" fill="none"/>`;
    // NMOS: anode bottom(source) -> cathode top(drain): triangle points up. PMOS: anode bottom(drain) -> cathode top(source): also points up.
    const ym = Y(0);
    s += `<path d="M ${xd - 6} ${ym + 5} L ${xd + 6} ${ym + 5} L ${xd} ${ym - 5} Z" class="ck-line ck-thin ck-fill-bg"/><line x1="${xd - 6}" y1="${ym - 5}" x2="${xd + 6}" y2="${ym - 5}" class="ck-line ck-thin"/>`;
  }
  const pins = p ? { G: [0, 0], S: [2, -2], D: [2, 2] } : { G: [0, 0], D: [2, -2], S: [2, 2] };
  if (el.pinLabels !== false) {
    for (const [n, [dx, dy]] of Object.entries(pins)) {
      if (n === 'G') s += text(X(0) + sx * 3, Y(0) - 9, 'G', { size: 10, klass: 'ck-pin', anchor: sx > 0 ? 'start' : 'end' });
      else s += text(X(dx) + sx * 6, Y(dy) + (dy < 0 ? 8 : -8), n, { size: 10, klass: 'ck-pin', anchor: sx > 0 ? 'start' : 'end' });
    }
  }
  if (el.label) s += text(X(el.bodyDiode ? 3.5 : 2.6), Y(0), el.label, { anchor: sx > 0 ? 'start' : 'end', size: 13, klass: cls('ck-label', el) });
  return { svg: s, pts: [[X(0), Y(-2)], [X(3.5), Y(2)]] };
}

function bjt(el) {
  const p = el.t === 'pnp'; const [x0, y0] = el.at; const sx = el.flip ? -1 : 1;
  const X = dx => (x0 + sx * dx) * U, Y = dy => (y0 + dy) * U;
  const c = cls('ck-line', el); let s = '';
  if (el.circle) s += `<circle cx="${X(1.45)}" cy="${Y(0)}" r="${1.35 * U}" class="${c} ck-thin" fill="none"/>`;
  s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(0)}" class="${c}"/>`;
  s += `<line x1="${X(1)}" y1="${Y(-0.8)}" x2="${X(1)}" y2="${Y(0.8)}" class="${c} ck-thick"/>`;
  s += `<path d="M ${X(1)} ${Y(-0.4)} L ${X(2)} ${Y(-1.1)} L ${X(2)} ${Y(-2)}" class="${c}" fill="none"/>`;
  s += `<path d="M ${X(1)} ${Y(0.4)} L ${X(2)} ${Y(1.1)} L ${X(2)} ${Y(2)}" class="${c}" fill="none"/>`;
  // arrow on emitter. NPN: emitter bottom, arrow points away from base (toward E). PNP: emitter top, arrow points toward base.
  const seg = p ? [[1, -0.4], [2, -1.1]] : [[1, 0.4], [2, 1.1]];
  const [[ax1, ay1], [ax2, ay2]] = seg.map(([a, b]) => [X(a), Y(b)]);
  const t = p ? 0.3 : 0.75; const mx = ax1 + (ax2 - ax1) * t, my = ay1 + (ay2 - ay1) * t;
  let vx = ax2 - ax1, vy = ay2 - ay1; const vl = Math.hypot(vx, vy); vx /= vl; vy /= vl;
  if (p) { vx = -vx; vy = -vy; }
  const nx = -vy, ny = vx;
  s += `<path d="M ${f(mx + vx * 5)} ${f(my + vy * 5)} L ${f(mx - vx * 4 + nx * 4.5)} ${f(my - vy * 4 + ny * 4.5)} L ${f(mx - vx * 4 - nx * 4.5)} ${f(my - vy * 4 - ny * 4.5)} Z" class="ck-fill-ink${el.color ? ' ck-c-' + el.color : ''}"/>`;
  const pins = p ? { B: [0, 0], E: [2, -2], C: [2, 2] } : { B: [0, 0], C: [2, -2], E: [2, 2] };
  if (el.pinLabels !== false) for (const [n, [dx, dy]] of Object.entries(pins)) {
    if (n === 'B') s += text(X(0) + sx * 3, Y(0) - 9, 'B', { size: 10, klass: 'ck-pin', anchor: sx > 0 ? 'start' : 'end' });
    else s += text(X(dx) + sx * 6, Y(dy) + (dy < 0 ? 8 : -8), n, { size: 10, klass: 'ck-pin', anchor: sx > 0 ? 'start' : 'end' });
  }
  if (el.label) s += text(X(3.1), Y(0), el.label, { anchor: sx > 0 ? 'start' : 'end', klass: cls('ck-label', el) });
  return { svg: s, pts: [[X(0), Y(-2)], [X(3), Y(2)]] };
}

function opamp(el) {
  const [x0, y0] = el.at; const sy = el.flipY ? -1 : 1;
  const X = dx => (x0 + dx) * U, Y = dy => (y0 + dy * sy) * U;
  const c = cls('ck-line', el); let s = '';
  s += `<path d="M ${X(0)} ${Y(-2)} L ${X(0)} ${Y(2)} L ${X(4)} ${Y(0)} Z" class="${c} ck-fill-bg"/>`;
  const top = el.swap ? '+' : '−', bot = el.swap ? '−' : '+';
  s += text(X(0.5), Y(-1), top, { size: 15, klass: cls('ck-label', el) });
  s += text(X(0.5), Y(1), bot, { size: 15, klass: cls('ck-label', el) });
  if (el.supply) {
    s += `<line x1="${X(2)}" y1="${Y(-1)}" x2="${X(2)}" y2="${Y(-2)}" class="${c}"/><line x1="${X(2)}" y1="${Y(1)}" x2="${X(2)}" y2="${Y(2)}" class="${c}"/>`;
    s += text(X(2.3), Y(-2) + 2, el.vpos || 'V+', { size: 11, anchor: 'start', klass: 'ck-pin' });
    s += text(X(2.3), Y(2) - 2, el.vneg || 'V−', { size: 11, anchor: 'start', klass: 'ck-pin' });
  }
  if (el.label) s += text(X(1.6), Y(0), el.label, { size: 11, klass: 'ck-pin' });
  return { svg: s, pts: [[X(0), Y(-2)], [X(4), Y(2)]] };
}

function gate(el) {
  const kind = el.t; const [x0, y0] = el.at; const n = el.inputs || (kind === 'not' || kind === 'buf' ? 1 : 2);
  const X = dx => (x0 + dx) * U, Y = dy => (y0 + dy) * U;
  const c = cls('ck-line', el); let s = '';
  const inv = ['not', 'nand', 'nor', 'xnor'].includes(kind);
  const ins = n === 1 ? [0] : Array.from({ length: n }, (_, i) => -((n - 1) / 2) + i * (n === 2 ? 2 : 1));
  const h = Math.max(1.2, (Math.max(...ins.map(Math.abs)) + 0.6));
  const bodyEnd = inv ? 3.6 : 4;
  if (kind === 'not' || kind === 'buf') {
    s += `<path d="M ${X(0.6)} ${Y(-1)} L ${X(0.6)} ${Y(1)} L ${X(3.2)} ${Y(0)} Z" class="${c} ck-fill-bg"/>`;
    s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(0.6)}" y2="${Y(0)}" class="${c}"/>`;
    if (inv) s += `<circle cx="${X(3.2) + 4}" cy="${Y(0)}" r="4" class="${c} ck-fill-bg"/><line x1="${X(3.2) + 8}" y1="${Y(0)}" x2="${X(4)}" y2="${Y(0)}" class="${c}"/>`;
    else s += `<line x1="${X(3.2)}" y1="${Y(0)}" x2="${X(4)}" y2="${Y(0)}" class="${c}"/>`;
  } else {
    const L = X(0.6), T = Y(-h), B = Y(h), R = X(3.4), mid = Y(0);
    if (kind === 'and' || kind === 'nand') {
      const xs = X(1.9); const r = (B - T) / 2;
      s += `<path d="M ${L} ${T} L ${xs} ${T} A ${r} ${r} 0 0 1 ${xs} ${B} L ${L} ${B} Z" class="${c} ck-fill-bg"/>`;
      var outX = xs + r;
    } else {
      s += `<path d="M ${L} ${T} Q ${X(2.4)} ${T} ${R} ${mid} Q ${X(2.4)} ${B} ${L} ${B} Q ${X(1.2)} ${mid} ${L} ${T} Z" class="${c} ck-fill-bg"/>`;
      if (kind === 'xor' || kind === 'xnor') s += `<path d="M ${X(0.25)} ${T} Q ${X(0.85)} ${mid} ${X(0.25)} ${B}" class="${c}" fill="none"/>`;
      var outX = R;
    }
    for (const iy of ins) {
      // input lead ends exactly on the (quadratic) back curve
      const t = (Y(iy) - T) / (B - T);
      let endX = L;
      if (kind === 'xor' || kind === 'xnor') endX = X(0.25) + 2 * t * (1 - t) * (X(0.85) - X(0.25));
      else if (kind !== 'and' && kind !== 'nand') endX = L + 2 * t * (1 - t) * (X(1.2) - L);
      s += `<line x1="${X(0)}" y1="${Y(iy)}" x2="${f(endX)}" y2="${Y(iy)}" class="${c}"/>`;
    }
    if (inv) s += `<circle cx="${outX + 4}" cy="${mid}" r="4" class="${c} ck-fill-bg"/><line x1="${outX + 8}" y1="${mid}" x2="${X(4)}" y2="${mid}" class="${c}"/>`;
    else s += `<line x1="${outX}" y1="${mid}" x2="${X(4)}" y2="${mid}" class="${c}"/>`;
  }
  if (el.label) s += text(X(2), Y(-h) - 10, el.label, { size: 12, klass: cls('ck-label', el) });
  return { svg: s, pts: [[X(0), Y(-h)], [X(4), Y(h)]] };
}

function box(el) {
  const [x0, y0] = el.at; const w = el.w || 4, h = el.h || 4;
  let s = `<rect x="${x0 * U}" y="${y0 * U}" width="${w * U}" height="${h * U}" rx="3" class="${cls('ck-line', el)} ck-fill-box"/>`;
  if (el.label) s += text((x0 + w / 2) * U, (y0 + h / 2) * U - (String(el.label).split('\n').length - 1) * 7.8, el.label, { size: 13, klass: cls('ck-label ck-strong', el) });
  for (const pin of el.pins || []) {
    let px, py, anchor, tx, ty;
    if (pin.side === 'left') { px = x0; py = y0 + pin.pos; tx = px * U + 5; ty = py * U; anchor = 'start'; }
    else if (pin.side === 'right') { px = x0 + w; py = y0 + pin.pos; tx = px * U - 5; ty = py * U; anchor = 'end'; }
    else if (pin.side === 'top') { px = x0 + pin.pos; py = y0; tx = px * U; ty = py * U + 10; anchor = 'middle'; }
    else { px = x0 + pin.pos; py = y0 + h; tx = px * U; ty = py * U - 10; anchor = 'middle'; }
    if (pin.name) s += text(tx, ty, pin.name, { size: 10.5, anchor, klass: 'ck-pin' });
  }
  return { svg: s, pts: [[x0 * U, y0 * U], [(x0 + w) * U, (y0 + h) * U]] };
}

function opto(el) {
  const [x0, y0] = el.at; const X = d => (x0 + d) * U, Y = d => (y0 + d) * U; const c = cls('ck-line', el);
  let s = `<rect x="${X(0.6)}" y="${Y(-0.6)}" width="${3.8 * U}" height="${4.2 * U}" rx="3" class="${c} ck-thin" fill="none" stroke-dasharray="4 3"/>`;
  // LED vertical: anode top (x0,y0) -> cathode bottom (x0,y0+3) at column x0+1.4
  s += `<path d="M ${X(0)} ${Y(0)} L ${X(1.4)} ${Y(0)} L ${X(1.4)} ${Y(1.05)}" class="${c}" fill="none"/><path d="M ${X(0)} ${Y(3)} L ${X(1.4)} ${Y(3)} L ${X(1.4)} ${Y(1.95)}" class="${c}" fill="none"/>`;
  s += `<path d="M ${X(1.4) - 9} ${Y(1.05)} L ${X(1.4) + 9} ${Y(1.05)} L ${X(1.4)} ${Y(1.95) - 1} Z" class="${c} ck-fill-bg"/><line x1="${X(1.4) - 9}" y1="${Y(1.95)}" x2="${X(1.4) + 9}" y2="${Y(1.95)}" class="${c}"/>`;
  s += `<path d="M ${X(1.95)} ${Y(1.2)} L ${X(2.65)} ${Y(1.2)} M ${X(2.65)} ${Y(1.2)} l -5 -3 M ${X(2.65)} ${Y(1.2)} l -5 3 M ${X(1.95)} ${Y(1.8)} L ${X(2.65)} ${Y(1.8)} M ${X(2.65)} ${Y(1.8)} l -5 -3 M ${X(2.65)} ${Y(1.8)} l -5 3" class="${c} ck-thin" fill="none"/>`;
  // phototransistor: base bar at x0+3, collector to (x0+5, y0), emitter to (x0+5, y0+3)
  s += `<line x1="${X(3)}" y1="${Y(0.8)}" x2="${X(3)}" y2="${Y(2.2)}" class="${c} ck-thick"/>`;
  s += `<path d="M ${X(3)} ${Y(1.1)} L ${X(4)} ${Y(0.5)} L ${X(4)} ${Y(0)} L ${X(5)} ${Y(0)}" class="${c}" fill="none"/>`;
  s += `<path d="M ${X(3)} ${Y(1.9)} L ${X(4)} ${Y(2.5)} L ${X(4)} ${Y(3)} L ${X(5)} ${Y(3)}" class="${c}" fill="none"/>`;
  s += `<path d="M ${X(4)} ${Y(2.5)} l -8 -1 l 3.5 -5.5 Z" class="ck-fill-ink"/>`;
  if (el.label) s += text(X(2.5), Y(-1.1), el.label, { size: 12, klass: cls('ck-label', el) });
  return { svg: s, pts: [[X(0), Y(-1.5)], [X(5), Y(3.6)]] };
}

function xfmr(el) {
  const [x0, y0] = el.at; const X = d => (x0 + d) * U, Y = d => (y0 + d) * U; const c = cls('ck-line', el);
  let s = '';
  const coil = (x, dir) => { let d = `M ${X(x)} ${Y(0.4)}`; for (let k = 0; k < 4; k++) d += ` A 6.4 6.4 0 0 ${dir} ${X(x)} ${f(Y(0.4) + (k + 1) * 12.8)}`; return `<path d="${d}" class="${c}" fill="none"/>`; };
  s += `<path d="M ${X(0)} ${Y(0)} L ${X(1.4)} ${Y(0)} L ${X(1.4)} ${Y(0.4)} M ${X(1.4)} ${f(Y(0.4) + 51.2)} L ${X(1.4)} ${Y(4)} L ${X(0)} ${Y(4)}" class="${c}" fill="none"/>`;
  s += coil(1.4, 1);
  s += `<path d="M ${X(4)} ${Y(0)} L ${X(2.6)} ${Y(0)} L ${X(2.6)} ${Y(0.4)} M ${X(2.6)} ${f(Y(0.4) + 51.2)} L ${X(2.6)} ${Y(4)} L ${X(4)} ${Y(4)}" class="${c}" fill="none"/>`;
  s += coil(2.6, 0);
  if (el.core !== false) s += `<line x1="${X(1.9)}" y1="${Y(0.3)}" x2="${X(1.9)}" y2="${Y(3.7)}" class="${c}"/><line x1="${X(2.1)}" y1="${Y(0.3)}" x2="${X(2.1)}" y2="${Y(3.7)}" class="${c}"/>`;
  if (el.dots) s += `<circle cx="${X(1)}" cy="${Y(0.6)}" r="2.6" class="ck-fill-ink"/><circle cx="${X(3)}" cy="${Y(0.6)}" r="2.6" class="ck-fill-ink"/>`;
  if (el.label) s += text(X(2), Y(-0.6), el.label, { size: 12, klass: cls('ck-label', el) });
  return { svg: s, pts: [[X(0), Y(-1)], [X(4), Y(4)]] };
}

function render1(el) {
  const t = el.t;
  if (BODIES[t]) return twoTerminal(el);
  switch (t) {
    case 'wire': {
      const pts = el.pts.map(([x, y]) => [x * U, y * U]);
      const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${f(p[0])} ${f(p[1])}`).join(' ');
      let s = `<path d="${d}" class="${cls('ck-line', el)}${el.dashed ? ' ck-dashed' : ''}" fill="none"/>`;
      if (el.flow) s += `<path d="${d}" class="ck-flow${el.flow === 'reverse' ? ' ck-flow-rev' : ''}" fill="none"/>`;
      if (el.label) { const m = pts[Math.floor((pts.length - 1) / 2)], n = pts[Math.floor((pts.length - 1) / 2) + 1] || m; s += text((m[0] + n[0]) / 2, (m[1] + n[1]) / 2 - 10, el.label, { size: 12, klass: cls('ck-label', el) }); }
      return { svg: s, pts };
    }
    case 'gnd': {
      const [x, y] = el.at.map(v => v * U); const c = cls('ck-line', el);
      if (el.style === 'chassis') return { svg: `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 10}" class="${c}"/><line x1="${x - 10}" y1="${y + 10}" x2="${x + 10}" y2="${y + 10}" class="${c}"/><path d="M ${x - 10} ${y + 10} l -5 7 M ${x} ${y + 10} l -5 7 M ${x + 10} ${y + 10} l -5 7" class="${c}"/>`, pts: [[x - 15, y], [x + 15, y + 20]] };
      if (el.style === 'signal') return { svg: `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 8}" class="${c}"/><path d="M ${x - 9} ${y + 8} L ${x + 9} ${y + 8} L ${x} ${y + 17} Z" class="${c}" fill="none"/>`, pts: [[x - 10, y], [x + 10, y + 20]] };
      let s = `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 9}" class="${c}"/><line x1="${x - 11}" y1="${y + 9}" x2="${x + 11}" y2="${y + 9}" class="${c}"/><line x1="${x - 7}" y1="${y + 13.5}" x2="${x + 7}" y2="${y + 13.5}" class="${c}"/><line x1="${x - 3}" y1="${y + 18}" x2="${x + 3}" y2="${y + 18}" class="${c}"/>`;
      if (el.label) s += text(x + 14, y + 13, el.label, { size: 11, anchor: 'start', klass: 'ck-pin' });
      return { svg: s, pts: [[x - 12, y], [x + 12, y + 20]] };
    }
    case 'rail': {
      const [x, y] = el.at.map(v => v * U); const down = el.dir === 'down'; const c = cls('ck-line', el);
      const y2 = down ? y + 10 : y - 10;
      let s = `<line x1="${x}" y1="${y}" x2="${x}" y2="${y2}" class="${c}"/><line x1="${x - 10}" y1="${y2}" x2="${x + 10}" y2="${y2}" class="${c}"/>`;
      s += text(x, down ? y2 + 12 : y2 - 11, el.label || 'V_{DD}', { size: 13, klass: cls('ck-label', el) });
      return { svg: s, pts: [[x - 20, y2 - 22], [x + 20, y2 + 22]] };
    }
    case 'dot': { const [x, y] = el.at.map(v => v * U); return { svg: `<circle cx="${x}" cy="${y}" r="3.4" class="ck-fill-ink${el.color ? ' ck-c-' + el.color : ''}"/>`, pts: [[x, y]] }; }
    case 'term': {
      const [x, y] = el.at.map(v => v * U); const side = el.side || 'left';
      let s = `<circle cx="${x}" cy="${y}" r="3.6" class="ck-line ck-fill-bg${el.color ? ' ck-c-' + el.color : ''}"/>`;
      const off = { left: [-9, 0, 'end'], right: [9, 0, 'start'], top: [0, -13, 'middle'], bottom: [0, 14, 'middle'] }[side];
      if (el.label) s += text(x + off[0], y + off[1], el.label, { anchor: off[2], size: 13, klass: cls('ck-label', el) });
      return { svg: s, pts: [[x + off[0] * 4, y + off[1] * 2], [x, y]] };
    }
    case 'text': {
      const [x, y] = el.at.map(v => v * U);
      return { svg: text(x, y, el.text, { anchor: el.anchor || 'middle', size: el.size || 13, klass: cls(el.muted ? 'ck-pin' : 'ck-label', el) }), pts: [[x - (el.anchor === 'start' ? 0 : String(el.text).length * 3.5), y - 8], [x + (el.anchor === 'end' ? 0 : String(el.text).length * 7), y + 8]] };
    }
    case 'arrow': {
      const [ax, ay] = el.a.map(v => v * U), [bx, by] = el.b.map(v => v * U);
      const L = Math.hypot(bx - ax, by - ay) || 1; const ux = (bx - ax) / L, uy = (by - ay) / L;
      const c = `ck-arrow${el.color ? ' ck-c-' + el.color : ' ck-c-accent'}`;
      let s = `<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx - ux * 6)}" y2="${f(by - uy * 6)}" class="${c}"/>`;
      s += `<path d="M ${f(bx)} ${f(by)} L ${f(bx - ux * 9 - uy * 4.5)} ${f(by - uy * 9 + ux * 4.5)} L ${f(bx - ux * 9 + uy * 4.5)} ${f(by - uy * 9 - ux * 4.5)} Z" class="ck-fill-ink${el.color ? ' ck-c-' + el.color : ' ck-c-accent'}"/>`;
      if (el.label) { const horiz = Math.abs(bx - ax) >= Math.abs(by - ay); s += text((ax + bx) / 2 + (horiz ? 0 : 8), (ay + by) / 2 + (horiz ? -11 : 0), el.label, { size: 12, anchor: horiz ? 'middle' : 'start', klass: `ck-label${el.color ? ' ck-c-' + el.color : ' ck-c-accent'}` }); }
      return { svg: s, pts: [[ax, ay], [bx, by]] };
    }
    case 'vmark': {
      const [ax, ay] = el.a.map(v => v * U), [bx, by] = el.b.map(v => v * U);
      const k = `ck-label${el.color ? ' ck-c-' + el.color : ' ck-c-accent'}`;
      let s = text(ax, ay, '+', { size: 15, klass: k }) + text(bx, by, '−', { size: 15, klass: k });
      if (el.label) s += text((ax + bx) / 2 + (el.dx || 0) * U, (ay + by) / 2 + (el.dy || 0) * U, el.label, { size: 13, anchor: el.anchor || 'middle', klass: k });
      return { svg: s, pts: [[ax, ay], [bx, by]] };
    }
    case 'loop': {
      const [x, y] = el.at.map(v => v * U); const r = (el.r || 1.2) * U; const cw = el.dir !== 'ccw';
      const a0 = -150, a1 = 150; const p = a => [x + r * Math.cos(a * Math.PI / 180), y + r * Math.sin(a * Math.PI / 180)];
      const [sx, sy] = p(cw ? a0 : a1), [ex, ey] = p(cw ? a1 : a0);
      const k = `ck-arrow${el.color ? ' ck-c-' + el.color : ' ck-c-accent'}`;
      let s = `<path d="M ${f(sx)} ${f(sy)} A ${r} ${r} 0 1 ${cw ? 1 : 0} ${f(ex)} ${f(ey)}" class="${k}" fill="none"/>`;
      const ta = (cw ? a1 : a0) * Math.PI / 180; const tx = cw ? -Math.sin(ta) : Math.sin(ta), ty = cw ? Math.cos(ta) : -Math.cos(ta);
      s += `<path d="M ${f(ex + tx * 7)} ${f(ey + ty * 7)} L ${f(ex - tx * 3 - ty * 5)} ${f(ey - ty * 3 + tx * 5)} L ${f(ex - tx * 3 + ty * 5)} ${f(ey - ty * 3 - tx * 5)} Z" class="ck-fill-ink${el.color ? ' ck-c-' + el.color : ' ck-c-accent'}"/>`;
      if (el.label) s += text(x, y, el.label, { size: 12, klass: `ck-label${el.color ? ' ck-c-' + el.color : ' ck-c-accent'}` });
      return { svg: s, pts: [[x - r, y - r], [x + r, y + r]] };
    }
    case 'region': {
      const [x0, y0] = el.at; const w = el.w, h = el.h;
      let s = `<rect x="${x0 * U}" y="${y0 * U}" width="${w * U}" height="${h * U}" rx="6" class="ck-region${el.color ? ' ck-c-' + el.color : ''}"/>`;
      if (el.label) s += text((x0 + 0.3) * U, (y0 - 0.45) * U, el.label, { size: 11.5, anchor: 'start', klass: `ck-pin${el.color ? ' ck-c-' + el.color : ''}` });
      return { svg: s, pts: [[x0 * U, (y0 - 1) * U], [(x0 + w) * U, (y0 + h) * U]] };
    }
    case 'nmos': case 'pmos': return mos(el);
    case 'npn': case 'pnp': return bjt(el);
    case 'opamp': return opamp(el);
    case 'and': case 'or': case 'not': case 'nand': case 'nor': case 'xor': case 'xnor': case 'buf': return gate(el);
    case 'box': return box(el);
    case 'opto': return opto(el);
    case 'xfmr': return xfmr(el);
    default: return { svg: `<text x="0" y="0" class="ck-err">unknown element ${esc(t)}</text>`, pts: [], error: `unknown element type "${t}"` };
  }
}

/** Render a circuit spec to an SVG string. spec = { elements:[...], width?, caption? } */
export function renderCircuit(spec) {
  const parts = []; const errors = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  // draw regions first, then everything else, dots last
  const order = el => el.t === 'region' ? 0 : el.t === 'dot' ? 2 : 1;
  const els = [...(spec.elements || [])].sort((a, b) => order(a) - order(b));
  for (const el of els) {
    let r;
    try { r = render1(el); } catch (e) { r = { svg: '', pts: [], error: `${el.t}: ${e.message}` }; }
    if (r.error) errors.push(r.error);
    parts.push(r.svg);
    for (const [x, y] of r.pts) { if (!isFinite(x) || !isFinite(y)) continue; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
  const m = 22; const vb = [minX - m, minY - m, maxX - minX + 2 * m, maxY - minY + 2 * m].map(f);
  const maxW = spec.width || Math.min(720, vb[2] * 1.15);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ck-svg" viewBox="${vb.join(' ')}" style="max-width:${f(maxW)}px" role="img" aria-label="${esc(spec.caption || 'circuit schematic')}">${parts.join('')}</svg>`;
  return { svg, errors };
}
