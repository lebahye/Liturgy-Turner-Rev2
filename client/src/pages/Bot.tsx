export default function Bot() {
  // This route is served by the main app (port 5000) and reverse-proxies the
  // Clawdbot Control UI (port 29789) under /clawdbot.
  const url = "/clawdbot/chat?session=agent%3Aliturgy%3Amain";

  return (
    <div className="h-[calc(100vh-4rem)] w-full">
      <div className="mb-2">
        <h1 className="text-xl font-semibold">Bot Control</h1>
        <p className="text-sm text-muted-foreground">
          This is the embedded Clawdbot Control UI. Use it to control page turns during live audio.
        </p>
      </div>
      <iframe
        title="Liturgy Agent Control"
        src={url}
        className="h-[calc(100%-3rem)] w-full rounded-md border"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
