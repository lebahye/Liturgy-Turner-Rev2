import type { Express } from "express";
import type { Server as HttpServer } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

/**
 * Reverse-proxy the Clawdbot Control UI + WebSocket through the main app server.
 *
 * This makes the bot UI available at:
 *   http://localhost:<APP_PORT>/clawdbot/...
 *
 * …so it can be embedded as a single-origin app.
 */
export function attachClawdbotProxy(app: Express, httpServer: HttpServer) {
  const target = process.env.CLAWDBOT_GATEWAY_URL || "http://127.0.0.1:29789";

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    // We mount the gateway at /clawdbot in the main app, but the gateway itself
    // serves its UI at / (default). Rewrite /clawdbot/* -> /* on the target.
    pathRewrite: { "^/clawdbot": "" },
    on: {
      error(err, req, res) {
        // If the proxy fails, DO NOT fall through to the SPA fallback (which
        // looks like a "404 Not Found" in the iframe).
        //
        // Note: For WS upgrades, `res` can be a net.Socket (no setHeader/end).
        console.error("[clawdbot-proxy] error", {
          message: (err as any)?.message,
          code: (err as any)?.code,
          target,
          url: (req as any)?.url,
        });

        const r: any = res as any;

        // If this is a websocket/upgrade error, just destroy the socket.
        if (typeof r?.writeHead !== "function" && typeof r?.setHeader !== "function") {
          try {
            r?.destroy?.();
          } catch {}
          return;
        }

        if (!r.headersSent) {
          r.statusCode = 502;
          if (typeof r.setHeader === "function") {
            r.setHeader("content-type", "text/plain; charset=utf-8");
          }
        }

        if (typeof r.end === "function") {
          r.end("Clawdbot proxy error (502). Is the gateway running on " + target + " ?\n");
        }
      },
      proxyReq(proxyReq, req) {
        // Helpful when debugging what URL is actually being proxied.
        console.log("[clawdbot-proxy]", req.method, (req as any).originalUrl || req.url);
      },
    },
  });

  app.use("/clawdbot", proxy);

  // WebSocket upgrade support for the Gateway WS (required for the Control UI).
  // Important: only handle upgrades for our mounted path, otherwise we can
  // interfere with Vite HMR and other dev-time upgrades.
  httpServer.on("upgrade", (req, socket, head) => {
    const url = req.url || "";
    if (!url.startsWith("/clawdbot")) return;
    // @ts-expect-error - http-proxy-middleware provides upgrade()
    proxy.upgrade(req, socket, head);
  });
}
