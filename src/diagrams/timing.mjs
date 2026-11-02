// Minimal WaveDrom-like timing diagram renderer -> SVG string.
// spec = { signals:[{name, wave, data?:[], color?} | {} (spacer)], hscale?, marks?:[{t, label}], spans?:[{from,to,row,label}] }
import { richText } from './circuit.mjs';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function renderTiming(spec) {
  const errors = [];
  const sigs = spec.signals || [];
  const P = 36 * (spec.hscale || 1);    // px per period
  const RH = 30, H = 18, GAP = 12;      // row height, wave amplitude
  const nameW = Math.max(60, ...sigs.map(s => (s.name ? String(s.name).replace(/[_^{}]/g, '').length * 7.4 + 18 : 0)));
  const n = Math.max(1, ...sigs.map(s => (s.wave || '').length));
  const W = nameW + n * P + 16;
  const top = 18;
  let rowsSvg = '';
  sigs.forEach((sig, r) => {
    const y0 = top + r * (RH + GAP); const yH = y0 + (RH - H) / 2, yL = yH + H, yM = (yH + yL) / 2;
    if (!sig.wave) return;
    const color = sig.color ? `var(--d-${sig.color})` : 'var(--d-ink)';
    rowsSvg += `<text x="${nameW - 10}" y="${yM}" text-anchor="end" dominant-baseline="middle" class="tm-name">${richText(sig.name || '')}</text>`;
    // expand wave to per-period states
    const states = []; let prev = 'x'; let dataIdx = 0; const labels = [];
    for (const ch0 of sig.wave) {
      let ch = ch0;
      if (ch === '.' || ch === '|') { states.push({ ...states[states.length - 1] || { v: 'x' }, cont: true }); continue; }
      if (ch === 'h' || ch === 'H') ch = '1'; if (ch === 'l' || ch === 'L') ch = '0';
      if (/[=2-9]/.test(ch)) { const lab = (sig.data || [])[dataIdx++]; states.push({ v: 'd', k: ch, lab, cont: false }); continue; }
      if ('pPnN'.includes(ch)) { states.push({ v: ch.toLowerCase(), cont: false, clk: true }); continue; }
      if ('01xzud'.includes(ch)) { states.push({ v: ch, cont: false }); continue; }
      errors.push(`unknown wave char "${ch}" in ${sig.name}`); states.push({ v: 'x' });
    }
    const S = 5; // edge slope px
    let d = ''; let lastLevel = null; // 'H'|'L'|'M'
    const lvl = v => v === '1' || v === 'u' ? yH : v === '0' || v === 'd' ? yL : yM;
    for (let i = 0; i < states.length; i++) {
      const st = states[i]; const x = nameW + i * P;
      if (st.v === 'p' || st.v === 'n') {
        // clock: carry on if continued
        const first = st.v === 'p' ? yH : yL, second = st.v === 'p' ? yL : yH;
        const startY = lastLevel ?? second;
        d += `M ${x} ${startY} L ${x + 1} ${first} L ${x + P / 2} ${first} L ${x + P / 2 + 1} ${second} L ${x + P} ${second} `;
        // arrow-less; mark edges
        lastLevel = second; continue;
      }
      if (st.v === 'd' || st.v === 'x') {
        // bus / unknown segment: find run length
        if (st.cont) continue;
        let j = i + 1; while (j < states.length && states[j].cont) j++;
        const x1 = x + (j - i) * P;
        const fillCls = st.v === 'x' ? 'tm-x' : `tm-d tm-d${st.k === '=' ? '2' : st.k}`;
        const pts = `${x},${yM} ${x + S},${yH} ${x1 - S},${yH} ${x1},${yM} ${x1 - S},${yL} ${x + S},${yL}`;
        rowsSvg += `<polygon points="${pts}" class="${fillCls}" style="stroke:${color}"/>`;
        if (st.v === 'd' && st.lab !== undefined) rowsSvg += `<text x="${(x + x1) / 2}" y="${yM + 0.5}" text-anchor="middle" dominant-baseline="middle" class="tm-data">${richText(st.lab)}</text>`;
        lastLevel = yM; continue;
      }
      const y = lvl(st.v);
      if (lastLevel === null) d += `M ${x} ${y} `;
      else if (Math.abs(lastLevel - y) > 0.1) d += `M ${x} ${lastLevel} L ${x + S} ${y} `;
      else d += `M ${x} ${y} `;
      const x1 = x + P;
      const dashed = st.v === 'u' || st.v === 'd' || st.v === 'z';
      if (dashed) {
        rowsSvg += `<path d="${d}" class="tm-wave" style="stroke:${color}"/>`; d = '';
        rowsSvg += `<path d="M ${x + (lastLevel !== null && Math.abs(lastLevel - y) > 0.1 ? S : 0)} ${y} L ${x1} ${y}" class="tm-wave tm-dash" style="stroke:${st.v === 'z' ? 'var(--d-blue)' : color}"/>`;
      } else d += `L ${x1} ${y} `;
      lastLevel = y;
    }
    if (d) rowsSvg += `<path d="${d}" class="tm-wave" style="stroke:${color}"/>`;
  });
  const totalH = top + sigs.length * (RH + GAP) + 8;
  let grid = '';
  for (let i = 0; i <= n; i++) grid += `<line x1="${nameW + i * P}" y1="${top - 6}" x2="${nameW + i * P}" y2="${totalH - 6}" class="tm-grid"/>`;
  let marks = '';
  for (const m of spec.marks || []) {
    const x = nameW + m.t * P;
    marks += `<line x1="${x}" y1="${top - 10}" x2="${x}" y2="${totalH - 4}" class="tm-mark"/>`;
    if (m.label) marks += `<text x="${x + 3}" y="${top - 10}" class="tm-marklabel" dominant-baseline="middle">${richText(m.label)}</text>`;
  }
  for (const sp of spec.spans || []) {
    const y = top + (sp.row ?? 0) * (RH + GAP) + RH + 4; const x0 = nameW + sp.from * P, x1 = nameW + sp.to * P;
    marks += `<path d="M ${x0} ${y} L ${x1} ${y}" class="tm-span"/><path d="M ${x0} ${y - 4} L ${x0} ${y + 4} M ${x1} ${y - 4} L ${x1} ${y + 4}" class="tm-span"/>`;
    if (sp.label) marks += `<text x="${(x0 + x1) / 2}" y="${y + 9}" text-anchor="middle" class="tm-marklabel" dominant-baseline="middle">${richText(sp.label)}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="tm-svg" viewBox="0 0 ${W} ${totalH + (spec.spans?.length ? 14 : 0)}" style="max-width:${Math.min(W * 1.2, 900)}px" role="img" aria-label="${esc(spec.caption || 'timing diagram')}">${grid}${rowsSvg}${marks}</svg>`;
  return { svg, errors };
}
