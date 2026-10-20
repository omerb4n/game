var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var Room = class {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Expected WebSocket", { status: 426 });
    const url = new URL(request.url);
    const role = url.searchParams.get("role") === "host" ? "host" : "client";
    const id = (url.searchParams.get("id") || "").slice(0, 64);
    if (!id)
      return new Response("Missing id", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (role === "host") {
      for (const old of this.state.getWebSockets("host")) {
        try {
          old.close(4e3, "replaced");
        } catch (e) {
        }
      }
      this.state.acceptWebSocket(server, ["host"]);
      server.serializeAttachment({ role, id });
    } else {
      this.state.acceptWebSocket(server, ["client", "c:" + id]);
      server.serializeAttachment({ role, id });
      const host = this.state.getWebSockets("host")[0];
      if (!host) {
        server.send(JSON.stringify({ type: "__nohost" }));
        server.close(4004, "no host");
      } else {
        host.send(JSON.stringify({ f: id, d: { type: "__hello" } }));
        server.send(JSON.stringify({ type: "__welcome" }));
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, raw) {
    if (typeof raw !== "string")
      return;
    const me = ws.deserializeAttachment() || {};
    let m;
    try {
      m = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (me.role === "host") {
      const out = JSON.stringify(m.d);
      const targets = m.t === "*" ? this.state.getWebSockets("client") : this.state.getWebSockets("c:" + m.t);
      for (const s of targets) {
        try {
          s.send(out);
        } catch (e) {
        }
      }
    } else {
      const host = this.state.getWebSockets("host")[0];
      if (host) {
        try {
          host.send(JSON.stringify({ f: me.id, d: m.d }));
        } catch (e) {
        }
      }
      if (m.b) {
        const out = JSON.stringify({ ...m.d, _from: me.id });
        for (const s of this.state.getWebSockets("client"))
          if (s !== ws) {
            try {
              s.send(out);
            } catch (e) {
            }
          }
      }
    }
  }
  webSocketClose(ws) {
    this.left(ws);
  }
  webSocketError(ws) {
    this.left(ws);
  }
  left(ws) {
    const me = ws.deserializeAttachment() || {};
    if (me.role === "host") {
      for (const s of this.state.getWebSockets("client")) {
        try {
          s.send(JSON.stringify({ type: "__hostleft" }));
          s.close(4001, "host left");
        } catch (e) {
        }
      }
    } else {
      const host = this.state.getWebSockets("host")[0];
      if (host) {
        try {
          host.send(JSON.stringify({ f: me.id, d: { type: "__bye" } }));
        } catch (e) {
        }
      }
    }
  }
};
__name(Room, "Room");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4,8})$/);
    if (m)
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("Pastry Paladins relay is running", { headers: { "Access-Control-Allow-Origin": "*" } });
    }
    return new Response("Not found", { status: 404 });
  }
};

// ../../../../tmp/claude-0/-home-user-game/b82d5d95-d4d7-5169-ad3b-b1bebfbc1c71/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../tmp/claude-0/-home-user-game/b82d5d95-d4d7-5169-ad3b-b1bebfbc1c71/scratchpad/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-J2g8qF/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../tmp/claude-0/-home-user-game/b82d5d95-d4d7-5169-ad3b-b1bebfbc1c71/scratchpad/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-J2g8qF/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
