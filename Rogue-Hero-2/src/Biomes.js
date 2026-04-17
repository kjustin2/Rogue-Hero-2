// Biomes.js — RH2 biome definitions: palette, ambience, music tag, hazard.
// Each biome supplies a render config used by RoomManager + Renderer.
// Music tags map to existing tracks in /music; assignment can be tweaked
// once new tracks ship (see ROGUE_HERO_2.md note #2).

export const Biomes = {
  verdant: {
    id: 'verdant',
    name: 'Verdant Ruins',
    palette: {
      floor:   '#2a3b22',
      grid:    'rgba(120,200,90,0.10)',
      pillar:  '#3a4d2a',
      accent:  '#88cc55',
      ambient: '#b9e69b',
    },
    ambience: { kind: 'pollen', density: 0.4, color: '#cfe88a' },
    music: 'normal',
    hazard: { type: 'thorns', dps: 1, radius: 36 },
    postFx: { tint: 'rgba(60,120,60,0.04)' },
    bossHint: 'hollow_king',
  },
  frostforge: {
    id: 'frostforge',
    name: 'Frostforge',
    palette: {
      floor:   '#1a2530',
      grid:    'rgba(160,210,255,0.10)',
      pillar:  '#2a3a4a',
      accent:  '#88ccff',
      ambient: '#cfe7ff',
    },
    ambience: { kind: 'snow', density: 0.5, color: '#dceeff' },
    music: 'normal',
    hazard: { type: 'ice', friction: 0.55 },
    postFx: { tint: 'rgba(70,120,180,0.06)' },
  },
  cathedral: {
    id: 'cathedral',
    name: 'Ember Cathedral',
    palette: {
      floor:   '#2a1414',
      grid:    'rgba(255,140,80,0.10)',
      pillar:  '#3a1a18',
      accent:  '#ff7733',
      ambient: '#ffaa66',
    },
    ambience: { kind: 'ash', density: 0.45, color: '#ff8855' },
    music: 'boss',
    hazard: { type: 'lava', dps: 2, radius: 42 },
    postFx: { tint: 'rgba(160,40,20,0.06)' },
  },
  tide: {
    id: 'tide',
    name: 'Tide Halls',
    palette: {
      floor:   '#143040',
      grid:    'rgba(120,220,255,0.12)',
      pillar:  '#1a3a4a',
      accent:  '#33ddee',
      ambient: '#aaeeff',
    },
    ambience: { kind: 'bubbles', density: 0.35, color: '#aaddff' },
    music: 'normal',
    hazard: { type: 'tide_rise', interval: 12 },
    postFx: { tint: 'rgba(40,120,160,0.07)' },
  },
  voidline: {
    id: 'voidline',
    name: 'Voidline',
    palette: {
      floor:   '#10081f',
      grid:    'rgba(200,140,255,0.08)',
      pillar:  '#22113a',
      accent:  '#bb88ff',
      ambient: '#d4b5ff',
    },
    ambience: { kind: 'motes', density: 0.55, color: '#cc99ff' },
    music: 'boss',
    hazard: { type: 'gravity', radius: 80, pull: 60 },
    postFx: { tint: 'rgba(60,20,120,0.05)', chromaticAberration: 0.3 },
    bossHint: 'aurora',
  },
  clockwork: {
    id: 'clockwork',
    name: 'Clockwork Spire',
    palette: {
      floor:   '#221a10',
      grid:    'rgba(220,180,80,0.10)',
      pillar:  '#3a2a14',
      accent:  '#ddaa44',
      ambient: '#ffd88a',
    },
    ambience: { kind: 'steam', density: 0.4, color: '#ddccaa' },
    music: 'normal',
    hazard: { type: 'pressure', period: 4.5, dmg: 6, radius: 50 },
    postFx: { tint: 'rgba(160,120,40,0.05)' },
    bossHint: 'vault_engine',
  },
};

export const BiomeList = Object.values(Biomes);
export const BiomeIds = BiomeList.map(b => b.id);

// Pick biome for a floor — deterministic given a seeded RNG
export function pickBiomeForFloor(floor, rng) {
  // Each floor has 2 candidate biomes; rng picks within
  const tiers = [
    ['verdant', 'frostforge'],   // floor 1
    ['frostforge', 'cathedral'], // floor 2
    ['cathedral', 'tide'],       // floor 3
    ['tide', 'voidline'],        // floor 4
    ['voidline', 'clockwork'],   // floor 5
  ];
  const idx = Math.max(0, Math.min(tiers.length - 1, floor - 1));
  const pair = tiers[idx];
  const r = rng ? rng() : Math.random();
  return Biomes[pair[r < 0.5 ? 0 : 1]];
}
