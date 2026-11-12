export interface RealtimeEvent {
  type: "message";
  organizationId?: string;
  phone: string;
  direction: "inbound" | "outbound";
  body?: string;
  at?: string;
}

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

declare global {
  // eslint-disable-next-line no-var
  var _realtimeHub: boolean | undefined;
}

/** The process that owns the WebSocket clients. It must not relay to itself. */
export function markRealtimeHub(): void {
  global._realtimeHub = true;
}

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function relayTarget(): string | null {
  if (global._realtimeHub) return null;
  const ws = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (!ws) return null;
  try {
    const url = new URL(ws);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/internal/realtime";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function relayRealtime(event: RealtimeEvent): void {
  const target = relayTarget();
  const secret = process.env.AUTH_SECRET?.trim();
  if (!target || !secret) return;
  void fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-realtime-secret": secret,
    },
    body: JSON.stringify(event),
  }).catch((error: unknown) => {
    console.warn(
      "Realtime relay failed:",
      error instanceof Error ? error.message : error
    );
  });
}

export function publishRealtime(event: RealtimeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // One slow client must not block the others.
    }
  }
  relayRealtime(event);
}
