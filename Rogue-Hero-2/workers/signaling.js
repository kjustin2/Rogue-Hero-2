// RH2 Signaling Worker — Cloudflare Durable Object WebSocket relay.
//
// One Room DO instance per room code. Each instance holds all WebSockets for
// that room and relays SDP offers, SDP answers, and ICE candidates between
// peers. Uses Hibernatable WebSockets so the DO sleeps (and costs nothing)
// when no messages are flowing.
//
// Protocol (all messages are JSON):
//   client → server: { type:'join',   peerId:'<id>' }
//   server → client: { type:'welcome', peers:['<id>', ...] }  // existing peers
//   server → others: { type:'peer_joined', peerId:'<id>' }
//   client → server: { type:'signal',  to:'<id>', data:{type,sdp?|candidate?} }
//   server → target: { type:'signal',  from:'<id>', data:... }
//   server → others: { type:'peer_left', peerId:'<id>' }

export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    // Health check (non-WS requests)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('RH2 Signal OK\n', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Called by the runtime whenever a WS message arrives (hibernation-safe).
  async webSocketMessage(ws, message) {
    let msg;
    try { msg = JSON.parse(message); } catch { return; }

    const allWs = this.state.getWebSockets();

    if (msg.type === 'join' && msg.peerId) {
      ws.serializeAttachment({ peerId: msg.peerId });

      // Tell the new peer who is already in the room.
      const existing = allWs
        .filter(s => s !== ws)
        .map(s => { try { return s.deserializeAttachment()?.peerId; } catch { return null; } })
        .filter(Boolean);
      ws.send(JSON.stringify({ type: 'welcome', peers: existing }));

      // Tell everyone else that this peer arrived.
      for (const s of allWs) {
        if (s === ws) continue;
        try { s.send(JSON.stringify({ type: 'peer_joined', peerId: msg.peerId })); } catch {}
      }

    } else if (msg.type === 'signal' && msg.to && msg.data) {
      let from;
      try { from = ws.deserializeAttachment()?.peerId; } catch {}

      for (const s of allWs) {
        let att;
        try { att = s.deserializeAttachment(); } catch { continue; }
        if (att?.peerId === msg.to) {
          try { s.send(JSON.stringify({ type: 'signal', from, data: msg.data })); } catch {}
          break;
        }
      }
    }
  }

  // Called when a WebSocket closes cleanly.
  async webSocketClose(ws) {
    this._handleDisconnect(ws);
  }

  // Called on network error (also counts as a disconnect).
  async webSocketError(ws) {
    this._handleDisconnect(ws);
  }

  _handleDisconnect(ws) {
    let peerId;
    try { peerId = ws.deserializeAttachment()?.peerId; } catch {}
    if (!peerId) return;
    for (const s of this.state.getWebSockets()) {
      if (s === ws) continue;
      try { s.send(JSON.stringify({ type: 'peer_left', peerId })); } catch {}
    }
  }
}

// Worker entrypoint — routes each request to the correct Room DO by room code.
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
      });
    }

    const url = new URL(request.url);

    // Root path — health check
    if (url.pathname === '/' || url.pathname === '') {
      return new Response('RH2 Signal OK\n', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Extract and sanitise room code from path (e.g. /AB3XY2)
    const roomId = url.pathname.slice(1).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    if (!roomId) {
      return new Response('Room ID required\n', { status: 400 });
    }

    const id = env.ROOMS.idFromName(roomId);
    const obj = env.ROOMS.get(id);
    return obj.fetch(request);
  },
};
