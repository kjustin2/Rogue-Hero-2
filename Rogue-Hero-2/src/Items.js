// Items.js — Passive relic system
import { events } from './EventBus.js';

export const ItemDefinitions = {
  metronome:      { id: 'metronome',      name: 'Metronome',      rarity: 'common',   color: '#ffdd44', desc: 'Tempo decays 3× faster — easier zone control' },
  resonance:      { id: 'resonance',      name: 'Resonance',      rarity: 'uncommon', color: '#44ffaa', desc: 'At 50 Tempo (±5), damage is doubled' },
  runaway:        { id: 'runaway',        name: 'Runaway',        rarity: 'uncommon', color: '#ff8844', desc: 'Tempo no longer decays from Hot' },
  iron_pulse:     { id: 'iron_pulse',     name: 'Iron Pulse',     rarity: 'common',   color: '#aaaacc', desc: 'Max HP +2, restore 2 HP' },
  cold_fury:      { id: 'cold_fury',      name: 'Cold Fury',      rarity: 'common',   color: '#4488ff', desc: 'At Cold Tempo, dash deals contact damage' },
  surge_coil:     { id: 'surge_coil',     name: 'Surge Coil',     rarity: 'uncommon', color: '#ff4444', desc: 'Auto-crash burst radius +60%' },
  echo:           { id: 'echo',           name: 'Echo',           rarity: 'uncommon', color: '#cc88ff', desc: 'On Tempo Crash, last attack repeats at half damage' },
  precision:      { id: 'precision',      name: 'Precision',      rarity: 'common',   color: '#aaddff', desc: 'Perfect Dodge slow-mo lasts twice as long' },
  glass_heart:    { id: 'glass_heart',    name: 'Glass Heart',    rarity: 'rare',     color: '#ff3333', desc: 'Start each room at 90 Tempo' },
  tempo_tap:      { id: 'tempo_tap',      name: 'Tempo Tap',      rarity: 'uncommon', color: '#44ff88', desc: 'Dodging raises Tempo +5 instead of −5' },
  sustained:      { id: 'sustained',      name: 'Sustained',      rarity: 'uncommon', color: '#ffaa44', desc: 'Killing an enemy stops Tempo decay for 2s' },
  last_rites:     { id: 'last_rites',     name: 'Last Rites',     rarity: 'rare',     color: '#ff2222', desc: 'On death: auto-crash if Tempo ≥ 50, revive at 1 HP. Once per run.' },
  cold_blood:     { id: 'cold_blood',     name: 'Cold Blood',     rarity: 'common',   color: '#6688ff', desc: 'Kills while Cold restore 1 HP (once per room)' },
  deadweight:     { id: 'deadweight',     name: 'Deadweight',     rarity: 'common',   color: '#888888', desc: '+3 Max HP, −10% speed. Pure tank.' },
  volatile_soles: { id: 'volatile_soles', name: 'Volatile Soles', rarity: 'uncommon', color: '#ff6600', desc: 'Auto-crash burst radius +60%' },
  time_warp:      { id: 'time_warp',      name: 'Time Warp',      rarity: 'rare',     color: '#aaccff', desc: 'Perfect dodge slow-mo lasts 3× as long' },
  phantom_ink:    { id: 'phantom_ink',    name: 'Phantom Ink',    rarity: 'uncommon', color: '#bb88ff', desc: 'Invisible to enemy aggro while dodging' },
  void_shard:     { id: 'void_shard',     name: 'Void Shard',     rarity: 'uncommon', color: '#224488', desc: 'Your projectiles pierce through 1 extra enemy' },
  abyss_heart:    { id: 'abyss_heart',    name: 'Abyss Heart',    rarity: 'rare',     color: '#ff2266', desc: '+1 max HP each time you defeat a boss' },
  quick_hands:    { id: 'quick_hands',    name: 'Quick Hands',    rarity: 'uncommon', color: '#44ffcc', desc: 'AP regenerates 40% faster' },
  deep_well:      { id: 'deep_well',      name: 'Deep Well',      rarity: 'rare',     color: '#6644ff', desc: '+1 maximum AP capacity (5 → 6)' },

  // ── CHARACTER-EXCLUSIVE RELICS ────────────────────────────────────
  berserker_heart:  { id: 'berserker_heart',  name: 'Berserker Heart',  rarity: 'rare',     color: '#ff4422', desc: '[BLADE] Each crash resets to 80 and adds +1 combo stack.', charSpecific: 'blade' },
  ice_veil:         { id: 'ice_veil',          name: 'Ice Veil',         rarity: 'uncommon', color: '#88ccff', desc: '[FROST] Taking damage at COLD Tempo blocks 50% of it once per room.', charSpecific: 'frost' },
  shadow_cloak:     { id: 'shadow_cloak',      name: 'Shadow Cloak',     rarity: 'rare',     color: '#cc44ff', desc: '[SHADOW] First attack after a perfect dodge deals 3× damage.', charSpecific: 'shadow' },
  resonance_crystal:{ id: 'resonance_crystal', name: 'Resonance Crystal', rarity: 'rare',    color: '#00ffdd', desc: '[ECHO] Resonance zone widens to ±15 of 50 Tempo.', charSpecific: 'echo' },
  lifesteal_fang:   { id: 'lifesteal_fang',    name: 'Lifesteal Fang',   rarity: 'rare',     color: '#ff2255', desc: '[WRAITH] Every 3rd kill at ≤2 HP heals 2 HP instead of 1.', charSpecific: 'wraith' },
  iron_colossus:    { id: 'iron_colossus',      name: 'Iron Colossus',    rarity: 'rare',     color: '#ddaa22', desc: '[VANGUARD] At max Guard stacks, incoming damage reduced by 1.', charSpecific: 'vanguard' },

  // ── RH2: PACT (PARTY-WIDE) RELICS ─────────────────────────────────
  bond_of_embers:   { id: 'bond_of_embers',   name: 'Bond of Embers',   rarity: 'rare',     color: '#ff6633', desc: '[PACT] When any player crashes, all allies gain +20 Tempo.', pactRelic: true },
  linked_steel:     { id: 'linked_steel',     name: 'Linked Steel',     rarity: 'rare',     color: '#bbccdd', desc: '[PACT] Kills give +1 AP to the ally with the lowest current AP.', pactRelic: true },
  mirror_vow:       { id: 'mirror_vow',       name: 'Mirror Vow',       rarity: 'rare',     color: '#aabbff', desc: '[PACT] When an ally is hit, nearest other ally gains 1 Guard stack.', pactRelic: true },
  fourfold_sigil:   { id: 'fourfold_sigil',   name: 'Fourfold Sigil',   rarity: 'rare',     color: '#ffcc66', desc: '[PACT] At 4-player count: +20% effect to all relics in the lobby.', pactRelic: true },
  resonant_anchor:  { id: 'resonant_anchor',  name: 'Resonant Anchor',  rarity: 'uncommon', color: '#88ddee', desc: '[PACT] Group Tempo Resonance multipliers +50% stronger.', pactRelic: true },
  shared_burden:    { id: 'shared_burden',    name: 'Shared Burden',    rarity: 'uncommon', color: '#cc88ff', desc: '[PACT] Damage taken: 25% redistributed to highest-HP ally.', pactRelic: true },
};

export class ItemManager {
  constructor() {
    this.equipped = [];
    this.coldBloodUsedThisRoom = false;
    this.sustainedTimer = 0;
    this.lastRitesUsed = false;
  }

  has(id) { return this.equipped.includes(id); }

  reset() {
    this.equipped = [];
    this.coldBloodUsedThisRoom = false;
    this.sustainedTimer = 0;
    this.lastRitesUsed = false;
    this._lifestealKills = 0; // LIKELY-04: reset between runs
  }

  resetRoom() {
    this.coldBloodUsedThisRoom = false;
    this.iceVeilUsedThisRoom = false;
  }

  update(dt) {
    if (this.sustainedTimer > 0) this.sustainedTimer -= dt;
  }

  add(itemId, player, tempo) {
    if (this.equipped.includes(itemId)) return;
    this.equipped.push(itemId);
    console.log(`[Items] Equipped "${itemId}"`);

    const noHeal = player._classPassives && player._classPassives.noHealingFromRelics;
    switch (itemId) {
      case 'iron_pulse':
        player.maxHp += 2;
        if (!noHeal) player.hp = Math.min(player.hp + 2, player.maxHp);
        break;
      case 'deadweight':
        player.maxHp += 3;
        if (!noHeal) player.hp = Math.min(player.hp + 3, player.maxHp);
        player.BASE_SPEED = Math.round(player.BASE_SPEED * 0.9);
        break;
      case 'quick_hands':
        player.apRegen = (player.apRegen || 0.7) * 1.4;
        break;
      case 'deep_well':
        player.maxBudget += 1;
        break;
    }

    // Recompute crash radius bonus
    if (tempo) {
      let mult = 1.0;
      if (this.has('surge_coil'))     mult *= 1.6;
      if (this.has('volatile_soles')) mult *= 1.6;
      tempo.modifiers.crashRadiusBonus = mult;
    }
    // Recompute decay rate
    if (tempo) {
      tempo.modifiers.decayRate = this.has('metronome') ? 3.0 : 1.0;
    }
  }

  // Called by tempo.update — can block decay
  shouldDecay(tempoValue) {
    if (this.sustainedTimer > 0) return false;
    if (this.has('runaway') && tempoValue >= 70) return false;
    return true;
  }

  // Extra damage multiplier from items
  damageMultiplier(tempoValue) {
    if (this.has('resonance') && Math.abs(tempoValue - 50) <= 5) return 2.0;
    return 1.0;
  }

  // Dodge tempo shift (items can invert it)
  dodgeTempoShift(tempoValue) {
    if (this.has('tempo_tap')) return 5;
    return tempoValue < 30 ? 0 : -5;
  }

  perfectDodgeSlowMoDuration() {
    if (this.has('time_warp')) return 1.2;
    return this.has('precision') ? 0.8 : 0.4;
  }

  // Called on boss kill for abyss_heart
  onBossKill(player) {
    if (this.has('abyss_heart')) {
      player.maxHp++;
      player.hp = Math.min(player.hp + 1, player.maxHp);
      events.emit('RELIC_ACTIVATED', { name: 'Abyss Heart', text: '+1 MAX HP' });
      return true;
    }
    return false;
  }

  // Void shard: projectile pierce count
  projectilePierceCount() {
    return this.has('void_shard') ? 2 : 1;
  }

  shouldColdDashDamage(tempoValue) {
    return this.has('cold_fury') && tempoValue < 30;
  }

  startingTempo() {
    return this.has('glass_heart') ? 90 : 50;
  }

  // On enemy kill callback
  onKill(tempoValue, player, killCount) {
    if (this.has('sustained')) {
      this.sustainedTimer = 2.0;
      events.emit('RELIC_ACTIVATED', { name: 'Sustained', text: 'NO DECAY' });
    }
    if (this.has('cold_blood') && tempoValue < 30 && !this.coldBloodUsedThisRoom) {
      this.coldBloodUsedThisRoom = true;
      player.heal(1);
      events.emit('RELIC_ACTIVATED', { name: 'Cold Blood', text: '+1 HP' });
      return true;
    }
    // Lifesteal Fang: every 3rd kill at ≤2 HP heals 2 HP
    if (this.has('lifesteal_fang') && player.hp <= 2) {
      this._lifestealKills = (this._lifestealKills || 0) + 1;
      if (this._lifestealKills >= 3) {
        this._lifestealKills = 0;
        player.heal(2);
        events.emit('RELIC_ACTIVATED', { name: 'Lifesteal Fang', text: '+2 HP' });
      }
    }
    return false;
  }

  // On damage taken: returns reduced damage amount if Ice Veil activates
  onDamageTaken(amount, tempoValue, player) {
    if (this.has('ice_veil') && tempoValue < 30 && !this.iceVeilUsedThisRoom) {
      this.iceVeilUsedThisRoom = true;
      const blocked = Math.round(amount * 0.5);
      events.emit('RELIC_ACTIVATED', { name: 'Ice Veil', text: `-${blocked} DMG BLOCKED` });
      return amount - blocked;
    }
    return amount;
  }

  // Shadow Cloak: 3× damage after perfect dodge (used in Combat.applyDamageToEnemy)
  isShadowCloakActive(player) {
    return this.has('shadow_cloak') && player._shadowCloakActive;
  }

  // Iron Colossus: damage reduction at max guard stacks
  ironColossusReduction(guardStacks, maxGuardStacks) {
    return this.has('iron_colossus') && guardStacks >= maxGuardStacks ? 1 : 0;
  }

  // On player death — Last Rites check
  onDeath(tempoValue, player) {
    if (this.has('last_rites') && !this.lastRitesUsed && tempoValue >= 50) {
      this.lastRitesUsed = true;
      player.hp = 1;
      player.alive = true;
      // Trigger crash directly via event (uses the new auto-crash system)
      events.emit('REQUEST_PLAYER_POS_CRASH', { radius: 100, dmg: 25, accidental: true });
      events.emit('RELIC_ACTIVATED', { name: 'Last Rites', text: 'REVIVED!' });
      return true; // Revived
    }
    return false;
  }

  // Generate random item choices for post-combat reward.
  // charId filters the pool: char-specific relics only appear for that character.
  generateChoices(count = 3, charId = null) {
    const pool = Object.keys(ItemDefinitions).filter(id => {
      if (this.equipped.includes(id)) return false;
      const def = ItemDefinitions[id];
      if (def.charSpecific) return def.charSpecific === charId;
      return true;
    });
    // RISK-05: Fisher-Yates shuffle avoids biased distribution from sort
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length));
  }
}
