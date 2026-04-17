// Lobby.js — Lobby state + room codes + ready checks + host migration.
// Stub: integration point for main.js. Solo runs use Lobby with host=local
// and a single ready slot.

export const LOBBY_STATES = {
  IDLE: 'idle', JOINING: 'joining', READY: 'ready', IN_RUN: 'in_run', ENDED: 'ended'
};

export class Lobby {
  constructor(net) {
    this.net = net;
    this.state = LOBBY_STATES.IDLE;
    this.roomCode = null;
    this.hostPeerId = null;
    this.slots = [];           // { peerId, name, charId, ready }
    this.maxPlayers = 4;
    this.seed = null;
    this.difficulty = 0;
  }

  static makeRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  createHosted({ seed, difficulty }) {
    this.roomCode = Lobby.makeRoomCode();
    this.seed = seed;
    this.difficulty = difficulty;
    this.hostPeerId = this.net.localPeerId;
    this.slots = [{ peerId: this.hostPeerId, name: 'P1', charId: null, ready: false }];
    this.state = LOBBY_STATES.READY;
    return this.roomCode;
  }

  async join(roomCode) {
    this.roomCode = roomCode;
    this.state = LOBBY_STATES.JOINING;
    await this.net.connect(roomCode);
    this.state = LOBBY_STATES.READY;
  }

  setReady(peerId, ready) {
    const slot = this.slots.find(s => s.peerId === peerId);
    if (slot) slot.ready = ready;
  }

  setChar(peerId, charId) {
    const slot = this.slots.find(s => s.peerId === peerId);
    if (slot) slot.charId = charId;
  }

  allReady() {
    return this.slots.length > 0 && this.slots.every(s => s.ready && s.charId);
  }

  startRun() { this.state = LOBBY_STATES.IN_RUN; }
  endRun()   { this.state = LOBBY_STATES.ENDED; }

  // Promote lowest-id remaining peer if host drops
  migrateHost() {
    const sorted = [...this.slots].sort((a, b) => a.peerId.localeCompare(b.peerId));
    if (sorted.length > 0) this.hostPeerId = sorted[0].peerId;
  }
}
