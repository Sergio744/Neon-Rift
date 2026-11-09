// Sprites for the sandbox tools (weapon indices 7+) and the new pickups. Same conventions as
// sprites.js: guns face right, anchors are [grip, fore, muzzle] in sprite px.
import { gun, make } from './pixel.js';

export const TOOL_GUNS = [
  // 7 cutter: plasma torch with a glowing tip.
  gun(
    [
      '..kkkkkkkkkkkkkk....',
      '.kllwwwwllllllmkkk..',
      'kmmmmmmmmmmmmmmkcckk',
      'kddmmmmmmmmmmmmkcWck',
      '.kkkkdkkkkbkkkkkcckk',
      '....kdk..kbk....kk..',
      '....kdk..kkk........',
      '....kkk.............',
    ],
    [5, 5],
    [10, 5],
    [19, 3],
  ),
  // 8 builder: hazard-striped block press.
  gun(
    [
      '.kkkkkkkkkkkkkk..',
      'kyykyykyykyykykk.',
      'kyooooooooooooykk',
      'kyoNNNNNNNNNNoymk',
      'kyyyyyyyyyyyyyykk',
      '.kkkkdkkkkkkkkk..',
      '....kdk..........',
      '....kkk..........',
    ],
    [5, 5],
    [10, 4],
    [17, 3],
  ),
  // 9 sandstorm: sand tank feeding a blower nozzle.
  gun(
    [
      '..kkkkkkk............',
      '.kaaaaaaak.kkkkkkkkk.',
      'kaAaaaaaaAkkllllllllk',
      'kaaaaaaaaakmmmmmmmmmkk',
      'kaAaaaaaaAkmmmmmmmmmak',
      '.kaaaaaaakkddddddddkk.',
      '..kkkkkkkkdk.........',
      '.........kdk.........',
      '.........kkk.........',
    ],
    [10, 7],
    [14, 5],
    [21, 3.5],
  ),
  // 10 c4: detonator with antenna.
  gun(
    [
      '........kk',
      '.......krk',
      '......kk..',
      '.kkkkkkk..',
      'kmmmmmmmk.',
      'kmrmgmmmk.',
      'kmmmmmmmk.',
      'kkkdkkkkk.',
      '..kdk.....',
      '..kkk.....',
    ],
    [3, 8],
    [6, 6],
    [8, 2],
  ),
  // 11 quake: heavy purple shell launcher.
  gun(
    [
      '..kkkkkkkkkkkkkkkkkkk..',
      '.kvvwwllllllllllllvvkk.',
      'kkvvmmmmmmmmmmmmmmvvVkk',
      'kVvvmmmmmmmmmmmmmmvvVWk',
      'kkvvddddddddddddddvvVkk',
      '.kkkkkdkkkkkbkkkkkkkk..',
      '.....kdk...kbk.........',
      '.....kkk...kkk.........',
    ],
    [6, 6],
    [12, 6],
    [23, 3],
  ),
  // 12 sniper: long barrel, scope with a blue lens, wooden stock.
  gun(
    [
      '.......kkkkkkkkk..............',
      '......kbmmmmmmmck.............',
      '.......kkkdkkkkk..............',
      'kkkk.kkkkkkkkkkkkkkkkkkkkkkkk.',
      'kNNNkkmmmmmmmmmmllllllllllllkk',
      'knNNNmmmmmmmmmmmdddddddddddddk',
      'kNNNNkkkdkkkkkkkkkkkkkkkkkkkk.',
      '.kkkk..kdk....................',
      '.......kkk....................',
    ],
    [8, 6],
    [14, 5],
    [29, 4.5],
  ),
  // 13 AK-47: wooden stock and handguard, curved banana magazine, front sight post.
  gun(
    [
      '....................k...',
      '...kkkkkkkkkkkkkkkkkkkk.',
      'kkkkmmmmmmmmkkNNNNNkkkkk',
      'kNNkmmmmmmmmmkNNNNNkmmmW',
      'kNNNkkkkdkmmmkkkkkkkkkkk',
      '.kNNNk.kdk.kmmk.........',
      '..kkkk.kdk..kmmk........',
      '.......kkk...kmmk.......',
      '..............kkk.......',
    ],
    [8, 6],
    [16, 3],
    [23, 3.5],
  ),
  // 14 Blink Disc: split-rail phase launcher cradling a glowing cyan disc.
  gun(
    [
      '..kkkkkkkkkkkkkkkkkk..',
      '.kddwwllllllllccccWck.',
      'kkmmmmmmmmmmmmkccWWcck',
      'kddmmmmmmmmmmmkccWWcck',
      '.kkkkdkkkkbkkkkccccWck',
      '....kdk..kbk...kkkkkk.',
      '....kdk..kkk..........',
      '....kkk...............',
    ],
    [5, 5],
    [10, 5],
    [20, 3],
  ),
  // 15 Prism Rifle: crystalline magenta/cyan ricochet rifle with twin focusing lenses.
  gun(
    [
      '......kkkkkkk............',
      '.....kpccWccpk...........',
      '..kkkkkkkkkkkkkkkkkkkkkk.',
      'kkppwwllllcpcpcpclllllcck',
      'kPppmmmmmmcpcpcpcmmmmmWck',
      'kkPPddddddkkkkkkkkkkkkkk.',
      '.kkkkdkkkkbk.............',
      '....kdk..kbk.............',
      '....kkk..kkk.............',
    ],
    [5, 6],
    [11, 6],
    [24, 4],
  ),
  // 16 Vortex Orb: heavy dark-matter singularity cannon with violet containment coils.
  gun(
    [
      '..kkkkkkkkkkkkkkkkkkk...',
      '.kvvppwllllllllllppvvkk.',
      'kkvvpmmmmmcvcvcmmmmpvvpk',
      'kVvvpmmmmmvWvWvmmmmpvvWk',
      'kkvvpdddddcvcvcddddpvvpk',
      '.kkkkkdkkkkkbkkkkkkkkk..',
      '.....kdk...kbk..........',
      '.....kkk...kkk..........',
    ],
    [6, 6],
    [12, 6],
    [23, 3.5],
  ),
];

export const BLINK_DISC = make([
  '..kkkk..',
  '.kcccck.',
  'kcWWWWck',
  'kcWppWck',
  'kcWWWWck',
  '.kcccck.',
  '..kkkk..',
]);

export const VORTEX_CORE = make([
  '..kkkkk..',
  '.kvvpvvk.',
  'kvpkkkppk',
  'kvkkWkkvk',
  'kppkkkpvk',
  '.kvvpvvk.',
  '..kkkkk..',
]);

export const C4_CHARGE = make(['.kkkkk.', 'knNNNnk', 'kWkWkWk', 'knnnnnk', '.kkkkk.']);
export const C4_LIGHT = make(['r']);

export const QUAKE_SHELL = make(['.kkkkkk...', 'kvvvvvvkk.', 'kVvWvvvvvk', 'kvvvvvvkk.', '.kkkkkk...']);

export const AMMO_BOX = make([
  'kkkkkkkkk',
  'kGGGGGGGk',
  'kGgggggGk',
  'kkkkkkkkk',
  'kgyykyygk',
  'kgyykyygk',
  'kgggggggk',
  'kkkkkkkkk',
]);

export const PACK = make(['..kkk..', '.kmmmk.', 'kmlllmk', 'kmyyymk', 'kmlllmk', 'kmmmmmk', '.kkkkk.']);

// Hotbar lock glyph.
export const LOCK = make(['.kkk.', 'kl.lk', 'kl.lk', 'kkkkk', 'kyyyk', 'kykyk', 'kkkkk']);
