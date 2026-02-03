export default function Bot() {
  // This route is served by the main app (port 5000) and reverse-proxies the
  // Clawdbot Control UI (port 29789) under /clawdbot.
  //
  // IMPORTANT: Force the Control UI to use the *proxied* WebSocket URL.
  // Otherwise it may try to connect directly to ws://127.0.0.1:29789 (cross-origin)
  // and get stuck in handshake timeouts / 1006 disconnects.
  const wsProto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const gatewayUrl = typeof window !== "undefined" ? `${wsProto}://${window.location.host}/clawdbot` : "";

  const url = `/clawdbot/chat?session=agent%3Aliturgy%3Amain&gatewayUrl=${encodeURIComponent(gatewayUrl)}`;

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <div className="mb-2">
        <h1 className="text-xl font-semibold">Liturgy Bot</h1>
        <p className="text-sm text-muted-foreground">
          Embedded control UI for the Liturgy Bot (page turns, state, and commands).
        </p>
      </div>

      <div className="relative h-[calc(100%-3rem)] w-full">
        {/*
          Hide the Control UI branding in the top-left corner.
          We can't reliably modify the Control UI's internal DOM, so we overlay.
        */}
        <div
          className="pointer-events-none absolute left-[10px] top-[10px] z-10 flex h-[44px] w-[340px] items-center gap-2 rounded-md bg-background px-3"
          aria-hidden="true"
        >
          <img src="/agent/assets/armenian-cross.svg" alt="" className="h-6 w-6" />
          <span className="text-sm font-semibold text-foreground">
            Liturgy Turner Bot Dashboard
          </span>
        </div>

        <iframe
          title="Liturgy Agent Control"
          src={url}
          className="h-full w-full rounded-md border"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
