// Finite-state machines: Moore vs Mealy.
// Moore:  next = δ(state, x),  output z = λ(state)            -> depends on the STATE only, so it appears after the clock edge.
// Mealy:  next = δ(state, x),  output y = λ(state, x)         -> depends on state AND the current input, so it appears one
//         cycle earlier than the equivalent Moore output (before the edge, combinationally from the input).
// For equivalent machines: z(t+1) = y(t). A Moore machine usually needs one more state (e.g. S3 "got 101").
// Sequence detectors here are overlapping (101 in 10101 is found twice).

export type Machine = {
  kind: 'moore' | 'mealy';
  states: string[];            // display names
  desc: string[];              // what each state remembers
  delta: number[][];           // delta[state][input] -> next state
  out: (string | number)[][] | (string | number)[]; // mealy: out[state][input]; moore: out[state]
  init: number;
};
export type Preset = 'detect-101' | 'detect-110' | 'traffic' | 'vending';
export type Pair = { id: Preset; title: string; inputs: [string, string]; inLabel: string; outLabel: string; moore: Machine; mealy: Machine; binaryOut: boolean };

export const PRESETS: Preset[] = ['detect-101', 'detect-110', 'traffic', 'vending'];

export function build(id: Preset): Pair {
  switch (id) {
    case 'detect-110':
      return { id, title: 'Sequence detector 110', inputs: ['0', '1'], inLabel: 'x', outLabel: 'found', binaryOut: true,
        mealy: { kind: 'mealy', states: ['S0', 'S1', 'S2'], desc: ['no progress', 'seen 1', 'seen 11'], init: 0,
          delta: [[0, 1], [0, 2], [0, 2]], out: [[0, 0], [0, 0], [1, 0]] },
        moore: { kind: 'moore', states: ['S0', 'S1', 'S2', 'S3'], desc: ['no progress', 'seen 1', 'seen 11', 'seen 110'], init: 0,
          delta: [[0, 1], [0, 2], [3, 2], [0, 1]], out: [0, 0, 0, 1] } };
    case 'traffic':
      // input = car waiting on the side road. Output = (main light, side light)
      return { id, title: 'Traffic light (side-road sensor)', inputs: ['no car', 'car'], inLabel: 'car', outLabel: 'lights (main/side)', binaryOut: false,
        moore: { kind: 'moore', states: ['MG', 'MY', 'SG', 'SY'], desc: ['main green', 'main yellow', 'side green', 'side yellow'], init: 0,
          delta: [[0, 1], [2, 2], [3, 3], [0, 0]], out: ['G/R', 'Y/R', 'R/G', 'R/Y'] },
        mealy: { kind: 'mealy', states: ['M', 'S'], desc: ['main has right of way', 'side has right of way'], init: 0,
          delta: [[0, 1], [0, 0]], out: [['G/R', 'Y/R'], ['Y/R', 'R/G']] } as Machine };
    case 'vending':
      // 15c item, inputs nickel (N=5c) / dime (D=10c); output 1 = dispense
      return { id, title: 'Vending machine (15 c)', inputs: ['N', 'D'], inLabel: 'coin', outLabel: 'dispense', binaryOut: true,
        mealy: { kind: 'mealy', states: ['0c', '5c', '10c'], desc: ['nothing paid', '5 c paid', '10 c paid'], init: 0,
          delta: [[1, 2], [2, 0], [0, 0]], out: [[0, 0], [0, 1], [1, 1]] },
        moore: { kind: 'moore', states: ['0c', '5c', '10c', '15c'], desc: ['nothing paid', '5 c paid', '10 c paid', 'paid: dispense'], init: 0,
          delta: [[1, 2], [2, 3], [3, 3], [1, 2]], out: [0, 0, 0, 1] } };
    case 'detect-101':
    default:
      return { id: 'detect-101', title: 'Sequence detector 101', inputs: ['0', '1'], inLabel: 'x', outLabel: 'found', binaryOut: true,
        mealy: { kind: 'mealy', states: ['S0', 'S1', 'S2'], desc: ['no progress', 'seen 1', 'seen 10'], init: 0,
          delta: [[0, 1], [2, 1], [0, 1]], out: [[0, 0], [0, 0], [0, 1]] },
        moore: { kind: 'moore', states: ['S0', 'S1', 'S2', 'S3'], desc: ['no progress', 'seen 1', 'seen 10', 'seen 101'], init: 0,
          delta: [[0, 1], [2, 1], [0, 3], [2, 1]], out: [0, 0, 0, 1] } };
  }
}

export type Step = { t: number; x: number; from: number; to: number; out: string | number };
/** Run a machine over an input stream. Mealy out is sampled with x (before the edge); Moore out is the NEW state's output (after the edge). */
export function run(m: Machine, xs: number[]): { steps: Step[]; state: number } {
  let s = m.init; const steps: Step[] = [];
  xs.forEach((x, t) => {
    const to = m.delta[s][x];
    const out = m.kind === 'mealy' ? (m.out as (string | number)[][])[s][x] : (m.out as (string | number)[])[to];
    steps.push({ t, x, from: s, to, out }); s = to;
  });
  return { steps, state: s };
}
/** Moore output visible *during* cycle t (before input t is applied) is out[state_t]. */
export const mooreOutBefore = (m: Machine, state: number) => (m.out as (string | number)[])[state];
export const mealyOutNow = (m: Machine, state: number, x: number) => (m.out as (string | number)[][])[state][x];
/** Reference: overlapping occurrence of `pat` ending at each index. */
export function reference(xs: number[], pat: number[]): number[] {
  return xs.map((_, i) => i + 1 >= pat.length && pat.every((b, k) => xs[i - pat.length + 1 + k] === b) ? 1 : 0);
}
