// Networking: host-authoritative star topology over WebRTC (PeerJS), an MQTT relay fallback,
// or BroadcastChannel (testing).
import { uid } from './util.js';
import { RELAY_URL } from './config.js';

const PREFIX = 'pastrypaladins-v1-';
const STALE_MS = 3500; // no traffic for this long: show "reconnecting"
const DROP_MS = 30000; // no traffic for this long: player has left
// Optional self-hosted PeerServer: ?peerhost=example.com&peerport=443&peerpath=/
function peerOptions() {
  const q = new URLSearchParams(location.search);
  const o = { debug: 0 };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = Number(q.get('peerport') || (location.protocol === 'https:' ? 443 : 80));
    o.path = q.get('peerpath') || '/';
    o.secure = q.has('peersecure') ? q.get('peersecure') === '1' : location.protocol === 'https:';
  }
  return o;
}
let peerLibPromise = null;

function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLibPromise) return peerLibPromise;
  peerLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS failed to load')));
    s.onerror = () => { peerLibPromise = null; reject(new Error('Could not load networking library. Check your connection.')); };
    document.head.appendChild(s);
  });
  return peerLibPromise;
}

export class Session {
  constructor(role) {
    this.role = role; // 'local' | 'host' | 'client'
    this.code = '';
    this.myId = role === 'host' ? 'host' : role === 'local' ? 'local' : uid();
    this.peers = new Map(); // peerId -> {send, name, lastSeen}
    this.handlers = {};
    this.onPeerJoin = null;
    this.onPeerLeave = null;
    this.onDisconnect = null;
    this.closed = false;
    this.stats = { rtt: 0 };
    this._hb = null;
  }
  get isHost() { return this.role === 'host' || this.role === 'local'; }
  get online() { return this.role !== 'local'; }
  on(type, fn) { this.handlers[type] = fn; }
  _dispatch(msg, from) {
    if (!msg || !msg.type) return;
    // any traffic (including heartbeat replies) proves the peer is alive
    const seen = this.peers.get(from);
    if (seen) { seen.lastSeen = performance.now(); if (seen.stale) { seen.stale = false; this.onPeerStale?.(from, false); } }
    if (msg.type === '__ping') { this.sendTo(from, { type: '__pong', t: msg.t }); return; }
    if (msg.type === '__pong') {
      const rtt = performance.now() - msg.t;
      this.stats.rtt = this.stats.rtt ? this.stats.rtt * 0.7 + rtt * 0.3 : rtt;
      const p = this.peers.get(from);
      if (p) p.rtt = p.rtt ? p.rtt * 0.7 + rtt * 0.3 : rtt;
      return;
    }
    const h = this.handlers[msg.type];
    if (h) h(msg, from);
  }
  // client: send to host. host: send to specific peer
  sendTo(peerId, msg) {
    const p = this.peers.get(peerId);
    if (p) { try { p.send(msg); } catch (e) { /* ignore */ } }
  }
  send(msg) { // client -> host
    if (this.role === 'client') this.sendTo('host', msg);
  }
  // client -> host, and (when the transport supports it) straight to the other clients too
  sendShared(msg) {
    if (this.role !== 'client') return;
    if (this._cfShared) this._cfShared(msg);
    else this.send(msg);
  }
  peerInfo(id) { const p = this.peers.get(id); return p ? { rtt: p.rtt || 0, via: p.via || '' } : null; }
  broadcast(msg, except) {
    for (const [id, p] of this.peers) if (id !== except) { try { p.send(msg); } catch (e) { /* ignore */ } }
  }
  // Generic "relay" helper: from anywhere, deliver to everyone else
  emit(msg) {
    if (this.role === 'host') this.broadcast(msg);
    else if (this.role === 'client') this.send(msg);
  }
  // Peers that go quiet are first marked stale (e.g. phone locked, network blip) and only dropped
  // after a long grace period, so a brief disconnect never kicks anyone out of the game.
  startHeartbeat() {
    clearInterval(this._hb);
    this._hb = setInterval(() => {
      const now = performance.now();
      for (const [id, p] of this.peers) {
        try { p.send({ type: '__ping', t: now }); } catch (e) { /* ignore */ }
        if (!p.stale && now - p.lastSeen > STALE_MS) { p.stale = true; this.onPeerStale?.(id, true); }
        if (now - p.lastSeen > DROP_MS) this._dropPeer(id);
      }
    }, 1000);
  }
  _addPeer(id, sendFn, close) {
    const old = this.peers.get(id);
    if (old) {
      // same player reconnecting: swap the transport, keep them in the game
      old.send = sendFn; old.close = close; old.lastSeen = performance.now();
      if (old.stale) { old.stale = false; this.onPeerStale?.(id, false); }
      this.onPeerRejoin?.(id);
      return;
    }
    this.peers.set(id, { send: sendFn, close, lastSeen: performance.now() });
  }
  _dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    try { p.close?.(); } catch (e) { /* ignore */ }
    if (this.role === 'client' && id === 'host') { this.onDisconnect?.('The host left the game.'); }
    else this.onPeerLeave?.(id);
  }
  close() {
    this.closed = true;
    clearInterval(this._hb);
    for (const [id, p] of this.peers) { try { p.close?.(); } catch (e) { /* ignore */ } }
    this.peers.clear();
    this._closeTransport?.();
  }
}

export function localSession() {
  return new Session('local');
}

// ---------------------------------------------------------------- Relay transport (MQTT over secure WebSockets)
// Direct WebRTC fails between some networks (mobile carrier NAT, strict routers). As a fallback every
// message is relayed through a public MQTT broker over wss:// — plain web traffic that works anywhere.
// The host listens on several brokers at once; a client uses the first broker it can reach.
const RELAY_BROKERS = (() => {
  const q = new URLSearchParams(location.search).get('relay');
  if (q) return q.split(',');
  return ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
})();
const RELAY_ROOT = 'pastrypaladins/v1/';
const topicHost = (code) => `${RELAY_ROOT}${code}/host`;
const topicClient = (code, id) => `${RELAY_ROOT}${code}/c/${id}`;
let mqttLibPromise = null;
function loadMqtt() {
  if (window.mqtt) return Promise.resolve(window.mqtt);
  if (mqttLibPromise) return mqttLibPromise;
  mqttLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/mqtt.min.js';
    s.onload = () => (window.mqtt ? resolve(window.mqtt) : reject(new Error('Relay library failed to load')));
    s.onerror = () => { mqttLibPromise = null; reject(new Error('Could not load relay library.')); };
    document.head.appendChild(s);
  });
  return mqttLibPromise;
}
function connectBroker(mqtt, url, timeout = 6000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const c = mqtt.connect(url, { clientId: 'pp_' + uid() + uid(), clean: true, connectTimeout: timeout, reconnectPeriod: 2000, keepalive: 30 });
    const t = setTimeout(() => { if (!settled) { settled = true; c.end(true); reject(new Error('relay timeout')); } }, timeout);
    c.once('connect', () => { if (!settled) { settled = true; clearTimeout(t); resolve(c); } });
    c.once('error', () => { if (!settled) { settled = true; clearTimeout(t); c.end(true); reject(new Error('relay error')); } });
  });
}

// Host side: accept clients through every reachable broker. Returns number of brokers connected.
async function startRelayHost(s) {
  let mqtt;
  try { mqtt = await loadMqtt(); } catch (e) { return 0; }
  s._relays = [];
  const results = await Promise.allSettled(RELAY_BROKERS.map((u) => connectBroker(mqtt, u)));
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const c = r.value;
    if (s.closed) { c.end(true); continue; }
    s._relays.push(c);
    c.subscribe(topicHost(s.code));
    c.on('message', (topic, payload) => {
      let m;
      try { m = JSON.parse(payload.toString()); } catch (e) { return; }
      const from = m.f;
      if (!from) return;
      if (m.d?.type === '__hello') {
        if (!s.peers.has(from)) {
          s._addPeer(from, (msg) => c.publish(topicClient(s.code, from), JSON.stringify(msg)), () => {});
          s.peers.get(from).relay = true;
          s.peers.get(from).via = 'relay';
          s.onPeerJoin?.(from);
        }
        c.publish(topicClient(s.code, from), JSON.stringify({ type: '__welcome' }));
        return;
      }
      if (m.d?.type === '__bye') { s._dropPeer(from); return; }
      if (s.peers.has(from)) s._dispatch(m.d, from);
    });
  }
  return s._relays.length;
}

// Client side: reach the host through the first broker that answers.
async function joinRelay(s, onStatus) {
  const mqtt = await loadMqtt();
  for (const url of RELAY_BROKERS) {
    let c;
    try { c = await connectBroker(mqtt, url); } catch (e) { continue; }
    onStatus?.('Room found? Asking the host through the relay…');
    const ok = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 6000);
      c.subscribe(topicClient(s.code, s.myId), () => {
        c.publish(topicHost(s.code), JSON.stringify({ f: s.myId, d: { type: '__hello' } }));
      });
      c.on('message', (topic, payload) => {
        let m;
        try { m = JSON.parse(payload.toString()); } catch (e) { return; }
        if (m.type === '__welcome') {
          if (!s.peers.has('host')) {
            clearTimeout(t);
            s._addPeer('host', (msg) => c.publish(topicHost(s.code), JSON.stringify({ f: s.myId, d: msg })), () => {
              try { c.publish(topicHost(s.code), JSON.stringify({ f: s.myId, d: { type: '__bye' } })); } catch (e) { /* ignore */ }
            });
            resolve(true);
          }
          return;
        }
        if (s.peers.has('host')) s._dispatch(m, 'host');
      });
    });
    if (ok) {
      s._relays = [c];
      s.transport = 'relay';
      return true;
    }
    c.end(true);
  }
  return false;
}

// ---------------------------------------------------------------- Cloudflare relay (Worker + Durable Object)
// Preferred transport when configured: a WebSocket to a room server at the nearest Cloudflare edge.
const CF_URL = (new URLSearchParams(location.search).get('cf') || RELAY_URL || '').replace(/\/$/, '');
function cfSocket(code, role, id) {
  return new WebSocket(`${CF_URL}/room/${code}?role=${role}&id=${encodeURIComponent(id)}`);
}

async function startCfHost(s) {
  if (!CF_URL) return false;
  s._cfStarting = true;
  const r = await new Promise((resolve) => {
    let ws;
    try { ws = cfSocket(s.code, 'host', 'host'); } catch (e) { resolve(false); return; }
    let opened = false;
    const t = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) { /* ignore */ } resolve(false); } }, 5000);
    ws.onopen = () => {
      opened = true; clearTimeout(t); s._cf = ws; s._cfLastMsg = performance.now();
      cfKeepAlive(s, () => { if (!s.closed && !s._cfStarting) startCfHost(s); });
      resolve(true);
    };
    ws.onerror = () => { if (!opened) { clearTimeout(t); resolve(false); } };
    ws.onclose = () => {
      if (s._cf !== ws) return;
      s._cf = null;
      // keep players; reconnect the room (the relay re-announces everyone still connected)
      if (!s.closed) setTimeout(() => { if (!s.closed && !s._cf && !s._cfStarting) startCfHost(s); }, 1000);
    };
    ws.onmessage = (ev) => {
      if (s._cf === ws) s._cfLastMsg = performance.now();
      if (ev.data === 'pong') return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      const from = m.f;
      if (!from || !m.d) return;
      if (m.d.type === '__hello') {
        const isNew = !s.peers.has(from);
        s._addPeer(from, (msg) => { const c = s._cf; if (c && c.readyState === 1) c.send(JSON.stringify({ t: from, d: msg })); }, () => {});
        const p = s.peers.get(from);
        p.via = 'cloudflare'; p.relay = true;
        if (isNew) s.onPeerJoin?.(from);
        return;
      }
      if (m.d.type === '__bye') { s._dropPeer(from); return; }
      if (m.d.type === '__lost') return; // network blip: heartbeat grace decides
      if (s.peers.has(from)) s._dispatch(m.d, from);
    };
  });
  s._cfStarting = false;
  // a reconnect attempt failed (e.g. still offline): keep trying while the room is open
  if (!r && s._cfHosted && !s.closed) setTimeout(() => { if (!s.closed && !s._cf && !s._cfStarting) startCfHost(s); }, 1500);
  if (r) s._cfHosted = true;
  return r;
}

// A WebSocket can stay "open" long after a phone's network has silently died, so both sides
// send a tiny keep-alive and treat a socket that has heard nothing for a few seconds as dead.
const CF_DEAD_MS = 4500;
function cfKeepAlive(s, onDead) {
  clearInterval(s._cfKa);
  s._cfKa = setInterval(() => {
    if (s.closed) { clearInterval(s._cfKa); return; }
    const ws = s._cf;
    if (!ws) return;
    if (ws.readyState === 1) { try { ws.send('ping'); } catch (e) { /* ignore */ } }
    if (performance.now() - (s._cfLastMsg || 0) > CF_DEAD_MS) {
      s._cf = null;
      try { ws.close(); } catch (e) { /* ignore */ }
      onDead();
    }
  }, 1000);
}

function cfClientSocket(s, onFirst) {
  let ws;
  try { ws = cfSocket(s.code, 'client', s.myId); } catch (e) { onFirst(false); return; }
  let first = true;
  const done = (v) => { if (first) { first = false; onFirst(v, ws); } };
  const t = setTimeout(() => { try { ws.close(); } catch (e) { /* ignore */ } done(false); }, 5000);
  ws.onerror = () => { clearTimeout(t); done(false); };
  ws.onclose = () => {
    clearTimeout(t);
    if (first) { done(false); return; }
    if (s._cf === ws) { s._cf = null; if (!s.closed) cfReconnect(s); }
  };
  ws.onmessage = (ev) => {
    if (s._cf === ws || first) s._cfLastMsg = performance.now();
    if (ev.data === 'pong') return;
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type === '__nohost') { clearTimeout(t); done(false); return; }
    if (m.type === '__welcome') { clearTimeout(t); s._cf = ws; s._cfLastMsg = performance.now(); done(true); return; }
    if (m.type === '__hostleft') { s._dropPeer('host'); return; }
    if (m.type === '__hostlost') { s.onLink?.('host-lost'); return; }
    if (m.type === '__hostback') { s.onLink?.('ok'); return; }
    if (m._from) { s._dispatch(m, m._from); return; } // another player's movement, sent directly
    if (s.peers.has('host')) s._dispatch(m, 'host');
  };
}

// Reconnect a dropped client socket with the same id, so the host keeps our player.
function cfReconnect(s) {
  if (s._reconnecting || s.closed) return;
  s._reconnecting = true;
  s.onLink?.('reconnecting');
  const started = performance.now();
  const attempt = () => {
    if (s.closed) return;
    if (performance.now() - started > DROP_MS) { s._reconnecting = false; s._dropPeer('host'); return; }
    cfClientSocket(s, (ok) => {
      if (s.closed) return;
      if (ok) {
        s._reconnecting = false;
        const p = s.peers.get('host');
        if (p) p.lastSeen = performance.now();
        s.onLink?.('ok');
        s.onReconnect?.();
      } else setTimeout(attempt, 1200);
    });
  };
  attempt();
}

async function joinCf(s) {
  if (!CF_URL) return false;
  return new Promise((resolve) => {
    cfClientSocket(s, (ok) => {
      if (!ok) { resolve(false); return; }
      s._addPeer('host', (msg) => { const c = s._cf; if (c && c.readyState === 1) c.send(JSON.stringify({ d: msg })); }, () => {
        const c = s._cf; s._cf = null;
        if (c) { try { c.close(1000, 'bye'); } catch (e) { /* ignore */ } }
      });
      s._cfShared = (msg) => { const c = s._cf; if (c && c.readyState === 1) c.send(JSON.stringify({ d: msg, b: 1 })); };
      s.transport = 'cloudflare';
      cfKeepAlive(s, () => cfReconnect(s));
      // when the phone comes back to the foreground, reconnect right away if the socket died
      s._onVis = () => { if (!document.hidden && !s.closed && (!s._cf || s._cf.readyState > 1)) cfReconnect(s); };
      document.addEventListener('visibilitychange', s._onVis);
      resolve(true);
    });
  });
}

// ---------------------------------------------------------------- Hosting (Cloudflare + WebRTC + relay)
export async function hostSession(code, useBC = false, attempt = 0) {
  if (useBC) return hostBC(code);
  let s;
  try {
    s = await hostPeer(code);
    await startCfHost(s);
  } catch (e) {
    // room code collision: retry with a fresh code
    if (e.code === 'taken' && attempt < 3) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
      return hostSession(c, false, attempt + 1);
    }
    // matchmaking server unreachable: host through the relay only
    s = new Session('host');
    s.code = code;
    s._closeTransport = () => {
      for (const c of s._relays || []) { try { c.end(true); } catch (x) { /* ignore */ } }
      try { s._cf?.close(1000, 'bye'); } catch (x) { /* ignore */ }
    };
    s.startHeartbeat();
    const cf = await startCfHost(s);
    const n = await startRelayHost(s);
    if (!n && !cf) { s.close(); throw e; }
    return s;
  }
  await startRelayHost(s);
  return s;
}

async function hostPeer(code) {
  const Peer = await loadPeerJS();
  const s = new Session('host');
  s.code = code;
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, peerOptions());
    let opened = false;
    s._closeTransport = () => {
      try { peer.destroy(); } catch (e) { /* ignore */ }
      for (const c of s._relays || []) { try { c.end(true); } catch (e) { /* ignore */ } }
      try { s._cf?.close(1000, 'bye'); } catch (e) { /* ignore */ }
    };
    peer.on('open', () => { opened = true; s.startHeartbeat(); resolve(s); });
    peer.on('error', (err) => {
      if (!opened) {
        const e = new Error(err.type === 'unavailable-id' ? 'Room code in use, try again.' : 'Could not create room: ' + (err.type || err.message));
        if (err.type === 'unavailable-id') e.code = 'taken';
        try { peer.destroy(); } catch (x) { /* ignore */ }
        reject(e);
      }
    });
    peer.on('disconnected', () => { if (!s.closed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
    peer.on('connection', (conn) => {
      const id = conn.peer;
      conn.on('open', () => {
        s._addPeer(id, (m) => conn.send(m), () => conn.close());
        s.peers.get(id).via = 'direct';
        s.onPeerJoin?.(id);
      });
      conn.on('data', (d) => s._dispatch(d, id));
      conn.on('close', () => { if (!s.peers.get(id)?.relay) s._dropPeer(id); });
      conn.on('error', () => { if (!s.peers.get(id)?.relay) s._dropPeer(id); });
    });
    setTimeout(() => { if (!opened) { try { peer.destroy(); } catch (x) { /* ignore */ } reject(new Error('Timed out contacting the matchmaking server.')); } }, 10000);
  });
}

// ---------------------------------------------------------------- Joining (try WebRTC, fall back to relay)
const DIRECT_TIMEOUT = 7000;
export async function joinSession(code, useBC = false, onStatus) {
  if (useBC) return joinBC(code);
  const s = new Session('client');
  s.code = code;
  const closeAll = () => {
    try { s._peer?.destroy(); } catch (e) { /* ignore */ }
    for (const c of s._relays || []) { try { c.end(true); } catch (e) { /* ignore */ } }
    try { s._cf?.close(1000, 'bye'); } catch (e) { /* ignore */ }
    if (s._onVis) document.removeEventListener('visibilitychange', s._onVis);
  };
  s._closeTransport = closeAll;
  if (CF_URL) {
    onStatus?.('Connecting through the fast relay…');
    if (await joinCf(s)) { s.startHeartbeat(); return s; }
  }
  onStatus?.('Connecting directly…');
  let direct = false;
  try { direct = await joinDirect(s, code); } catch (e) { direct = false; }
  if (direct) { s.transport = 'direct'; s.startHeartbeat(); return s; }
  // tear down the failed WebRTC attempt so it can't open late
  try { s._peer?.destroy(); } catch (e) { /* ignore */ }
  s._peer = null;
  s.myId = uid() + uid();
  onStatus?.('Direct link blocked by the network — switching to relay…');
  let ok = false;
  try { ok = await joinRelay(s, onStatus); } catch (e) { ok = false; }
  if (!ok) { s.close(); throw new Error(`Couldn't reach room ${code}. Check the code, and that the host still has the room open.`); }
  s.startHeartbeat();
  return s;
}

async function joinDirect(s, code) {
  const Peer = await loadPeerJS();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const peer = new Peer(undefined, peerOptions());
    s._peer = peer;
    peer.on('error', () => finish(false));
    peer.on('open', (myId) => {
      s.myId = myId;
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (done) { try { conn.close(); } catch (e) { /* ignore */ } return; }
        s._addPeer('host', (m) => conn.send(m), () => conn.close());
        conn.on('close', () => s._dropPeer('host'));
        conn.on('error', () => s._dropPeer('host'));
        finish(true);
      });
      conn.on('data', (d) => s._dispatch(d, 'host'));
    });
    setTimeout(() => finish(false), DIRECT_TIMEOUT);
  });
}

// ---------------------------------------------------------------- BroadcastChannel transport (same device, testing)
// ?lag=ms adds simulated one-way latency with jitter, to test netcode on one machine.
const LAG = Number(new URLSearchParams(location.search).get('lag') || 0);
function post(ch, msg) {
  if (!LAG) return ch.postMessage(msg);
  setTimeout(() => { try { ch.postMessage(msg); } catch (e) { /* closed */ } }, LAG / 2 + Math.random() * LAG * 0.2);
}
function hostBC(code) {
  const s = new Session('host');
  s.code = code;
  const ch = new BroadcastChannel('pp-room-' + code);
  s._closeTransport = () => ch.close();
  ch.onmessage = (ev) => {
    const { from, to, data } = ev.data;
    if (to !== 'host') return;
    if (data.type === '__hello') {
      s._addPeer(from, (m) => post(ch, { from: 'host', to: from, data: m }), () => {});
      ch.postMessage({ from: 'host', to: from, data: { type: '__welcome' } });
      s.onPeerJoin?.(from);
      return;
    }
    if (!s.peers.has(from)) return;
    s._dispatch(data, from);
  };
  s.startHeartbeat();
  return Promise.resolve(s);
}

function joinBC(code) {
  const s = new Session('client');
  s.code = code;
  const ch = new BroadcastChannel('pp-room-' + code);
  s._closeTransport = () => ch.close();
  return new Promise((resolve, reject) => {
    let done = false;
    ch.onmessage = (ev) => {
      const { from, to, data } = ev.data;
      if (to !== s.myId) return;
      if (data.type === '__welcome') {
        if (done) return;
        done = true;
        s._addPeer('host', (m) => post(ch, { from: s.myId, to: 'host', data: m }), () => {});
        s.startHeartbeat();
        resolve(s);
        return;
      }
      s._dispatch(data, 'host');
    };
    ch.postMessage({ from: s.myId, to: 'host', data: { type: '__hello' } });
    setTimeout(() => { if (!done) { done = true; reject(new Error(`Room ${code} not found.`)); s.close(); } }, 3000);
  });
}
