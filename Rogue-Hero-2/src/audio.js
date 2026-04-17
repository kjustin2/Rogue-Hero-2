import { events } from './EventBus.js';

export class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.tempoVal = 50;
    this.masterVolume = 1.0;
    this._sfxVolume = 0.7;

    // BGM handling — two elements for gapless crossfade
    this.bgmAudio = new Audio();
    this.bgmAudio.volume = 0.4;
    this.currentBgmType = null;
    this.currentBgmFile = null;
    this._combatTrackLocked = false; // once combat starts, loop the same song

    // Track pools (all MP3)
    this.tracks = {
      boss:   ['Boss_Battle.mp3','Boss_Battle2.mp3','Boss_Battle3.mp3',
               'Boss_Battle4.mp3','Boss_Battle5.mp3','Boss_Battle6.mp3',
               'Boss_Battle7.mp3'],
      normal: ['Normal_Battle.mp3','Normal_Battle2.mp3','Normal_Battle3.mp3',
               'Normal_Battle4.mp3','Normal_Battle5.mp3','Normal_Battle6.mp3',
               'Normal_Battle7.mp3', 'Normal_Battle8.mp3', 'Normal_Battle9.mp3',
               'Normal_Battle10.mp3', 'Normal_Battle11.mp3', 'Normal_Battle12.mp3'],
      map:    ['Selection_Map.mp3','Selection_Map2.mp3','Selection_Map3.mp3', 'Selection_Map4.mp3', 'Selection_Map5.mp3', 'Selection_Map6.mp3'],
      menu:   ['Selection_Map.mp3','Selection_Map2.mp3','Selection_Map3.mp3', 'Selection_Map4.mp3', 'Selection_Map5.mp3', 'Selection_Map6.mp3'],
      intro:  ['Main_Menu.mp3', 'Main_Menu2.mp3', 'Main_Menu3.mp3', 'Main_Menu4.mp3', 'Main_Menu5.mp3', 'Main_Menu6.mp3', 'Main_Menu7.mp3'],
    };
    // Per-pool shuffle index so we don't repeat until all played
    this._poolIndex = {};

    // When a track ends, loop same song in combat or queue next from pool
    this.bgmAudio.addEventListener('ended', () => {
      if (this._combatTrackLocked && this.currentBgmFile) {
        // Same fight — replay the same song
        this.bgmAudio.currentTime = 0;
        this.bgmAudio.play().catch(() => {});
      } else if (this.currentBgmType && this.currentBgmType !== 'intro') {
        this._playFromPool(this.currentBgmType);
      } else if (this.currentBgmType === 'intro') {
        this.bgmAudio.currentTime = 0;
        this.bgmAudio.play().catch(() => {});
      }
    });

    events.on('ZONE_TRANSITION', ({ oldZone, newZone }) => {
      this.currentZone = newZone;
      this.zoneTransition();
    });
    events.on('PLAY_SOUND', (name) => { if (this[name]) this[name](); });
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }

  _pickTrack(type) {
    const pool = this.tracks[type];
    if (!pool || pool.length === 0) return null;
    if (pool.length === 1) return pool[0];

    // Shuffle-bag: reset when exhausted, avoid immediate repeat
    if (!this._poolIndex[type] || this._poolIndex[type].length === 0) {
      const indices = pool.map((_, i) => i).sort(() => Math.random() - 0.5);
      // Avoid replaying the track that just finished
      if (this.currentBgmFile) {
        const last = pool.indexOf(this.currentBgmFile);
        if (last !== -1 && indices[0] === last && indices.length > 1) {
          [indices[0], indices[1]] = [indices[1], indices[0]];
        }
      }
      this._poolIndex[type] = indices;
    }
    return pool[this._poolIndex[type].shift()];
  }

  _playFromPool(type) {
    const file = this._pickTrack(type);
    if (!file) return;
    this.currentBgmFile = file;
    this.bgmAudio.loop = false;
    this.bgmAudio.src = 'music/' + file;
    this.bgmAudio.play().catch(e => console.warn('[Audio] play blocked:', e));
    console.log(`[Audio] Playing ${type}: ${file}`);
  }

  playBGM(type) {
    const resolved = (type === 'menu') ? 'map' : type;
    if (this.currentBgmType === resolved && this._combatTrackLocked) return; // mid-fight, don't interrupt
    if (this.currentBgmType === resolved && !this._combatTrackLocked) return; // same non-combat type
    this._combatTrackLocked = (resolved === 'boss' || resolved === 'normal');
    this.currentBgmType = resolved;
    this._playFromPool(resolved);
  }

  silenceMusic() {
    this._combatTrackLocked = false;
    this.currentBgmType = null;
    this.currentBgmFile = null;
    this.bgmAudio.pause();
    this.bgmAudio.currentTime = 0;
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.bgmAudio.volume = 0.4 * this.masterVolume;
    this._sfxVolume = 0.7 * this.masterVolume;
  }

  getMasterVolume() { return this.masterVolume; }

  updateTempoHum(tempoValue, isPlaying) {
    this.tempoVal = tempoValue;
  }

  _tone(freq, type, dur, vol, attack) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      const scaledVol = vol * this.masterVolume;
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(scaledVol, this.ctx.currentTime + (attack || 0.01));
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur + 0.05);
    } catch (e) {}
  }

  _noise(dur, vol, freq) {
    if (!this.ctx) return;
    try {
      const bufSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq || 1000;
      filter.Q.value = 0.5;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol * this.masterVolume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
      src.start(); src.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  }

  _tFreq(base) {
    const t = this.tempoVal;
    if (t >= 90) return base * 1.5;
    if (t >= 70) return base * 1.25;
    if (t < 30) return base * 0.8;
    return base;
  }

  hit() { this._tone(this._tFreq(300), 'square', 0.08, 0.18); this._noise(0.04, 0.1, 1500); }
  heavyHit() { this._tone(this._tFreq(120), 'sawtooth', 0.22, 0.28); this._noise(0.15, 0.2, 400); }
  miss() { this._tone(180, 'sine', 0.14, 0.06); }
  kill() { this._tone(this._tFreq(520), 'sine', 0.15, 0.22); this._tone(this._tFreq(740), 'sine', 0.1, 0.1, 0.03); }
  dodge() { this._tone(this._tFreq(380), 'sine', 0.09, 0.07); }
  perfect() { this._tone(820, 'sine', 0.32, 0.18); this._tone(1250, 'sine', 0.22, 0.12, 0.04); }
  playerHit() { this._noise(0.2, 0.35, 300); this._tone(140, 'sawtooth', 0.22, 0.22); }
  crash() {
    this._noise(0.42, 0.55, 180);
    this._tone(75, 'sawtooth', 0.55, 0.45);
    this._tone(38, 'sine', 0.85, 0.32);
  }
  zoneTransition() {
    this._tone(this._tFreq(660), 'sine', 0.12, 0.1);
    this._tone(this._tFreq(880), 'sine', 0.08, 0.06, 0.02);
  }
  bossPhase() {
    this._tone(200, 'sawtooth', 0.3, 0.25);
    this._noise(0.3, 0.15, 400);
    this._tone(100, 'sine', 0.5, 0.18, 0.05);
  }
  itemPickup() {
    this._tone(660, 'sine', 0.1, 0.1);
    this._tone(880, 'sine', 0.1, 0.08, 0.05);
    this._tone(1100, 'sine', 0.15, 0.06, 0.1);
  }
  upgrade() {
    this._tone(440, 'sine', 0.1, 0.1);
    this._tone(660, 'sine', 0.15, 0.1, 0.05);
  }
  victoryFanfare() {
    // Rising triumphant chord arpeggio
    const notes = [261.6, 329.6, 392, 523.3, 659.3, 783.9, 1046.5];
    notes.forEach((freq, i) => {
      this._tone(freq, 'sine', 0.18, 0.35, i * 0.07);
    });
    // Low bass thud
    this._tone(65, 'sawtooth', 0.3, 0.4, 0.0);
    // High shimmer
    this._tone(2093, 'sine', 0.08, 0.6, 0.2);
  }
}
