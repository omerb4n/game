// Networking: host-authoritative star topology over WebRTC (PeerJS) or BroadcastChannel (testing).
import { uid } from './util.js';

const PREFIX = 'pastrypaladins-v1-';
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
    if (msg.type === '__ping') { this.sendTo(from, { type: '__pong', t: msg.t }); return; }
    if (msg.type === '__pong') { this.stats.rtt = this.stats.rtt * 0.8 + (performance.now() - msg.t) * 0.2; return; }
    const p = this.peers.get(from);
    if (p) p.lastSeen = performance.now();
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
  broadcast(msg, except) {
    for (const [id, p] of this.peers) if (id !== except) { try { p.send(msg); } catch (e) { /* ignore */ } }
  }
  // Generic "relay" helper: from anywhere, deliver to everyone else
  emit(msg) {
    if (this.role === 'host') this.broadcast(msg);
    else if (this.role === 'client') this.send(msg);
  }
  startHeartbeat() {
    this._hb = setInterval(() => {
      const now = performance.now();
      for (const [id, p] of this.peers) {
        try { p.send({ type: '__ping', t: now }); } catch (e) { /* ignore */ }
        if (now - p.lastSeen > 8000) this._dropPeer(id);
      }
    }, 1000);
  }
  _addPeer(id, sendFn, close) {
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

// ---------------------------------------------------------------- PeerJS transport
export async function hostSession(code, useBC = false) {
  if (useBC) return hostBC(code);
  const Peer = await loadPeerJS();
  const s = new Session('host');
  s.code = code;
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + code, { debug: 0 });
    let opened = false;
    s._closeTransport = () => { try { peer.destroy(); } catch (e) { /* ignore */ } };
    peer.on('open', () => { opened = true; s.startHeartbeat(); resolve(s); });
    peer.on('error', (err) => {
      if (!opened) reject(new Error(err.type === 'unavailable-id' ? 'Room code in use, try again.' : 'Could not create room: ' + (err.type || err.message)));
    });
    peer.on('disconnected', () => { if (!s.closed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
    peer.on('connection', (conn) => {
      const id = conn.peer;
      conn.on('open', () => {
        s._addPeer(id, (m) => conn.send(m), () => conn.close());
        s.onPeerJoin?.(id);
      });
      conn.on('data', (d) => s._dispatch(d, id));
      conn.on('close', () => s._dropPeer(id));
      conn.on('error', () => s._dropPeer(id));
    });
    setTimeout(() => { if (!opened) reject(new Error('Timed out contacting the matchmaking server.')); }, 12000);
  });
}

export async function joinSession(code, useBC = false) {
  if (useBC) return joinBC(code);
  const Peer = await loadPeerJS();
  const s = new Session('client');
  s.code = code;
  return new Promise((resolve, reject) => {
    const peer = new Peer(undefined, { debug: 0 });
    let done = false;
    s._closeTransport = () => { try { peer.destroy(); } catch (e) { /* ignore */ } };
    peer.on('error', (err) => {
      if (!done) { done = true; reject(new Error(err.type === 'peer-unavailable' ? `Room ${code} not found.` : 'Connection error: ' + (err.type || err.message))); }
    });
    peer.on('open', (myId) => {
      s.myId = myId;
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        s._addPeer('host', (m) => conn.send(m), () => conn.close());
        s.startHeartbeat();
        done = true;
        resolve(s);
      });
      conn.on('data', (d) => s._dispatch(d, 'host'));
      conn.on('close', () => s._dropPeer('host'));
      conn.on('error', () => s._dropPeer('host'));
    });
    setTimeout(() => { if (!done) { done = true; reject(new Error('Timed out joining room.')); s.close(); } }, 15000);
  });
}

// ---------------------------------------------------------------- BroadcastChannel transport (same device, testing)
function hostBC(code) {
  const s = new Session('host');
  s.code = code;
  const ch = new BroadcastChannel('pp-room-' + code);
  s._closeTransport = () => ch.close();
  ch.onmessage = (ev) => {
    const { from, to, data } = ev.data;
    if (to !== 'host') return;
    if (data.type === '__hello') {
      s._addPeer(from, (m) => ch.postMessage({ from: 'host', to: from, data: m }), () => {});
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
        s._addPeer('host', (m) => ch.postMessage({ from: s.myId, to: 'host', data: m }), () => {});
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
