const TOKEN_KEY = "revenelx-token";

function jwtExpirationMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json) as { exp?: unknown };
    return typeof data.exp === "number" ? data.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const expMs = jwtExpirationMs(token);
  return expMs !== null && expMs <= Date.now();
}

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

function readStoredToken(): string | null {
  const fromLocal = localStorage.getItem(TOKEN_KEY);
  if (fromLocal) return fromLocal;
  const fromSession = sessionStorage.getItem(TOKEN_KEY);
  if (!fromSession) return null;
  sessionStorage.removeItem(TOKEN_KEY);
  if (isTokenExpired(fromSession)) return null;
  localStorage.setItem(TOKEN_KEY, fromSession);
  return fromSession;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = readStoredToken();
  if (!token) return null;
  if (isTokenExpired(token)) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    if (isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
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
