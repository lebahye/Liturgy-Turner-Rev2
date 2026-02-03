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
  });

  app.use("/clawdbot", proxy);

  // WebSocket upgrade support for the Gateway WS (required for the Control UI).
  httpServer.on("upgrade", proxy.upgrade);
}
