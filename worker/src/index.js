// Pastry Paladins room relay — a Cloudflare Worker + Durable Object.
// One Durable Object per room code. It is created in the Cloudflare data centre nearest the host,
// and every player connects to it over a WebSocket. It only forwards messages; the game's host
// browser stays authoritative.
//
// Frames (JSON text):
//   client -> relay : {d: msg}                 forwarded to the host as {f: clientId, d: msg}
//   client -> relay : {d: msg, b: 1}           also forwarded to every other client (player movement)
//   host   -> relay : {t: clientId, d: msg}    forwarded to that client as msg
//   host   -> relay : {t: '*', d: msg}         forwarded to every client
//   relay  -> host  : {f: id, d: {type: '__hello'}} / {type: '__bye'} when clients join / leave
//   relay  -> client: {type: '__welcome'} on join, {type: '__nohost'} if the room does not exist,
//                     {type: '__hostleft'} if the host leaves

export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const url = new URL(request.url);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'client';
    const id = (url.searchParams.get('id') || '').slice(0, 64);
    if (!id) return new Response('Missing id', { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (role === 'host') {
      for (const old of this.state.getWebSockets('host')) { try { old.close(4000, 'replaced'); } catch (e) { /* gone */ } }
      this.state.acceptWebSocket(server, ['host']);
      server.serializeAttachment({ role, id });
    } else {
      this.state.acceptWebSocket(server, ['client', 'c:' + id]);
      server.serializeAttachment({ role, id });
      const host = this.state.getWebSockets('host')[0];
      if (!host) {
        server.send(JSON.stringify({ type: '__nohost' }));
        server.close(4004, 'no host');
      } else {
        host.send(JSON.stringify({ f: id, d: { type: '__hello' } }));
        server.send(JSON.stringify({ type: '__welcome' }));
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    const me = ws.deserializeAttachment() || {};
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (me.role === 'host') {
      const out = JSON.stringify(m.d);
      const targets = m.t === '*' ? this.state.getWebSockets('client') : this.state.getWebSockets('c:' + m.t);
      for (const s of targets) { try { s.send(out); } catch (e) { /* closing */ } }
    } else {
      const host = this.state.getWebSockets('host')[0];
      if (host) { try { host.send(JSON.stringify({ f: me.id, d: m.d })); } catch (e) { /* closing */ } }
      if (m.b) {
        const out = JSON.stringify({ ...m.d, _from: me.id });
        for (const s of this.state.getWebSockets('client')) if (s !== ws) { try { s.send(out); } catch (e) { /* closing */ } }
      }
    }
  }

  webSocketClose(ws) { this.left(ws); }
  webSocketError(ws) { this.left(ws); }

  left(ws) {
    const me = ws.deserializeAttachment() || {};
    if (me.role === 'host') {
      for (const s of this.state.getWebSockets('client')) {
        try { s.send(JSON.stringify({ type: '__hostleft' })); s.close(4001, 'host left'); } catch (e) { /* gone */ }
      }
    } else {
      const host = this.state.getWebSockets('host')[0];
      if (host) { try { host.send(JSON.stringify({ f: me.id, d: { type: '__bye' } })); } catch (e) { /* gone */ } }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4,8})$/);
    if (m) return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('Pastry Paladins relay is running', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return new Response('Not found', { status: 404 });
  },
};
