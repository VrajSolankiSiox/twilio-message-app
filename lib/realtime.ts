export interface RealtimeEvent {
  type: "message";
  phone: string;
  direction: "inbound" | "outbound";
}

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishRealtime(event: RealtimeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // One slow client must not block the others.
    }
  }
}
