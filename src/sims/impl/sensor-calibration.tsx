// Sensor calibration & error: offset, gain, nonlinearity, noise; 1-/2-/3-/N-point correction; accuracy vs precision.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import Plot from '../../components/Plot';
import { FS, Mode, ideal, calibrate, errorCurves, readings, mean, std, histogram, noiseGain } from '../models/sensor-calibration';

const fmt = (v: number) => (v >= 0 ? '' : '−') + Math.abs(v).toFixed(3) + ' u';
const MODES: { value: Mode; label: string }[] = [{ value: 'none', label: 'None' }, { value: 'pt1', label: '1-pt' }, { value: 'pt2', label: '2-pt' }, { value: 'pt3', label: '3-pt' }, { value: 'multi', label: 'N-pt' }];
const MODE_TXT: Record<Mode, string> = { none: 'uncorrected reading', pt1: 'offset trim at one point', pt2: 'line through 2 points (offset + gain)', pt3: 'quadratic through 3 points', multi: 'cubic least-squares through N points' };

export default function SensorCalibration({ params }: SimProps) {
  const init = { offset: Number(params.offset ?? 0.2), gain: Number(params.gain ?? 1.05), nonlin: Number(params.nonlin ?? 0.02), noise: Number(params.noise ?? 0.05), mode: 'none' as Mode, nMulti: 6, xcal1: FS / 2, avg: 1, xt: 7, draw: 1 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const sensor = useMemo(() => ({ offset: s.offset, gain: s.gain, nonlin: s.nonlin, noise: s.noise }), [s.offset, s.gain, s.nonlin, s.noise]);
  const cal = useMemo(() => calibrate(sensor, { mode: s.mode, nMulti: s.nMulti, avg: s.avg, xcal1: s.xcal1, seed: 7 + 13 * s.draw }), [sensor, s.mode, s.nMulti, s.avg, s.xcal1, s.draw]);
  const err = useMemo(() => errorCurves(sensor, cal, 101), [sensor, cal]);
  const rd = useMemo(() => readings(sensor, cal, s.xt, 600, s.avg, 99 + s.draw), [sensor, cal, s.xt, s.avg, s.draw]);
  const m = mean(rd), sd = std(rd), bias = m - s.xt;
  const sdTheory = s.noise / Math.sqrt(s.avg) * Math.abs(noiseGain(sensor, cal, s.xt));
  const rawBias = ideal(sensor, s.xt) - s.xt;
  const band = useMemo(() => { const k = 2 * s.noise / Math.sqrt(s.avg); return { up: err.x.map((x, i) => err.fixed[i] + k * Math.abs(noiseGain(sensor, cal, x))), dn: err.x.map((x, i) => err.fixed[i] - k * Math.abs(noiseGain(sensor, cal, x))) }; }, [err, sensor, cal, s.noise, s.avg]);
  const span = Math.max(0.5, 4 * sd + Math.abs(bias) + 0.2);
  const hist = useMemo(() => histogram(rd, s.xt - span, s.xt + span, 41), [rd, s.xt, span]);
  const curve = useMemo(() => ({ x: err.x, y: err.x.map(x => ideal(sensor, x)) }), [err.x, sensor]);
  const tolAcc = 0.01 * FS, tolPrec = 0.01 * FS; // 1 % of full scale
  const accurate = Math.abs(bias) < tolAcc, precise = sd < tolPrec;
  const badge = accurate && precise ? { l: 'Accurate and precise', c: 'ok' as const } : accurate ? { l: 'Accurate on average but imprecise (scatter)', c: 'warn' as const } : precise ? { l: 'Precise but inaccurate (bias)', c: 'warn' as const } : { l: 'Neither accurate nor precise', c: 'bad' as const };
  const calPts = cal.xs.map((x, i) => ({ x, y: cal.ys[i], label: i === 0 ? 'cal points' : '', color: 'red' }));

  return (
    <SimShell title="Sensor calibration & error" onReset={() => set(init)}
      tryThis={<>with no correction the sensor reads {fmt(rawBias)} high at x = {s.xt.toFixed(1)} (offset + gain error + bow): that is a systematic bias, so every reading is wrong in the same way. Choose 2-pt: offset and gain disappear but the bow (nonlinearity, {(s.nonlin * 100).toFixed(1)} % of FS) remains; go to 3-pt and it vanishes. Now set noise to 0.3 and look at the histogram: calibration never removes scatter, but raising “readings averaged” to 16 narrows it by 4× (σ/√M). With very few noisy cal points the fit itself adds error, so press “New noise draw”.</>}
      controls={<>
        <Slider label="Offset error" value={s.offset} min={-1} max={1} step={0.01} format={v => v.toFixed(2) + ' units'} onChange={upd('offset')} />
        <Slider label="Gain (ideal = 1)" value={s.gain} min={0.8} max={1.2} step={0.005} format={v => v.toFixed(3)} onChange={upd('gain')} />
        <Slider label="Nonlinearity (bow, fraction of FS)" value={s.nonlin} min={0} max={0.1} step={0.002} format={v => (v * 100).toFixed(1) + ' % FS'} onChange={upd('nonlin')} />
        <Slider label="Noise σ per reading" value={s.noise} min={0} max={0.6} step={0.005} format={v => v.toFixed(3) + ' units'} onChange={upd('noise')} />
        <Seg label="Calibration" value={s.mode} onChange={upd('mode')} options={MODES} />
        {s.mode === 'pt1' && <Slider label="Cal point position" value={s.xcal1} min={0} max={FS} step={0.5} format={v => v.toFixed(1)} onChange={upd('xcal1')} />}
        {s.mode === 'multi' && <Slider label="Number of cal points" value={s.nMulti} min={4} max={12} step={1} format={v => v.toFixed(0)} onChange={upd('nMulti')} />}
        <Slider label="Readings averaged (cal & measurement)" value={s.avg} min={1} max={256} log format={v => v.toFixed(0)} onChange={v => upd('avg')(Math.max(1, Math.round(v)))} />
        <Slider label="Test input x" value={s.xt} min={0} max={FS} step={0.1} format={v => v.toFixed(1) + ' units'} onChange={upd('xt')} />
        <button className="btn btn-sm" onClick={() => upd('draw')(s.draw + 1)}>New noise draw</button>
        <Note>Full scale = {FS} units. Reading = offset + gain·x + 4·nl·FS·(x/FS)(1−x/FS) + noise. Correction: {MODE_TXT[s.mode]}.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /></div>
      <Readouts>
        <Readout k="Max error, uncorrected" v={fmt(err.maxRaw)} tone="bad" />
        <Readout k="Max error, after cal" v={fmt(err.maxFixed)} hl tone={err.maxFixed < 0.02 * FS ? 'ok' : 'warn'} />
        <Readout k={`Bias at x = ${s.xt.toFixed(1)}`} v={fmt(bias)} tone={accurate ? 'ok' : 'bad'} />
        <Readout k="Scatter σ (single result)" v={fmt(sd)} tone={precise ? 'ok' : 'warn'} />
        <Readout k="Expected σ = σ·g/√M" v={fmt(sdTheory)} />
        <Readout k="Total ≈ √(bias² + σ²)" v={fmt(Math.hypot(bias, sd))} />
      </Readouts>
      <EqBox>{String.raw`y=\text{off}+g\,x+4\,nl\,FS\,\tfrac{x}{FS}\!\left(1-\tfrac{x}{FS}\right)+\epsilon,\quad \sigma_{avg}=\frac{\sigma}{\sqrt M}=${(s.noise / Math.sqrt(s.avg)).toFixed(3)}\;\;\hat x=P^{-1}(y)`}</EqBox>
      <Plot series={[{ x: curve.x, y: curve.x, label: 'Ideal y = x', color: 'muted', dashed: true }, { x: curve.x, y: curve.y, label: 'Sensor response', color: 'accent' }]}
        xLabel="True input" yLabel="Sensor reading" height={210} points={calPts} />
      <Plot series={[{ x: err.x, y: err.raw, label: 'Uncorrected error', color: 'red' }, { x: err.x, y: err.fixed, label: 'Residual after calibration', color: 'green' }, { x: err.x, y: band.up, label: '±2σ of one result', color: 'green', dashed: true }, { x: err.x, y: band.dn, color: 'green', dashed: true }]}
        xLabel="True input" yLabel="Error (reading − truth)" height={230} hlines={[{ at: 0, color: 'muted' }]} vlines={cal.xs.map(x => ({ at: x, color: 'red' }))} />
      <Plot series={[{ x: hist.x, y: hist.y, label: `${rd.length} repeated results at x = ${s.xt.toFixed(1)}`, color: 'accent', step: true, fill: true }]} xLabel="Corrected result" yLabel="Fraction" height={190}
        yTickFormat={v => (v * 100).toFixed(0) + '%'} vlines={[{ at: s.xt, label: 'truth', color: 'green' }, { at: m, label: 'mean', color: 'red' }]} />
    </SimShell>
  );
}
