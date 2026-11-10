// Shared colour table. Indices are local to each process (server and browser build the same
// maps in the same order, but nothing ever sends a palette index over the network).
export const PALETTE = ['#000000'];
const PAL_INDEX = new Map();

export function pal(hex) {
  const key = hex.toLowerCase();
  let i = PAL_INDEX.get(key);
  if (i === undefined) {
    if (PALETTE.length >= 256) throw new Error('palette full');
    i = PALETTE.length;
    PALETTE.push(key);
    PAL_INDEX.set(key, i);
  }
  return i;
}

// Colours the simulation creates at runtime, addressed by stable ids in ops.
export const ASH = ['#5d5866', '#6e6875', '#4a4552'];
export const BUILD = [
  ['#3ee6ff', '#1fb6d4'], // neon cyan (team 0)
  ['#ff4d9d', '#cc3178'], // rift magenta (team 1)
  ['#d9b36c', '#c49d56'], // sandstone (slot 2)
  ['#a8743f', '#8d5d30'], // wood
  ['#9a95a6', '#827d8f'], // stone
  ['#45d483', '#2aa862'], // plasma green
  ['#4b4560', '#3a354c'], // obsidian
];
export const SAND = ['#e8c77e', '#d9b264', '#f0d592', '#c9a258'];
export const CRYSTAL = ['#7ef9ff', '#3fc6e0', '#c8fdff'];
