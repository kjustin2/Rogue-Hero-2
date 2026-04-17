// MetaProgress.js — Persistent unlock + leaderboard system using localStorage
import { rollBox } from './Cosmetics.js';

const STORAGE_KEY = 'rogue_hero_meta';

const _defaultEquipped = () => ({
  bodyColor: null, outlineColor: null, shape: null,
  trail: null, flash: null, deathBurst: null, aura: null,
  killEffect: null, title: null,
});

const DEFAULT_STATE = {
  unlockedCharacters: ['blade'],
  difficultyTiers: { blade: 0, frost: 0, shadow: 0 },
  unlockedBonusCards: [],
  totalRuns: 0,
  totalWins: 0,
  bestFloor: 0,
  achievements: {},
  leaderboard: [],
  perCharacterStats: {
    blade:  { runs: 0, wins: 0, bestFloor: 0 },
    frost:  { runs: 0, wins: 0, bestFloor: 0 },
    shadow: { runs: 0, wins: 0, bestFloor: 0 },
    echo:   { runs: 0, wins: 0, bestFloor: 0 },
    wraith: { runs: 0, wins: 0, bestFloor: 0 },
    vanguard: { runs: 0, wins: 0, bestFloor: 0 },
  },
  // Mastery tracks runs played per character — unlocks character-specific cards
  charMastery: {
    blade: 0, frost: 0, shadow: 0, echo: 0, wraith: 0, vanguard: 0,
  },
  masteryUnlockedCards: [], // globally unlocked via mastery
  masterVolume: 1.0,
  // ── Cosmetics ──
  cosmetics: {
    gold: 0,
    owned: [],
    totalBoxesOpened: 0,
    equipped: {
      blade:    _defaultEquipped(),
      frost:    _defaultEquipped(),
      shadow:   _defaultEquipped(),
      echo:     _defaultEquipped(),
      wraith:   _defaultEquipped(),
      vanguard: _defaultEquipped(),
    },
  },
};

export class MetaProgress {
  constructor() {
    this.state = this.load();
    console.log('[Meta] Loaded progress:', JSON.stringify(this.state));
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        return { ...DEFAULT_STATE, ...saved };
      }
    } catch (e) {
      console.warn('[Meta] Failed to load save data, using defaults');
    }
    return { ...DEFAULT_STATE };
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[Meta] Failed to save progress');
    }
  }

  isCharacterUnlocked(charId) { return this.state.unlockedCharacters.includes(charId); }

  unlockCharacter(charId) {
    if (!this.state.unlockedCharacters.includes(charId)) {
      this.state.unlockedCharacters.push(charId);
      console.log(`[Meta] Unlocked character: ${charId}`);
      this.save();
      return true;
    }
    return false;
  }

  getMaxDifficulty(charId) { return this.state.difficultyTiers[charId] || 0; }

  unlockDifficulty(charId, tier) {
    const current = this.state.difficultyTiers[charId] || 0;
    if (tier > current) {
      this.state.difficultyTiers[charId] = tier;
      this.save();
      return true;
    }
    return false;
  }

  isBonusCardUnlocked(cardId) { return this.state.unlockedBonusCards.includes(cardId); }

  unlockBonusCard(cardId) {
    if (!this.state.unlockedBonusCards.includes(cardId)) {
      this.state.unlockedBonusCards.push(cardId);
      this.save();
      return true;
    }
    return false;
  }

  recordRun(won, floor) {
    this.state.totalRuns++;
    if (won) this.state.totalWins++;
    if (floor > this.state.bestFloor) this.state.bestFloor = floor;
    this.save();
  }

  recordCharRun(charId, won, floor) {
    if (!this.state.perCharacterStats) this.state.perCharacterStats = {};
    if (!this.state.perCharacterStats[charId]) {
      this.state.perCharacterStats[charId] = { runs: 0, wins: 0, bestFloor: 0 };
    }
    const s = this.state.perCharacterStats[charId];
    s.runs++;
    if (won) s.wins++;
    if (floor > s.bestFloor) s.bestFloor = floor;
    this.save();
  }

  getCharStats(charId) {
    return (this.state.perCharacterStats && this.state.perCharacterStats[charId])
      || { runs: 0, wins: 0, bestFloor: 0 };
  }

  setAchievement(key) {
    if (!this.state.achievements[key]) {
      this.state.achievements[key] = true;
      this.save();
      return true;
    }
    return false;
  }

  hasAchievement(key) { return !!this.state.achievements[key]; }

  // ── SCORE / LEADERBOARD ──

  submitScore(entry) {
    // entry: { score, character, floor, difficulty, seed, date }
    if (!this.state.leaderboard) this.state.leaderboard = [];
    this.state.leaderboard.push(entry);
    this.state.leaderboard.sort((a, b) => b.score - a.score);
    this.state.leaderboard = this.state.leaderboard.slice(0, 10);
    this.save();
    console.log(`[Meta] Score submitted: ${entry.score}`);
  }

  getLeaderboard() {
    return this.state.leaderboard || [];
  }

  resetAll() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.save();
    console.log('[Meta] Progress reset');
  }

  // ── MASTERY ──

  // Mastery thresholds per level (runs required)
  static MASTERY_THRESHOLDS = [1, 3, 5, 10];

  getMasteryLevel(charId) {
    const runs = (this.state.charMastery && this.state.charMastery[charId]) || 0;
    let level = 0;
    for (const threshold of MetaProgress.MASTERY_THRESHOLDS) {
      if (runs >= threshold) level++;
      else break;
    }
    return level; // 0-4
  }

  getMasteryRuns(charId) {
    return (this.state.charMastery && this.state.charMastery[charId]) || 0;
  }

  incrementMastery(charId) {
    if (!this.state.charMastery) this.state.charMastery = {};
    if (!this.state.charMastery[charId]) this.state.charMastery[charId] = 0;
    const prevLevel = this.getMasteryLevel(charId);
    this.state.charMastery[charId]++;
    const newLevel = this.getMasteryLevel(charId);
    this.save();
    return newLevel > prevLevel ? newLevel : 0; // returns new mastery level if leveled up, else 0
  }

  isMasteryCardUnlocked(cardId) {
    return this.state.masteryUnlockedCards && this.state.masteryUnlockedCards.includes(cardId);
  }

  unlockMasteryCard(cardId) {
    if (!this.state.masteryUnlockedCards) this.state.masteryUnlockedCards = [];
    if (!this.state.masteryUnlockedCards.includes(cardId)) {
      this.state.masteryUnlockedCards.push(cardId);
      this.save();
      return true;
    }
    return false;
  }

  getMasterVolume() { return this.state.masterVolume !== undefined ? this.state.masterVolume : 1.0; }
  setMasterVolume(v) { this.state.masterVolume = Math.max(0, Math.min(1, v)); this.save(); }

  // ── COSMETICS ──

  _ensureCosmetics() {
    if (!this.state.cosmetics) {
      this.state.cosmetics = { gold: 0, owned: [], totalBoxesOpened: 0, equipped: {} };
    }
    if (!this.state.cosmetics.equipped) this.state.cosmetics.equipped = {};
    return this.state.cosmetics;
  }

  getGold() { return this._ensureCosmetics().gold; }

  addGold(amount) {
    this._ensureCosmetics().gold = Math.max(0, (this._ensureCosmetics().gold || 0) + amount);
    this.save();
  }

  spendGold(amount) {
    const c = this._ensureCosmetics();
    if ((c.gold || 0) < amount) return false;
    c.gold -= amount;
    this.save();
    return true;
  }

  openBox(tier) {
    const c = this._ensureCosmetics();
    const result = rollBox(tier, c.owned || []);
    c.totalBoxesOpened = (c.totalBoxesOpened || 0) + 1;
    const isDuplicate = (c.owned || []).includes(result.id);
    if (isDuplicate) {
      c.gold = (c.gold || 0) + 15; // refund gold for duplicate
    } else {
      if (!c.owned) c.owned = [];
      c.owned.push(result.id);
    }
    this.save();
    return { ...result, isDuplicate };
  }

  getOwned() { return this._ensureCosmetics().owned || []; }
  getOwnedInCategory(category) { return this.getOwned().filter(id => { const c = this._getCosmeticById(id); return c && c.category === category; }); }

  // Lazy import to avoid circular deps — CosmeticById is set externally
  _getCosmeticById(id) { return window._cosmeticDefs && window._cosmeticDefs[id]; }

  getEquipped(charId) {
    const c = this._ensureCosmetics();
    if (!c.equipped[charId]) c.equipped[charId] = _defaultEquipped();
    return c.equipped[charId];
  }

  equipCosmetic(charId, category, cosmeticId) {
    const c = this._ensureCosmetics();
    if (!c.equipped[charId]) c.equipped[charId] = _defaultEquipped();
    c.equipped[charId][category] = cosmeticId || null;
    this.save();
  }

  cosmeticsUnlocked() { return (this.state.totalRuns || 0) >= 1; }

  // Returns the highest card unlock tier available based on run history.
  // Tier 0: always available (from run 0)
  // Tier 1: after 2 total runs
  // Tier 2: after 5 total runs
  // Tier 3: after 10 total runs OR first win
  // Tier 4: after winning on Hard difficulty
  getUnlockedTier() {
    const runs = this.state.totalRuns || 0;
    const wins = this.state.totalWins || 0;
    const hardWin = (this.state.hardWins || 0) > 0;
    if (hardWin) return 4;
    if (runs >= 10 || wins >= 1) return 3;
    if (runs >= 5) return 2;
    if (runs >= 2) return 1;
    return 0;
  }

  recordHardWin() {
    this.state.hardWins = (this.state.hardWins || 0) + 1;
    this.save();
  }
}

// ── SCORE CALCULATOR ──

export function calculateScore(stats) {
  let score = 0;
  score += (stats.kills || 0) * 10;
  score += (stats.roomsCleared || 0) * 50;
  score += (stats.perfectDodges || 0) * 100;
  score += (stats.cardsPlayed || 0) * 5;
  score += (stats.manualCrashes || 0) * 75;
  score += (stats.highestCombo || 0) * 25;
  score += (stats.itemsCollected || 0) * 30;
  // Time bonus: faster = more points (base 300, minus elapsed seconds)
  const timeBonus = Math.max(0, 300 - Math.floor(stats.elapsedTime || 0));
  score += timeBonus;
  // Floor bonus
  score += (stats.floor || 0) * 200;
  // Win bonus
  if (stats.won) score += 1000;
  // Difficulty multiplier
  const diffMults = [1.0, 1.5, 2.5];
  score = Math.round(score * (diffMults[stats.difficulty || 0] || 1.0));
  return score;
}
