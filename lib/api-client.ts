const TOKEN_KEY = "revenelx-token";

export function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:4000";
  return "";
}

export function apiUrl(path: string): string {
  const base = apiBase();
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

export function wsBase(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const api = apiBase();
  if (!api) return "";
  if (api.startsWith("https://")) return `wss://${api.slice("https://".length)}`;
  if (api.startsWith("http://")) return `ws://${api.slice("http://".length)}`;
  return api;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (stored) return stored;
  const match = document.cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    document.cookie = `session=${token}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${
      window.location.protocol === "https:" ? "; Secure" : ""
    }`;
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    document.cookie = "session=; Path=/; Max-Age=0; SameSite=Lax";
  }
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });
}
