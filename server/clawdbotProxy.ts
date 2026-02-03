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
    // We mount at /clawdbot and the gateway UI is also served under /clawdbot
    // (gateway.controlUi.basePath). So no rewrite needed.
    on: {
      error(err, req, res) {
        // If the proxy fails, DO NOT fall through to the SPA fallback (which
        // looks like a "404 Not Found" in the iframe). Return a clear 502.
        console.error("[clawdbot-proxy] error", {
          message: (err as any)?.message,
          code: (err as any)?.code,
          target,
          url: (req as any)?.url,
        });
        const r = res as any;
        if (!r.headersSent) {
          r.statusCode = 502;
          r.setHeader("content-type", "text/plain; charset=utf-8");
        }
        r.end("Clawdbot proxy error (502). Is the gateway running on " + target + " ?\n");
      },
      proxyReq(proxyReq, req) {
        // Helpful when debugging what URL is actually being proxied.
        console.log("[clawdbot-proxy]", req.method, (req as any).originalUrl || req.url);
      },
    },
  });

  app.use("/clawdbot", proxy);

  // WebSocket upgrade support for the Gateway WS (required for the Control UI).
  httpServer.on("upgrade", proxy.upgrade);
}
