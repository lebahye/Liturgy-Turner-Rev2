import { useEffect, useMemo, useState } from "react";

export default function Bot() {
  // This route is served by the main app (port 5000) and reverse-proxies the
  // Clawdbot Control UI (port 29789) under /clawdbot.
  //
  // IMPORTANT: Force the Control UI to use the *proxied* WebSocket URL AND
  // pre-inject the gateway token.
  //
  // Without this, the UI often connects but fails to authenticate (token is
  // stored per-origin), causing gateway handshake timeouts and UI "1006".
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/clawdbot/token");
        const data = await res.json();
        if (!cancelled && data?.ok && typeof data.token === "string") {
          setToken(data.token);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const url = useMemo(() => {
    // Reliability > purity: connect the embedded Control UI directly to the
    // gateway UI origin. This avoids proxy WebSocket edge-cases that can cause
    // 1006 handshake timeouts.
    const base = `http://127.0.0.1:29789/chat?session=agent%3Aliturgy%3Amain&gatewayUrl=${encodeURIComponent("ws://127.0.0.1:29789")}`;
    return token ? `${base}&token=${encodeURIComponent(token)}` : base;
  }, [token]);

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
