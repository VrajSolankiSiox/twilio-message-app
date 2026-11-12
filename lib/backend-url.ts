/** Standalone API used by the browser and by Vercel when proxying old webhook URLs. */
export const LOCAL_BACKEND_ORIGIN = "http://localhost:4000";
export const PRODUCTION_BACKEND_ORIGIN = "https://revenelx.duckdns.org";

export function backendOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return LOCAL_BACKEND_ORIGIN;
  }
  if (process.env.NODE_ENV !== "production") return LOCAL_BACKEND_ORIGIN;
  return PRODUCTION_BACKEND_ORIGIN;
}
