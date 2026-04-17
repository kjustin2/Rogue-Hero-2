export const CardDefinitions = {
  // ── BASIC ─────────────────────────────────────────────────────
  strike: {
    id: 'strike', name: 'Strike', cost: 1, tempoShift: 10, rarity: 'common',
    damage: 10, range: 90, type: 'melee', color: '#ffffff',
    desc: 'Basic slash. Short range. +10 Tempo.'
  },
  lunge: {
    id: 'lunge', name: 'Lunge', cost: 2, tempoShift: 20, rarity: 'common',
    damage: 18, range: 140, type: 'melee', color: '#ffcc44',
    desc: 'Long reach thrust. +20 Tempo.'
  },
  chill_blade: {
    id: 'chill_blade', name: 'Chill Blade', cost: 1, tempoShift: -15, rarity: 'common',
    damage: 8, range: 90, type: 'melee', color: '#66ccff',
    desc: 'Cool tempo. -15 Tempo.'
  },
  heavy_crash: {
    id: 'heavy_crash', name: 'Heavy Crash', cost: 4, tempoShift: 22, rarity: 'uncommon',
    damage: 35, range: 110, type: 'melee', color: '#ff4444',
    slotWidth: 2,
    desc: 'Devastating blow. +22 Tempo. [2 SLOTS]'
  },

  // ── RANGED / AOE ──────────────────────────────────────────────
  piercing_surge: {
    id: 'piercing_surge', name: 'Surge', cost: 3, tempoShift: 25, rarity: 'uncommon',
    damage: 20, range: 200, type: 'projectile', color: '#44aaff',
    desc: 'Radial wave hits all in range. +25 Tempo.'
  },
  frost_nova: {
    id: 'frost_nova', name: 'Frost Nova', cost: 3, tempoShift: -18, rarity: 'uncommon',
    damage: 5, range: 160, type: 'projectile', color: '#aaeeff',
    desc: 'Stagger ALL nearby enemies 1s. -18 Tempo.'
  },
  arc_slash: {
    id: 'arc_slash', name: 'Arc Slash', cost: 2, tempoShift: 15, rarity: 'common',
    damage: 10, range: 120, type: 'cleave', color: '#ff8844',
    desc: 'Sweeping arc hits ALL nearby. +15 Tempo.'
  },
  chain_lightning: {
    id: 'chain_lightning', name: 'Chain Lightning', cost: 3, tempoShift: 20, rarity: 'rare',
    damage: 8, range: 250, type: 'projectile', color: '#ffff44',
    desc: 'Zaps everything in huge radius. +20 Tempo.',
    bonusCard: true
  },
  thunder_clap: {
    id: 'thunder_clap', name: 'Thunder Clap', cost: 4, tempoShift: 18, rarity: 'rare',
    damage: 15, range: 180, type: 'projectile', color: '#ffdd00',
    slotWidth: 2,
    desc: 'Massive AoE + stagger. +18 Tempo. [2 SLOTS]',
    bonusCard: true
  },

  // ── MOBILITY ──────────────────────────────────────────────────
  dash_strike: {
    id: 'dash_strike', name: 'Dash Strike', cost: 2, tempoShift: 10, rarity: 'common',
    damage: 15, range: 180, type: 'dash', color: '#ffea00',
    desc: 'Teleport to target and slash. +10 Tempo.'
  },
  phantom_step: {
    id: 'phantom_step', name: 'Phantom Step', cost: 1, tempoShift: 5, rarity: 'rare',
    damage: 6, range: 220, type: 'dash', color: '#cc88ff',
    desc: 'Long-range dash, light damage. +5 Tempo.',
    bonusCard: true
  },

  // ── UTILITY / SUSTAIN ─────────────────────────────────────────
  vampire_bite: {
    id: 'vampire_bite', name: 'Vampire Bite', cost: 3, tempoShift: -20, rarity: 'uncommon',
    damage: 12, range: 90, type: 'melee', color: '#cc44cc',
    desc: 'Heal 1 HP on kill. -20 Tempo.'
  },
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', cost: 2, tempoShift: -10, rarity: 'common',
    damage: 8, range: 80, type: 'melee', color: '#88aacc',
    desc: 'Stagger target 0.8s. -10 Tempo.'
  },
  blood_pact: {
    id: 'blood_pact', name: 'Blood Pact', cost: 2, tempoShift: 28, rarity: 'rare',
    damage: 65, range: 140, type: 'melee', color: '#ff2266',
    desc: 'Costs 1 HP. Brutal damage. +28 Tempo.',
    bonusCard: true
  },
  iron_wall: {
    id: 'iron_wall', name: 'Iron Wall', cost: 3, tempoShift: -15, rarity: 'rare',
    damage: 0, range: 130, type: 'projectile', color: '#aaaacc',
    desc: 'No damage. Stagger ALL nearby 1.5s. -15 Tempo.',
    bonusCard: true
  },

  // ── RANGED SHOTS (fire actual projectiles) ────────────────────
  quick_shot: {
    id: 'quick_shot', name: 'Quick Shot', cost: 1, tempoShift: 8, rarity: 'common',
    damage: 12, range: 600, type: 'shot', color: '#88ffdd',
    desc: 'Fire a fast bolt toward cursor. +8 Tempo.'
  },
  tri_shot: {
    id: 'tri_shot', name: 'Tri-Shot', cost: 2, tempoShift: 18, rarity: 'uncommon',
    damage: 10, range: 500, type: 'shot', color: '#ffcc44',
    desc: 'Fire 3 spread bolts. +18 Tempo.',
    shotCount: 3, shotSpread: 0.25
  },
  power_shot: {
    id: 'power_shot', name: 'Power Shot', cost: 3, tempoShift: 28, rarity: 'uncommon',
    damage: 32, range: 700, type: 'shot', color: '#ff6644',
    desc: 'Slow heavy bolt, high damage. +28 Tempo.',
    shotSpeed: 200, shotCount: 1
  },
  barrage: {
    id: 'barrage', name: 'Barrage', cost: 3, tempoShift: 14, rarity: 'uncommon',
    damage: 7, range: 500, type: 'shot', color: '#ff8844',
    desc: 'Fire 5 spread bolts. +14 Tempo.',
    shotCount: 5, shotSpread: 0.35
  },
  freeze_bolt: {
    id: 'freeze_bolt', name: 'Freeze Bolt', cost: 2, tempoShift: -10, rarity: 'common',
    damage: 4, range: 550, type: 'shot', color: '#aaeeff',
    desc: 'Low dmg, freezes target 1.2s. -10 Tempo.',
    freezes: true, shotSpeed: 300
  },

  // ── MELEE ─────────────────────────────────────────────────────
  gut_rend: {
    id: 'gut_rend', name: 'Gut Rend', cost: 2, tempoShift: 12, rarity: 'common',
    damage: 14, range: 90, type: 'melee', color: '#cc4422',
    desc: 'Slash that bleeds for 3 dmg over 3s. +12 Tempo.',
    bleed: true
  },
  counter_slash: {
    id: 'counter_slash', name: 'Counter', cost: 1, tempoShift: 5, rarity: 'uncommon',
    damage: 20, range: 80, type: 'melee', color: '#ff8844',
    desc: 'High dmg. Bonus 1.5× if used within 0.5s of dodge. +5 Tempo.',
    postDodgeBonus: true
  },
  spin_attack: {
    id: 'spin_attack', name: 'Spin Attack', cost: 3, tempoShift: 20, rarity: 'uncommon',
    damage: 12, range: 130, type: 'cleave', color: '#ff6622',
    desc: 'Sweeping spin hits ALL nearby. +20 Tempo.'
  },
  double_slash: {
    id: 'double_slash', name: 'Double Slash', cost: 2, tempoShift: 16, rarity: 'common',
    damage: 22, range: 85, type: 'melee', color: '#ffaaaa',
    desc: 'Two rapid strikes. +16 Tempo.'
  },
  void_lance: {
    id: 'void_lance', name: 'Void Lance', cost: 3, tempoShift: 20, rarity: 'uncommon',
    damage: 30, range: 750, type: 'shot', color: '#9944ff',
    desc: 'Heavy void bolt. Slow but devastating. +20 Tempo.',
    shotSpeed: 180, shotCount: 1
  },
  cold_wave: {
    id: 'cold_wave', name: 'Cold Wave', cost: 2, tempoShift: -20, rarity: 'uncommon',
    damage: 3, range: 120, type: 'projectile', color: '#88ccff',
    desc: 'Icy shockwave staggering all nearby 0.8s. -20 Tempo.'
  },

  // ── COLD ZONE IDENTITY CARDS ──────────────────────────────────
  ice_spike: {
    id: 'ice_spike', name: 'Ice Spike', cost: 2, tempoShift: -20, rarity: 'uncommon',
    damage: 30, range: 120, type: 'melee', color: '#88ddff',
    desc: 'Deals 3× damage when in COLD zone (<30 Tempo). -20 Tempo.',
    coldMultiplier: 3
  },
  glacial_press: {
    id: 'glacial_press', name: 'Glacial Press', cost: 3, tempoShift: -25, rarity: 'uncommon',
    damage: 8, range: 160, type: 'projectile', color: '#66ccff',
    desc: 'In COLD zone: freeze all nearby 2s + heal 1 HP. -25 Tempo.',
    coldHeal: 1, coldStagger: 2.0
  },
  frost_reave: {
    id: 'frost_reave', name: 'Frost Reave', cost: 2, tempoShift: -18, rarity: 'rare',
    damage: 14, range: 130, type: 'cleave', color: '#aaeeff',
    desc: 'Cleave all nearby. Hits twice if in COLD zone. -18 Tempo.',
    coldDoubleHit: true, bonusCard: true
  },

  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', cost: 4, tempoShift: 30, rarity: 'uncommon',
    damage: 18, range: 160, type: 'cleave', color: '#ff9944',
    slotWidth: 2,
    desc: 'Massive spinning cleave — hits everything nearby. +30 Tempo. [2 SLOTS]'
  },

  // ── UTILITY ───────────────────────────────────────────────────
  second_wind: {
    id: 'second_wind', name: 'Second Wind', cost: 2, tempoShift: -15, rarity: 'rare',
    damage: 0, range: 100, type: 'utility', color: '#ff4488',
    desc: 'Heal 1 HP. -15 Tempo.',
    bonusCard: true
  },
  adrenaline: {
    id: 'adrenaline', name: 'Adrenaline', cost: 1, tempoShift: 25, rarity: 'rare',
    damage: 0, range: 100, type: 'utility', color: '#ffff44',
    desc: 'Instantly add +25 Tempo. No damage.',
    bonusCard: true
  },
  smoke_screen: {
    id: 'smoke_screen', name: 'Smoke Screen', cost: 2, tempoShift: -20, rarity: 'rare',
    damage: 0, range: 100, type: 'utility', color: '#aaaaaa',
    desc: 'Grants 0.8s of full invincibility. -20 Tempo.',
    bonusCard: true
  },

  // ── HIGH RISK ─────────────────────────────────────────────────
  berserk: {
    id: 'berserk', name: 'Berserk', cost: 2, tempoShift: 22, rarity: 'uncommon',
    damage: 25, range: 80, type: 'melee', color: '#ff2222',
    desc: 'Massive damage, tight range. +22 Tempo.'
  },
  whip_crack: {
    id: 'whip_crack', name: 'Whip Crack', cost: 1, tempoShift: 5, rarity: 'common',
    damage: 6, range: 200, type: 'melee', color: '#ffdd88',
    desc: 'Longest melee reach, low damage. +5 Tempo.'
  },
  execute: {
    id: 'execute', name: 'Execute', cost: 4, tempoShift: 18, rarity: 'rare',
    damage: 50, range: 80, type: 'melee', color: '#ff0000',
    slotWidth: 2,
    desc: 'Finishing blow. 50 base DMG. +18 Tempo. [2 SLOTS]',
    bonusCard: true
  },
  tempo_surge: {
    id: 'tempo_surge', name: 'Tempo Surge', cost: 1, tempoShift: -18, rarity: 'rare',
    damage: 3, range: 100, type: 'melee', color: '#44ffaa',
    desc: 'Almost no damage. Tempo drop. -18 Tempo.',
    bonusCard: true
  },
  shadow_mark: {
    id: 'shadow_mark', name: 'Shadow Mark', cost: 2, tempoShift: 15, rarity: 'rare',
    damage: 20, range: 150, type: 'dash', color: '#8844bb',
    desc: 'Dash + mark target (next hit crits). +15 Tempo.',
    bonusCard: true
  },
  glass_cannon: {
    id: 'glass_cannon', name: 'Glass Cannon', cost: 3, tempoShift: 28, rarity: 'rare',
    damage: 150, range: 130, type: 'melee', color: '#ff0044',
    desc: 'Costs 2 HP. Devastating blow. Staggers 0.5s. +28 Tempo.',
    bonusCard: true, selfDamage: 2, stagger: 0.5
  },
  reaper: {
    id: 'reaper', name: 'Reaper', cost: 4, tempoShift: 18, rarity: 'rare',
    damage: 30, range: 200, type: 'cleave', color: '#8800ff',
    slotWidth: 2,
    desc: 'AoE 200r. Instakills enemies below 15% HP. +18 Tempo. [2 SLOTS]',
    bonusCard: true, executeLow: true
  },

  // ── NEW MELEE ─────────────────────────────────────────────────────
  frenzy: {
    id: 'frenzy', name: 'Frenzy', cost: 3, tempoShift: 18, rarity: 'uncommon',
    damage: 10, range: 80, type: 'melee', color: '#ff6644',
    desc: 'Hits target 3× rapidly. Each hit triggers combo. +18 Tempo.',
    multiHit: 3
  },
  earthshaker: {
    id: 'earthshaker', name: 'Earthshaker', cost: 4, tempoShift: 25, rarity: 'rare',
    damage: 40, range: 160, type: 'cleave', color: '#bb6622',
    slotWidth: 2,
    desc: 'Forward cone slam. +50% dmg in Hot/Critical. +25 Tempo. [2 SLOTS]',
    bonusCard: true, hotBonus: true
  },
  riposte: {
    id: 'riposte', name: 'Riposte', cost: 1, tempoShift: 8, rarity: 'uncommon',
    damage: 28, range: 80, type: 'melee', color: '#ffaa44',
    desc: 'High damage. Free (0 AP) if used within 0.6s of a dodge. +8 Tempo.',
    riposte: true
  },
  sweeping_blow: {
    id: 'sweeping_blow', name: 'Sweeping Blow', cost: 2, tempoShift: 12, rarity: 'common',
    damage: 9, range: 110, type: 'cleave', color: '#ffcc88',
    desc: 'Wide arc, low damage per hit. Good tempo builder. +12 Tempo.'
  },
  wraithblade: {
    id: 'wraithblade', name: 'Wraithblade', cost: 3, tempoShift: 15, rarity: 'uncommon',
    damage: 25, range: 200, type: 'dash', color: '#9966ff',
    desc: 'Dash through target, brief invulnerability. +15 Tempo.',
    dashThrough: true
  },
  death_blow: {
    id: 'death_blow', name: 'Death Blow', cost: 4, tempoShift: 22, rarity: 'rare',
    damage: 45, range: 85, type: 'melee', color: '#cc0044',
    slotWidth: 2,
    desc: 'Triple damage vs enemies below 20% HP. +22 Tempo. [2 SLOTS]',
    bonusCard: true, executeLowMult: true
  },
  flicker: {
    id: 'flicker', name: 'Flicker', cost: 1, tempoShift: 6, rarity: 'common',
    damage: 8, range: 75, type: 'melee', color: '#ffeeaa',
    desc: 'Fast poke. On miss, AP is refunded. +6 Tempo.',
    apRefundOnMiss: true
  },
  whip_lash: {
    id: 'whip_lash', name: 'Whip Lash', cost: 2, tempoShift: 14, rarity: 'common',
    damage: 16, range: 180, type: 'melee', color: '#ffdd88',
    desc: 'Long reach. Slows target 50% for 0.5s. +14 Tempo.',
    slow: true
  },

  // ── NEW SHOTS ─────────────────────────────────────────────────────
  ricochet: {
    id: 'ricochet', name: 'Ricochet', cost: 2, tempoShift: 16, rarity: 'uncommon',
    damage: 14, range: 600, type: 'shot', color: '#aaffcc',
    desc: 'Bolt bounces to 2 nearby enemies on hit (−25% dmg each). +16 Tempo.',
    shotSpeed: 420, shotCount: 1, ricochetBounces: 2
  },
  void_pulse: {
    id: 'void_pulse', name: 'Void Pulse', cost: 1, tempoShift: 5, rarity: 'common',
    damage: 7, range: 500, type: 'shot', color: '#aa88ff',
    desc: 'Instant bolt toward cursor. Very cheap. +5 Tempo.',
    shotSpeed: 600, shotCount: 1
  },
  cluster_shot: {
    id: 'cluster_shot', name: 'Cluster Shot', cost: 3, tempoShift: 22, rarity: 'uncommon',
    damage: 18, range: 450, type: 'shot', color: '#ffbb44',
    desc: 'Explodes on impact for 80px AoE. +22 Tempo.',
    shotSpeed: 380, shotCount: 1, clusterAoE: 80
  },
  snipers_mark: {
    id: 'snipers_mark', name: "Sniper's Mark", cost: 3, tempoShift: 20, rarity: 'rare',
    damage: 20, range: 900, type: 'shot', color: '#ff4488',
    desc: 'Extreme range. Instakills enemies below 18% HP. +20 Tempo.',
    shotSpeed: 160, shotCount: 1, executeLowShot: 0.18,
    bonusCard: true
  },
  charged_bolt: {
    id: 'charged_bolt', name: 'Charged Bolt', cost: 2, tempoShift: 18, rarity: 'uncommon',
    damage: 28, range: 700, type: 'shot', color: '#aaddff',
    desc: 'Large hitbox bolt, pierces 1 enemy. +18 Tempo.',
    shotSpeed: 200, shotCount: 1, piercingShot: true
  },

  // ── NEW PROJECTILE AoE ─────────────────────────────────────────────
  war_cry: {
    id: 'war_cry', name: 'War Cry', cost: 2, tempoShift: 20, rarity: 'uncommon',
    damage: 0, range: 220, type: 'projectile', color: '#ffaa22',
    desc: 'No damage. Stagger all 1.2s + player +20% speed for 1.5s. +20 Tempo.',
    warCry: true
  },
  leech_field: {
    id: 'leech_field', name: 'Leech Field', cost: 3, tempoShift: -18, rarity: 'rare',
    damage: 8, range: 140, type: 'projectile', color: '#cc44cc',
    desc: 'Damages all in range. Heal 1 HP per enemy hit (cap 2). -18 Tempo.',
    bonusCard: true, leech: true
  },
  shockwave: {
    id: 'shockwave', name: 'Shockwave', cost: 3, tempoShift: 22, rarity: 'uncommon',
    damage: 12, range: 175, type: 'projectile', color: '#88ddff',
    desc: 'Damages + knocks enemies 80px away from player. +22 Tempo.',
    knockback: 80
  },
  soul_drain: {
    id: 'soul_drain', name: 'Soul Drain', cost: 4, tempoShift: -25, rarity: 'rare',
    damage: 6, range: 160, type: 'projectile', color: '#8833cc',
    slotWidth: 2,
    desc: 'Damage all in range. Steals 15 Tempo from each enemy hit. -25 Tempo. [2 SLOTS]',
    bonusCard: true, tempoSteal: 15
  },

  // ── NEW UTILITY ─────────────────────────────────────────────────────
  tempo_flip: {
    id: 'tempo_flip', name: 'Tempo Flip', cost: 1, tempoShift: 0, rarity: 'uncommon',
    damage: 0, range: 100, type: 'utility', color: '#44ffff',
    desc: 'If Tempo>50: −30. If Tempo≤50: +30. Snaps toward edge.',
    tempoFlip: true
  },
  phase_step: {
    id: 'phase_step', name: 'Phase Step', cost: 2, tempoShift: 0, rarity: 'uncommon',
    damage: 0, range: 100, type: 'utility', color: '#ccaaff',
    desc: 'Full invincibility for 0.5s. No tempo cost. Not a dodge.',
    phaseStep: true
  },
  marked_for_death: {
    id: 'marked_for_death', name: 'Marked for Death', cost: 2, tempoShift: 10, rarity: 'rare',
    damage: 0, range: 250, type: 'utility', color: '#ff6666',
    desc: 'Nearest enemy takes 2× damage from all sources for 4s. +10 Tempo.',
    bonusCard: true, markForDeath: true
  },
  berserkers_oath: {
    id: 'berserkers_oath', name: "Berserker's Oath", cost: 3, tempoShift: 45, rarity: 'rare',
    damage: 0, range: 100, type: 'utility', color: '#ff3300',
    desc: 'Lose 2 HP. Next 5 attacks: free AP + infinite combo window. +45 Tempo.',
    bonusCard: true, berserkerOath: true
  },
  last_stand: {
    id: 'last_stand', name: 'Last Stand', cost: 3, tempoShift: 35, rarity: 'rare',
    damage: 120, range: 300, type: 'projectile', color: '#ff8800',
    desc: 'Usable only at ≤2 HP. Massive AoE. Kills all → restore 2 HP. +35 Tempo.',
    bonusCard: true, lastStand: true
  },
  mirror_strike: {
    id: 'mirror_strike', name: 'Mirror Strike', cost: 3, tempoShift: 15, rarity: 'rare',
    damage: 12, range: 100, type: 'melee', color: '#aaffff',
    desc: 'Attacks fire in all 4 cardinal directions simultaneously. +15 Tempo.',
    bonusCard: true, mirrorStrike: true
  },

  // ── HIGH RISK / CHARACTER-SPECIFIC ────────────────────────────────
  deaths_bargain: {
    id: 'deaths_bargain', name: "Death's Bargain", cost: 2, tempoShift: 38, rarity: 'rare',
    damage: 175, range: 140, type: 'melee', color: '#cc0000',
    desc: 'Costs 2 HP. Cannot use at ≤2 HP. 175 flat damage. +38 Tempo.',
    bonusCard: true, deathsBargain: true
  },
  resonant_pulse: {
    id: 'resonant_pulse', name: 'Resonant Pulse', cost: 2, tempoShift: -5, rarity: 'rare',
    damage: 20, range: 110, type: 'projectile', color: '#00eedd',
    desc: 'Double damage when Tempo 45–55. For Echo. -5 Tempo.',
    bonusCard: true, resonantPulse: true
  },
  iron_retort: {
    id: 'iron_retort', name: 'Iron Retort', cost: 1, tempoShift: 10, rarity: 'uncommon',
    damage: 15, range: 90, type: 'melee', color: '#ddaa22',
    desc: '+8 bonus damage per Guard stack. For Vanguard. +10 Tempo.',
    ironRetort: true
  },

  // ── BEAM ─────────────────────────────────────────────────────────
  lancer: {
    id: 'lancer', name: 'Lancer', cost: 2, tempoShift: 14, rarity: 'common',
    damage: 22, range: 900, type: 'beam', color: '#aaddff',
    desc: 'Beam hits first enemy in line. +14 Tempo.'
  },
  piercer: {
    id: 'piercer', name: 'Piercer', cost: 3, tempoShift: 18, rarity: 'uncommon',
    damage: 18, range: 900, type: 'beam', color: '#44ccff',
    desc: 'Full-pierce beam hits every enemy on the line. +18 Tempo.',
    beamPierce: true
  },
  null_ray: {
    id: 'null_ray', name: 'Null Ray', cost: 2, tempoShift: -12, rarity: 'uncommon',
    damage: 10, range: 900, type: 'beam', color: '#88aacc',
    desc: 'Beam cancels the target\'s telegraph. -12 Tempo.',
    nullRay: true
  },
  sunbeam: {
    id: 'sunbeam', name: 'Sunbeam', cost: 4, tempoShift: 28, rarity: 'rare',
    damage: 30, range: 900, type: 'beam', color: '#ffee44',
    slotWidth: 2, beamWidth: 20, beamPierce: true,
    desc: 'Wide pierce beam hits all enemies on the line. +28 Tempo. [2 SLOTS]',
    bonusCard: true
  },
  cold_beam: {
    id: 'cold_beam', name: 'Cold Beam', cost: 1, tempoShift: -8, rarity: 'common',
    damage: 6, range: 900, type: 'beam', color: '#88ccff',
    desc: 'Beam stagger first hit 1.5s. -8 Tempo.',
    coldBeam: true
  },
  tempo_blade_beam: {
    id: 'tempo_blade_beam', name: 'Tempo Blade', cost: 3, tempoShift: 0, rarity: 'rare',
    damage: 0, range: 900, type: 'beam', color: '#ff88ff',
    desc: 'Beam damage = current Tempo (0-100). +0 Tempo.',
    bonusCard: true, tempoBlade: true
  },

  // ── TRAP ─────────────────────────────────────────────────────────
  snare: {
    id: 'snare', name: 'Snare', cost: 2, tempoShift: -10, rarity: 'common',
    damage: 5, range: 400, type: 'trap', color: '#cc8844',
    desc: 'Place a snare at cursor. Stagger enemy that steps in 2s. -10 Tempo.',
    trapRadius: 30, trapStagger: 2.0, trapLife: 6.0
  },
  flashbang_trap: {
    id: 'flashbang_trap', name: 'Flashbang', cost: 2, tempoShift: 12, rarity: 'uncommon',
    damage: 0, range: 400, type: 'trap', color: '#ffeeaa',
    desc: 'Place flashbang. On trigger: stagger all in 120px for 1.2s. +12 Tempo.',
    trapRadius: 40, trapAoE: 120, trapStagger: 1.2, trapLife: 6.0
  },
  landmine: {
    id: 'landmine', name: 'Landmine', cost: 3, tempoShift: 20, rarity: 'uncommon',
    damage: 35, range: 400, type: 'trap', color: '#ffaa44',
    desc: 'Place landmine at cursor. High damage on trigger. +20 Tempo.',
    trapRadius: 35, trapLife: 8.0
  },
  freeze_mine: {
    id: 'freeze_mine', name: 'Freeze Mine', cost: 2, tempoShift: -15, rarity: 'uncommon',
    damage: 8, range: 400, type: 'trap', color: '#88aaff',
    desc: 'Place mine that freezes trigger for 3s. -15 Tempo.',
    trapRadius: 35, trapFreeze: 3.0, trapLife: 6.0
  },
  volatile_rune_trap: {
    id: 'volatile_rune_trap', name: 'Volatile Rune', cost: 3, tempoShift: 25, rarity: 'rare',
    damage: 20, range: 400, type: 'trap', color: '#ff6600',
    desc: 'AoE 100px on trigger. Doubles if Critical Tempo. +25 Tempo.',
    bonusCard: true, trapRadius: 40, trapAoE: 100, trapVolatile: true, trapLife: 8.0
  },

  // ── ORBIT ─────────────────────────────────────────────────────────
  blade_ring: {
    id: 'blade_ring', name: 'Blade Ring', cost: 3, tempoShift: 16, rarity: 'common',
    damage: 8, range: 80, type: 'orbit', color: '#ff8844',
    desc: 'Spawn 3 orbiting blades (80px, 3s). +16 Tempo.',
    orbCount: 3, orbRadius: 80, orbLife: 3.0, orbSpeed: 2.5
  },
  frost_ring: {
    id: 'frost_ring', name: 'Frost Ring', cost: 3, tempoShift: -18, rarity: 'uncommon',
    damage: 4, range: 90, type: 'orbit', color: '#88ccff',
    desc: 'Spawn 2 frost orbs (90px). Each hit freezes 0.8s. -18 Tempo.',
    orbCount: 2, orbRadius: 90, orbLife: 4.0, orbSpeed: 2.0, orbFreeze: 0.8
  },
  raging_halo: {
    id: 'raging_halo', name: 'Raging Halo', cost: 4, tempoShift: 24, rarity: 'uncommon',
    damage: 14, range: 100, type: 'orbit', color: '#ff4400',
    desc: '4 fast orbs (100px, 2s). +24 Tempo.',
    orbCount: 4, orbRadius: 100, orbLife: 2.0, orbSpeed: 4.0
  },
  void_ring: {
    id: 'void_ring', name: 'Void Ring', cost: 2, tempoShift: 8, rarity: 'common',
    damage: 6, range: 60, type: 'orbit', color: '#8844cc',
    desc: 'Cheap 2-orb ring (60px). +8 Tempo.',
    orbCount: 2, orbRadius: 60, orbLife: 3.0, orbSpeed: 3.0
  },
  death_spiral: {
    id: 'death_spiral', name: 'Death Spiral', cost: 4, tempoShift: 30, rarity: 'rare',
    damage: 20, range: 60, type: 'orbit', color: '#cc0066',
    slotWidth: 2,
    desc: '3 orbs spiral outward 60→180px over 3s. +30 Tempo. [2 SLOTS]',
    bonusCard: true, orbCount: 3, orbRadius: 60, orbLife: 3.0, orbSpeed: 3.0, orbSpiral: true
  },

  // ── CHANNEL ───────────────────────────────────────────────────────
  flamethrower: {
    id: 'flamethrower', name: 'Flamethrower', cost: 1, tempoShift: 2, rarity: 'uncommon',
    damage: 0, range: 120, type: 'channel', color: '#ff5500',
    desc: 'Hold: fire cone (120px). 6 dmg/tick, +2 Tempo/tick, 0.5 AP/s. -uncommon',
    tickDamage: 6, tickRate: 0.08, apDrainRate: 0.5, channelRange: 120, channelType: 'cone'
  },
  lightning_arc_chan: {
    id: 'lightning_arc_chan', name: 'Lightning Arc', cost: 1, tempoShift: 3, rarity: 'rare',
    damage: 0, range: 200, type: 'channel', color: '#ffff44',
    desc: 'Hold: arc to nearest enemy (200px), jumps to chain. 8 dmg/tick, +3/tick.',
    bonusCard: true, tickDamage: 8, tickRate: 0.1, apDrainRate: 0.4, channelRange: 200, channelType: 'arc'
  },
  drain_beam_chan: {
    id: 'drain_beam_chan', name: 'Drain Beam', cost: 1, tempoShift: -2, rarity: 'uncommon',
    damage: 0, range: 180, type: 'channel', color: '#cc44cc',
    desc: 'Hold: beam that steals Tempo (-5 enemy, +3 you). 4 dmg/tick.',
    tickDamage: 4, tickRate: 0.1, apDrainRate: 0.3, channelRange: 180, channelType: 'drain'
  },

  // ── SIGIL ─────────────────────────────────────────────────────────
  hot_rune: {
    id: 'hot_rune', name: 'Hot Rune', cost: 2, tempoShift: 8, rarity: 'uncommon',
    damage: 40, range: 150, type: 'sigil', color: '#ff4400',
    desc: 'Place rune. Fires 150px AoE when Tempo enters Hot (70+). +8 Tempo.',
    sigilTrigger: 'enterHot', sigilAoE: 150
  },
  cold_rune: {
    id: 'cold_rune', name: 'Cold Rune', cost: 2, tempoShift: -8, rarity: 'uncommon',
    damage: 0, range: 200, type: 'sigil', color: '#4488ff',
    desc: 'Place rune. Freezes all in 200px when Tempo enters Cold (<30). -8 Tempo.',
    sigilTrigger: 'enterCold', sigilAoE: 200, sigilFreeze: 2.5
  },
  crash_rune: {
    id: 'crash_rune', name: 'Crash Rune', cost: 3, tempoShift: 10, rarity: 'rare',
    damage: 60, range: 180, type: 'sigil', color: '#ff2200',
    desc: 'Place rune. Detonates on any auto-crash. 60 AoE + 4 orbit orbs. +10 Tempo.',
    bonusCard: true, sigilTrigger: 'crash', sigilAoE: 180
  },
  resonance_rune: {
    id: 'resonance_rune', name: 'Resonance Rune', cost: 2, tempoShift: -5, rarity: 'rare',
    damage: 0, range: 150, type: 'sigil', color: '#00eedd',
    desc: 'Place rune. When Tempo is 45-55: double damage for 3s. -5 Tempo.',
    bonusCard: true, sigilTrigger: 'resonance', sigilAoE: 150
  },
  blood_rune: {
    id: 'blood_rune', name: 'Blood Rune', cost: 3, tempoShift: 15, rarity: 'rare',
    damage: 0, range: 0, type: 'sigil', color: '#ff2255',
    desc: 'Place rune. On taking damage: heal 2 HP + gain 30 Tempo. +15 Tempo.',
    bonusCard: true, sigilTrigger: 'takeDamage'
  },

  // ── ECHO ─────────────────────────────────────────────────────────
  phantom_slash: {
    id: 'phantom_slash', name: 'Phantom Slash', cost: 2, tempoShift: 10, rarity: 'uncommon',
    damage: 28, range: 90, type: 'echo', color: '#cc88ff',
    desc: 'After 0.7s: ghost executes melee at your position. +10 Tempo.',
    echoDelay: 0.7, echoType: 'melee'
  },
  delayed_nova: {
    id: 'delayed_nova', name: 'Delayed Nova', cost: 3, tempoShift: -15, rarity: 'uncommon',
    damage: 12, range: 160, type: 'echo', color: '#aaeeff',
    desc: 'After 0.8s: frost nova at your position. Stagger all 1s. -15 Tempo.',
    echoDelay: 0.8, echoType: 'nova'
  },
  time_bomb: {
    id: 'time_bomb', name: 'Time Bomb', cost: 4, tempoShift: 22, rarity: 'rare',
    damage: 50, range: 150, type: 'echo', color: '#ffcc00',
    slotWidth: 2,
    desc: 'After 1.2s: massive 150px AoE. Damage scales with Tempo at detonation. +22 Tempo. [2 SLOTS]',
    bonusCard: true, echoDelay: 1.2, echoType: 'bomb'
  },
  ghost_step_echo: {
    id: 'ghost_step_echo', name: 'Ghost Step', cost: 2, tempoShift: 6, rarity: 'common',
    damage: 18, range: 90, type: 'echo', color: '#88aaff',
    desc: 'After 0.5s: ghost dashes to nearest enemy at your original position. +6 Tempo.',
    echoDelay: 0.5, echoType: 'dash'
  },
  aftershock: {
    id: 'aftershock', name: 'Aftershock', cost: 3, tempoShift: 18, rarity: 'uncommon',
    damage: 20, range: 120, type: 'echo', color: '#ff8844',
    desc: 'After 0.9s: repeats last melee/cleave hit at your position. +18 Tempo.',
    echoDelay: 0.9, echoType: 'repeat'
  },

  // ── GROUND ───────────────────────────────────────────────────────
  tremor: {
    id: 'tremor', name: 'Tremor', cost: 2, tempoShift: 14, rarity: 'common',
    damage: 18, range: 400, type: 'ground', color: '#cc8833',
    desc: 'Ground wave (400px, 60px wide). Knocks enemies 60px. +14 Tempo.',
    waveWidth: 30, waveSpeed: 800, waveKnockback: 60
  },
  fissure: {
    id: 'fissure', name: 'Fissure', cost: 4, tempoShift: 26, rarity: 'uncommon',
    damage: 30, range: 500, type: 'ground', color: '#aa6600',
    slotWidth: 2,
    desc: 'Long wave. Leaves damaging zone for 2s (8/s). +26 Tempo. [2 SLOTS]',
    waveWidth: 35, waveSpeed: 700, waveLeavesZone: true
  },
  void_rift: {
    id: 'void_rift', name: 'Void Rift', cost: 3, tempoShift: 20, rarity: 'uncommon',
    damage: 22, range: 450, type: 'ground', color: '#6622cc',
    desc: 'Rift wave pulls all hit enemies 80px toward path center. +20 Tempo.',
    waveWidth: 30, waveSpeed: 750, wavePull: 80
  },
  glacier_push: {
    id: 'glacier_push', name: 'Glacier Push', cost: 3, tempoShift: -20, rarity: 'uncommon',
    damage: 10, range: 450, type: 'ground', color: '#88aaff',
    desc: 'Ice wave pushes all hit enemies 120px away. Stagger 0.5s. -20 Tempo.',
    waveWidth: 30, waveSpeed: 700, wavePushBack: 120, waveStagger: 0.5
  },
  judgment_line: {
    id: 'judgment_line', name: 'Judgment Line', cost: 4, tempoShift: 32, rarity: 'rare',
    damage: 45, range: 1200, type: 'ground', color: '#ffdd22',
    slotWidth: 2,
    desc: 'Full-room wave, stagger all hit 0.8s. +32 Tempo. [2 SLOTS]',
    bonusCard: true, waveWidth: 35, waveSpeed: 1100, waveStagger: 0.8
  },

  // ── COUNTER ───────────────────────────────────────────────────────
  parry_card: {
    id: 'parry_card', name: 'Parry', cost: 1, tempoShift: 15, rarity: 'uncommon',
    damage: 35, range: 90, type: 'counter', color: '#ffdd44',
    desc: 'Arm 0.4s parry. If hit: negate damage + 35 dmg counter. +15 Tempo.',
    parryWindow: 0.4, counterDmg: 35
  },
  riposte_blade_counter: {
    id: 'riposte_blade_counter', name: 'Riposte Blade', cost: 2, tempoShift: 20, rarity: 'rare',
    damage: 55, range: 90, type: 'counter', color: '#ff8844',
    desc: 'Arm 0.5s parry. Counter: 55 dmg + stagger 1s. +20 Tempo.',
    bonusCard: true, parryWindow: 0.5, counterDmg: 55, counterStagger: 1.0
  },
  perfect_guard: {
    id: 'perfect_guard', name: 'Perfect Guard', cost: 2, tempoShift: -5, rarity: 'rare',
    damage: 0, range: 0, type: 'counter', color: '#44ffaa',
    desc: 'Arm 0.6s parry. On success: reset Tempo to 50 + 1s invincibility. -5 Tempo.',
    bonusCard: true, parryWindow: 0.6, counterDmg: 0, counterReset: true
  },
  death_sentence_counter: {
    id: 'death_sentence_counter', name: 'Death Sentence', cost: 3, tempoShift: 30, rarity: 'rare',
    damage: 0, range: 90, type: 'counter', color: '#ff0000',
    slotWidth: 2,
    desc: 'Arm 0.5s parry. Counter deals 30% of enemy MAX HP. +30 Tempo. [2 SLOTS]',
    bonusCard: true, parryWindow: 0.5, counterDmg: 0, counterPct: 0.3
  },

  // ── STANCE ───────────────────────────────────────────────────────
  blade_dance_stance: {
    id: 'blade_dance_stance', name: 'Blade Dance', cost: 1, tempoShift: 5, rarity: 'uncommon',
    damage: 0, range: 0, type: 'stance', color: '#ff6644',
    desc: 'Toggle Offensive stance: melee DMG +40%, dodge cooldown +0.5s. +5 Tempo.',
    stanceId: 'blade_dance'
  },
  iron_aegis_stance: {
    id: 'iron_aegis_stance', name: 'Iron Aegis', cost: 1, tempoShift: -5, rarity: 'uncommon',
    damage: 0, range: 0, type: 'stance', color: '#aabbcc',
    desc: 'Toggle Defensive stance: incoming damage -2, dodge range +50%. -5 Tempo.',
    stanceId: 'iron_aegis'
  },
  tempo_shift_stance: {
    id: 'tempo_shift_stance', name: 'Tempo Shift', cost: 1, tempoShift: 0, rarity: 'rare',
    damage: 0, range: 0, type: 'stance', color: '#44ffff',
    desc: 'Toggle: Amp stance: all Tempo changes ×1.5. Damp stance: ×0.5.',
    bonusCard: true, stanceId: 'tempo_shift'
  },

  // ── CURSED CARDS ──────────────────────────────────────────────────
  // Cursed cards are powerful but carry a cost beyond AP.
  soul_siphon: {
    id: 'soul_siphon', name: 'Soul Siphon', cost: 0, tempoShift: 40, rarity: 'rare',
    damage: 120, range: 130, type: 'melee', color: '#ff0044',
    desc: 'CURSED: Free AP — but drains 2 HP. Devastating melee. +40 Tempo.',
    cursed: true, hpCost: 2, bonusCard: true
  },
  void_hex: {
    id: 'void_hex', name: 'Void Hex', cost: 3, tempoShift: -45, rarity: 'rare',
    damage: 100, range: 260, type: 'projectile', color: '#440088',
    desc: 'CURSED: Massive AoE — Tempo plunges -45. Power demands a price.',
    cursed: true, bonusCard: true
  },
  cursed_spiral: {
    id: 'cursed_spiral', name: 'Cursed Spiral', cost: 2, tempoShift: 28, rarity: 'rare',
    damage: 50, range: 240, type: 'cleave', color: '#880000',
    desc: 'CURSED: Cleaves ALL nearby. You take 1 HP per enemy struck.',
    cursed: true, selfDamagePerHit: 1, bonusCard: true
  },
  forbidden_surge: {
    id: 'forbidden_surge', name: 'Forbidden Surge', cost: 1, tempoShift: 75, rarity: 'rare',
    damage: 0, range: 100, type: 'utility', color: '#8800ff',
    desc: 'CURSED: Spike Tempo +75 instantly. Costs 2 HP. Use wisely.',
    cursed: true, hpCost: 2, bonusCard: true
  },

  // ── RH2: PYRE STARTING + MASTERY CARDS ────────────────────────────
  ember_lash: {
    id: 'ember_lash', name: 'Ember Lash', cost: 1, tempoShift: 12, rarity: 'common',
    damage: 8, range: 110, type: 'melee', color: '#ff7733',
    desc: 'Igniting strike. Applies Burn 3s. +12 Tempo.',
    burn: { dps: 1, duration: 3 }
  },
  cinder_burst: {
    id: 'cinder_burst', name: 'Cinder Burst', cost: 2, tempoShift: 18, rarity: 'uncommon',
    damage: 12, range: 150, type: 'projectile', color: '#ff4422',
    desc: 'Radial ember spray. Burn 3s. +18 Tempo.',
    burn: { dps: 1, duration: 3 }
  },
  firestorm: {
    id: 'firestorm', name: 'Firestorm', cost: 3, tempoShift: 22, rarity: 'rare',
    damage: 6, range: 170, type: 'echo', color: '#ff5500',
    desc: '3 fire pulses over 1.5s. Refreshes Burn each tick. +22 Tempo.',
    bonusCard: true, pulses: 3
  },
  ash_mark: {
    id: 'ash_mark', name: 'Ash Mark', cost: 2, tempoShift: 8, rarity: 'rare',
    damage: 0, range: 200, type: 'utility', color: '#cc6611',
    desc: 'Mark target. Allies\' next hit on it ignites a 100r burn AoE.',
    bonusCard: true, marker: true
  },
  wildfire: {
    id: 'wildfire', name: 'Wildfire', cost: 3, tempoShift: 20, rarity: 'rare',
    damage: 8, range: 220, type: 'projectile', color: '#ee3300',
    desc: 'Burn jumps to nearest enemy on each tick. +20 Tempo.',
    bonusCard: true, burnChain: true
  },
  inferno_oath: {
    id: 'inferno_oath', name: 'Inferno Oath', cost: 0, tempoShift: 40, rarity: 'rare',
    damage: 0, range: 0, type: 'overload', color: '#ff2200',
    desc: 'OVERLOAD: +40 Tempo. Next 3 attacks apply 2× Burn. Big crash risk.',
    bonusCard: true, overload: true, burnAmplifierStacks: 3
  },
  pyre_pact: {
    id: 'pyre_pact', name: 'Pyre Pact', cost: 3, tempoShift: 15, rarity: 'rare',
    damage: 18, range: 180, type: 'pact', color: '#ff7700',
    desc: '[PACT] Costs 1 AP from each ally. Burn AoE 180r. +15 Tempo.',
    bonusCard: true, pact: true, pactCostPerAlly: 1
  },

  // ── RH2: TIDE STARTING + MASTERY CARDS ────────────────────────────
  tide_anchor: {
    id: 'tide_anchor', name: 'Anchor', cost: 1, tempoShift: -8, rarity: 'common',
    damage: 0, range: 220, type: 'utility', color: '#22aaff',
    desc: 'Anchor an ally: their next attack +25%. -8 Tempo.',
    anchor: true
  },
  cold_wave: {
    id: 'cold_wave', name: 'Cold Wave', cost: 2, tempoShift: -12, rarity: 'common',
    damage: 6, range: 160, type: 'ground', color: '#66ddff',
    desc: 'Wave of frost. Slows enemies 2s. -12 Tempo.'
  },
  relay_dart: {
    id: 'relay_dart', name: 'Relay Dart', cost: 1, tempoShift: 10, rarity: 'common',
    damage: 9, range: 200, type: 'relay', color: '#33ccff',
    desc: '[RELAY] Hits ally → ricochets to nearest enemy +50% dmg. +10 Tempo.',
    relay: true
  },
  high_tide: {
    id: 'high_tide', name: 'High Tide', cost: 3, tempoShift: -10, rarity: 'rare',
    damage: 0, range: 0, type: 'utility', color: '#11aaee',
    desc: 'Heal all party members 1 HP. Anchored allies heal 2.',
    bonusCard: true, partyHeal: 1
  },
  kelp_snare: {
    id: 'kelp_snare', name: 'Kelp Snare', cost: 2, tempoShift: 0, rarity: 'rare',
    damage: 4, range: 180, type: 'trap', color: '#226644',
    desc: 'Snare zone. Enemies inside rooted 1.5s.',
    bonusCard: true, root: true
  },
  undertow: {
    id: 'undertow', name: 'Undertow', cost: 3, tempoShift: -18, rarity: 'rare',
    damage: 12, range: 200, type: 'projectile', color: '#117799',
    desc: 'Pull all enemies in radius toward center. -18 Tempo.',
    bonusCard: true, pull: true
  },
  blue_oath: {
    id: 'blue_oath', name: 'Blue Oath', cost: 4, tempoShift: 5, rarity: 'rare',
    damage: 0, range: 250, type: 'utility', color: '#0099dd',
    desc: 'Grant +2 shield to all allies. Lasts until next room.',
    bonusCard: true, partyShield: 2, slotWidth: 2
  },
  wave_pact: {
    id: 'wave_pact', name: 'Wave Pact', cost: 2, tempoShift: -15, rarity: 'rare',
    damage: 8, range: 240, type: 'pact', color: '#1188cc',
    desc: '[PACT] Costs 1 AP/ally. Heals party 2 HP, slows all enemies. -15 Tempo.',
    bonusCard: true, pact: true, pactCostPerAlly: 1
  },

  // ── RH2: COG STARTING + MASTERY CARDS ─────────────────────────────
  mini_turret: {
    id: 'mini_turret', name: 'Mini Turret', cost: 2, tempoShift: 5, rarity: 'common',
    damage: 6, range: 220, type: 'orbit', color: '#bbaa44',
    desc: 'Place a turret. Auto-fires until room ends. +5 Tempo.',
    turret: true, turretLifetime: 999
  },
  spring_trap: {
    id: 'spring_trap', name: 'Spring Trap', cost: 1, tempoShift: 0, rarity: 'common',
    damage: 14, range: 90, type: 'trap', color: '#aa9933',
    desc: 'Place a trap. Stuns 1s on trigger.'
  },
  gear_lance: {
    id: 'gear_lance', name: 'Gear Lance', cost: 2, tempoShift: 14, rarity: 'uncommon',
    damage: 18, range: 180, type: 'projectile', color: '#ccbb55',
    desc: 'Spinning gear pierces all in line. +14 Tempo.',
    pierce: 99
  },
  twin_turret: {
    id: 'twin_turret', name: 'Twin Turret', cost: 3, tempoShift: 8, rarity: 'rare',
    damage: 8, range: 240, type: 'orbit', color: '#ddcc55',
    desc: 'Place 2 turrets at once. +8 Tempo.',
    bonusCard: true, turret: true, turretCount: 2
  },
  gear_overdrive: {
    id: 'gear_overdrive', name: 'Gear Overdrive', cost: 2, tempoShift: 18, rarity: 'rare',
    damage: 0, range: 0, type: 'utility', color: '#ffcc44',
    desc: 'Active turrets fire 2× faster for 5s. +18 Tempo.',
    bonusCard: true, turretBuff: { fireRateMult: 2, duration: 5 }
  },
  shrapnel: {
    id: 'shrapnel', name: 'Shrapnel', cost: 1, tempoShift: 10, rarity: 'rare',
    damage: 5, range: 100, type: 'utility', color: '#aa8833',
    desc: 'Detonate any of your turrets — 80r AoE 14 dmg.',
    bonusCard: true
  },
  iron_oath: {
    id: 'iron_oath', name: 'Iron Oath', cost: 4, tempoShift: 5, rarity: 'rare',
    damage: 0, range: 0, type: 'utility', color: '#665522',
    desc: 'Place 4 turrets in a square around you. [2 SLOTS]',
    bonusCard: true, turret: true, turretCount: 4, slotWidth: 2
  },
  cog_pact: {
    id: 'cog_pact', name: 'Cog Pact', cost: 2, tempoShift: 12, rarity: 'rare',
    damage: 0, range: 200, type: 'pact', color: '#997733',
    desc: '[PACT] Costs 1 AP/ally. All allies gain a personal turret. +12 Tempo.',
    bonusCard: true, pact: true, pactCostPerAlly: 1
  },

  // ── RH2: LUMEN STARTING + MASTERY CARDS ───────────────────────────
  beacon_pulse: {
    id: 'beacon_pulse', name: 'Beacon Pulse', cost: 1, tempoShift: 8, rarity: 'common',
    damage: 7, range: 200, type: 'projectile', color: '#ffeebb',
    desc: 'Bright pulse. Reveals + marks all hit. +8 Tempo.',
    marker: true
  },
  sun_lance: {
    id: 'sun_lance', name: 'Sun Lance', cost: 2, tempoShift: 16, rarity: 'uncommon',
    damage: 22, range: 280, type: 'beam', color: '#ffdd44',
    desc: 'Long radiant beam. +16 Tempo.'
  },
  solar_flare: {
    id: 'solar_flare', name: 'Solar Flare', cost: 3, tempoShift: 22, rarity: 'rare',
    damage: 30, range: 200, type: 'projectile', color: '#ffaa00',
    desc: 'Radiant burst. Stuns enemies looking at you 0.8s. +22 Tempo.',
    bonusCard: true
  },
  beacon_chain: {
    id: 'beacon_chain', name: 'Beacon Chain', cost: 2, tempoShift: 14, rarity: 'rare',
    damage: 6, range: 220, type: 'marker', color: '#ffeeaa',
    desc: '[MARKER] Mark up to 3 enemies. Allies\' next hits on them +50%.',
    bonusCard: true, marker: true, markerCount: 3
  },
  dawnbreak: {
    id: 'dawnbreak', name: 'Dawnbreak', cost: 4, tempoShift: 10, rarity: 'rare',
    damage: 0, range: 250, type: 'utility', color: '#ffffaa',
    desc: 'Party-wide buff: +25% dmg, +1 AP regen for 6s. [2 SLOTS]',
    bonusCard: true, partyBuff: { dmgMult: 1.25, apRegenBonus: 1, duration: 6 }, slotWidth: 2
  },
  sun_oath: {
    id: 'sun_oath', name: 'Sun Oath', cost: 3, tempoShift: 5, rarity: 'rare',
    damage: 0, range: 0, type: 'utility', color: '#ffcc00',
    desc: 'Lumen aura radius +100% for 8s.',
    bonusCard: true, auraBoost: { mult: 2, duration: 8 }
  },
  lumen_pact: {
    id: 'lumen_pact', name: 'Lumen Pact', cost: 2, tempoShift: 10, rarity: 'rare',
    damage: 0, range: 250, type: 'pact', color: '#ffdd66',
    desc: '[PACT] Costs 1 AP/ally. All allies gain Lumen aura for 6s. +10 Tempo.',
    bonusCard: true, pact: true, pactCostPerAlly: 1
  },

  // ── RH2: GENERIC NEW CATEGORIES ───────────────────────────────────
  rally_pact: {
    id: 'rally_pact', name: 'Rally Pact', cost: 2, tempoShift: 12, rarity: 'uncommon',
    damage: 0, range: 0, type: 'pact', color: '#88ccff',
    desc: '[PACT] All allies gain +1 AP and +10 Tempo. +12 Tempo.',
    pact: true, pactCostPerAlly: 1
  },
  bond_strike: {
    id: 'bond_strike', name: 'Bond Strike', cost: 1, tempoShift: 8, rarity: 'uncommon',
    damage: 12, range: 100, type: 'melee', color: '#88aaff',
    desc: 'If ally hit same target in last 1.5s, +100% dmg. +8 Tempo.'
  },
  twin_dash: {
    id: 'twin_dash', name: 'Twin Dash', cost: 2, tempoShift: 14, rarity: 'rare',
    damage: 18, range: 200, type: 'dash', color: '#aaffcc',
    desc: 'Dash. If you collide with an ally, both gain +10 Tempo. +14 Tempo.',
    bonusCard: true
  },
  overload_strike: {
    id: 'overload_strike', name: 'Overload', cost: 0, tempoShift: 40, rarity: 'rare',
    damage: 25, range: 130, type: 'overload', color: '#ff44aa',
    desc: 'OVERLOAD: 0 AP, +40 Tempo, big strike. High crash risk.',
    bonusCard: true, overload: true
  },
  mark_of_focus: {
    id: 'mark_of_focus', name: 'Mark of Focus', cost: 1, tempoShift: 5, rarity: 'common',
    damage: 0, range: 240, type: 'marker', color: '#ddddff',
    desc: '[MARKER] Mark target. Next hit by anyone +50% dmg. +5 Tempo.',
    marker: true
  },
  crashlink: {
    id: 'crashlink', name: 'Crashlink', cost: 3, tempoShift: 35, rarity: 'rare',
    damage: 0, range: 0, type: 'pact', color: '#ff66aa',
    desc: '[PACT] All allies +35 Tempo. Synchronizes party for big crashes.',
    bonusCard: true, pact: true, pactCostPerAlly: 0
  },
  ricochet_relay: {
    id: 'ricochet_relay', name: 'Ricochet Relay', cost: 2, tempoShift: 12, rarity: 'rare',
    damage: 11, range: 240, type: 'relay', color: '#66ddee',
    desc: '[RELAY] Bounces between allies before homing on enemy. +12 Tempo.',
    bonusCard: true, relay: true, bounces: 3
  },
};

// Card unlock tiers for non-bonus cards.
// Tier 0 = always available (omitted from this map).
// Tier 1 = after 2 runs.  Tier 2 = after 5 runs.  Tier 3 = after 10 runs or first win.
export const CARD_UNLOCK_TIERS = {
  // Tier 1 — accessible intermediate cards
  frost_nova: 1, tri_shot: 1, power_shot: 1, cold_wave: 1, piercing_surge: 1,
  whip_lash: 1, barrage: 1, riposte: 1, parry_card: 1, void_ring: 1,
  frost_ring: 1, flashbang_trap: 1, landmine: 1, freeze_mine: 1,
  ghost_step_echo: 1, iron_aegis_stance: 1, blade_dance_stance: 1,
  shockwave: 1, phase_step: 1, tempo_flip: 1,
  // Tier 2 — advanced cards
  frenzy: 2, wraithblade: 2, war_cry: 2, ricochet: 2, charged_bolt: 2,
  cluster_shot: 2, void_lance: 2, fissure: 2, void_rift: 2, glacier_push: 2,
  raging_halo: 2, ice_spike: 2, glacial_press: 2,
  flamethrower: 2, drain_beam_chan: 2, phantom_slash: 2, delayed_nova: 2,
  aftershock: 2, iron_retort: 2, cold_rune: 2, hot_rune: 2, null_ray: 2,
  // Tier 3 — endgame cards (after 10 runs or first win)
  whirlwind: 3, frost_reave: 3,
};

export class DeckManager {
  constructor() {
    this.collection = [];
    this.hand = [null, null, null, null];
    this.HAND_SIZE = 4;
    this.MAX_DECK_SIZE = 6;
    this.upgrades = {};
  }

  initDeck(startingCardIds) {
    this.collection = [...new Set(startingCardIds)];
    this.upgrades = {};
    this.hand = [null, null, null, null];
    this._resonanceDirty = true;
    // Auto-fill hand, respecting slotWidth
    let slotCursor = 0;
    for (const id of this.collection) {
      if (slotCursor >= this.HAND_SIZE) break;
      const def = CardDefinitions[id];
      const sw = (def && def.slotWidth) || 1;
      if (slotCursor + sw <= this.HAND_SIZE) {
        this.hand[slotCursor] = id;
        for (let s = 1; s < sw; s++) this.hand[slotCursor + s] = '__wide';
        slotCursor += sw;
      } else {
        slotCursor++;
      }
    }
    console.log(`[Deck] Initialized with [${this.collection.join(', ')}]`);
  }

  addCard(cardId) {
    if (this.collection.includes(cardId)) return false;
    if (this.collection.length >= this.MAX_DECK_SIZE) return 'full';
    this.collection.push(cardId);
    this._resonanceDirty = true;
    // Try to fill an empty hand slot
    const def = CardDefinitions[cardId];
    const sw = (def && def.slotWidth) || 1;
    for (let i = 0; i <= this.HAND_SIZE - sw; i++) {
      let fits = true;
      for (let s = 0; s < sw; s++) {
        if (this.hand[i + s] !== null) { fits = false; break; }
      }
      if (fits) {
        this.hand[i] = cardId;
        for (let s = 1; s < sw; s++) this.hand[i + s] = '__wide';
        break;
      }
    }
    return true;
  }

  removeCard(cardId) {
    const idx = this.collection.indexOf(cardId);
    if (idx === -1) return false;
    this.collection.splice(idx, 1);
    delete this.upgrades[cardId];
    this._resonanceDirty = true;
    // Clear from hand
    for (let i = 0; i < this.HAND_SIZE; i++) {
      if (this.hand[i] === cardId) {
        const def = CardDefinitions[cardId];
        const sw = (def && def.slotWidth) || 1;
        this.hand[i] = null;
        for (let s = 1; s < sw; s++) {
          if (i + s < this.HAND_SIZE && this.hand[i + s] === '__wide') this.hand[i + s] = null;
        }
        break;
      }
    }
    return true;
  }

  equipCard(slotIndex, cardId) {
    const def = CardDefinitions[cardId];
    const sw = (def && def.slotWidth) || 1;

    // Remove this card if it's already somewhere else
    for (let i = 0; i < this.HAND_SIZE; i++) {
      if (i !== slotIndex && this.hand[i] === cardId) {
        const oldDef = CardDefinitions[this.hand[i]];
        const oldSw = (oldDef && oldDef.slotWidth) || 1;
        this.hand[i] = null;
        for (let s = 1; s < oldSw; s++) {
          if (i + s < this.HAND_SIZE && this.hand[i + s] === '__wide') this.hand[i + s] = null;
        }
      }
    }

    // Clear old card and any wide sentinels at target slot
    const oldCard = this.hand[slotIndex];
    if (oldCard && oldCard !== '__wide') {
      const oldDef = CardDefinitions[oldCard];
      const oldSw = (oldDef && oldDef.slotWidth) || 1;
      this.hand[slotIndex] = null;
      for (let s = 1; s < oldSw; s++) {
        if (slotIndex + s < this.HAND_SIZE && this.hand[slotIndex + s] === '__wide') this.hand[slotIndex + s] = null;
      }
    } else if (oldCard === '__wide') {
      // Find parent and clear that wide card
      for (let i = 0; i < slotIndex; i++) {
        if (this.hand[i] && this.hand[i] !== '__wide') {
          const parentDef = CardDefinitions[this.hand[i]];
          const parentSw = (parentDef && parentDef.slotWidth) || 1;
          if (i + parentSw > slotIndex) {
            this.hand[i] = null;
            for (let s = 1; s < parentSw; s++) {
              if (i + s < this.HAND_SIZE && this.hand[i + s] === '__wide') this.hand[i + s] = null;
            }
            break;
          }
        }
      }
    }

    // Check if wide card fits from slotIndex
    let fits = true;
    for (let s = 1; s < sw; s++) {
      const nextSlot = slotIndex + s;
      if (nextSlot >= this.HAND_SIZE) { fits = false; break; }
      const next = this.hand[nextSlot];
      if (next !== null && next !== '__wide') { fits = false; break; }
    }

    // If it doesn't fit forward, try to place it shifted back
    let actualSlot = slotIndex;
    if (!fits && sw > 1) {
      actualSlot = Math.min(slotIndex, this.HAND_SIZE - sw);
      // Clear anything in the way
      for (let s = 0; s < sw; s++) {
        const si = actualSlot + s;
        if (this.hand[si] && this.hand[si] !== '__wide') {
          const cd = CardDefinitions[this.hand[si]];
          const csw = (cd && cd.slotWidth) || 1;
          this.hand[si] = null;
          for (let ss = 1; ss < csw; ss++) {
            if (si + ss < this.HAND_SIZE && this.hand[si + ss] === '__wide') this.hand[si + ss] = null;
          }
        } else {
          this.hand[si] = null;
        }
      }
    }

    this.hand[actualSlot] = cardId;
    for (let s = 1; s < sw; s++) {
      if (actualSlot + s < this.HAND_SIZE) this.hand[actualSlot + s] = '__wide';
    }
    this._resonanceDirty = true;
  }

  isEquippedInOtherSlot(slotIndex, cardId) {
    for (let i = 0; i < this.HAND_SIZE; i++) {
      if (i !== slotIndex && this.hand[i] === cardId) return true;
    }
    return false;
  }

  useCard(slotIndex) {
    const cardId = this.hand[slotIndex];
    if (!cardId || cardId === '__wide') return null;
    return this.getCardDef(cardId);
  }

  getCardDef(cardId) {
    const base = CardDefinitions[cardId];
    if (!base) return null;
    const level = this.upgrades[cardId] || 0;
    if (level === 0) return base;
    // BUG-09 + BUG-10: scale damage, tempoShift, and cost; show updated values
    const scaledDmg = base.damage > 0 ? Math.round(base.damage * (1 + 0.5 * level)) : base.damage;
    const scaledTempo = base.tempoShift !== 0
      ? Math.round(base.tempoShift * (1 + 0.25 * level))
      : base.tempoShift;
    const scaledCost = level >= 2 ? Math.max(0, base.cost - 1) : base.cost;
    const dmgStr = scaledDmg > 0 ? `dmg×${(1 + 0.5 * level).toFixed(1)}` : '';
    const tempoStr = scaledTempo !== base.tempoShift ? `tempo×${(1 + 0.25 * level).toFixed(2)}` : '';
    const costStr = level >= 2 ? 'cost-1' : '';
    const upgradeInfo = [dmgStr, tempoStr, costStr].filter(Boolean).join(', ');
    return Object.assign({}, base, {
      name: base.name + '+'.repeat(level),
      damage: scaledDmg,
      tempoShift: scaledTempo,
      cost: scaledCost,
      desc: base.desc + ` [+${level}: ${upgradeInfo || 'upgraded'}]`
    });
  }

  upgradeCard(cardId) {
    if (!this.collection.includes(cardId)) return false;
    const current = this.upgrades[cardId] || 0;
    if (current >= 2) return false;
    this.upgrades[cardId] = current + 1;
    console.log(`[Deck] Upgraded "${cardId}" to level ${current + 1}`);
    return true;
  }

  getUpgradeChoices() {
    return this.collection.filter(id => {
      const level = this.upgrades[id] || 0;
      return level < 2;
    });
  }

  // Returns the card type that appears 3+ times in the current hand (for resonance bonus).
  getHandResonanceType() {
    const typeCounts = {};
    for (const id of this.hand) {
      if (!id || id === '__wide') continue;
      const def = this.getCardDef(id);
      if (!def) continue;
      typeCounts[def.type] = (typeCounts[def.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count >= 3) return type;
    }
    return null;
  }
}
