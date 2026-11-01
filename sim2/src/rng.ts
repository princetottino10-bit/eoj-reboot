// Seeded deterministic RNG (mulberry32). No Math.random / Date.now anywhere.

export type RngState = number;

export const seedRng = (seed: number): RngState => {
  const s = seed >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
};

/** Returns [float in [0,1), nextState]. Pure. */
export const nextFloat = (state: RngState): [number, RngState] => {
  let s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [v, s];
};

/** Returns [integer in [0,n), nextState]. */
export const nextInt = (state: RngState, n: number): [number, RngState] => {
  if (n <= 0) throw new Error(`nextInt: n must be > 0, got ${n}`);
  const [f, s] = nextFloat(state);
  return [Math.floor(f * n), s];
};

/** Fisher-Yates. Returns a new array; does not mutate the input. */
export const shuffle = <T>(items: readonly T[], state: RngState): [T[], RngState] => {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, ns] = nextInt(s, i + 1);
    s = ns;
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return [out, s];
};
