import { isCampaignAppPath, normalizeAppPathname } from "@/lib/navigation";

export const CAMPAIGN_ROUTES = {
  list: "/campaign",
  new: "/campaign/new",
  detail: (id: string) => `/campaign/${id}`,
} as const;

export type CampaignView = "list" | "create" | "detail";

export function isCampaignPath(pathname: string): boolean {
  return isCampaignAppPath(pathname);
}

function normalizeCampaignPath(pathname: string): string {
  return normalizeAppPathname(pathname);
}

export function campaignViewFromPath(pathname: string): CampaignView {
  const path = normalizeCampaignPath(pathname);
  if (path === CAMPAIGN_ROUTES.new) return "create";
  if (path.startsWith("/campaign/")) return "detail";
  return "list";
}

export function campaignDetailIdFromPath(pathname: string): string | null {
  const path = normalizeCampaignPath(pathname);
  if (!path.startsWith("/campaign/") || path === CAMPAIGN_ROUTES.new) {
    return null;
  }
  const id = path.slice("/campaign/".length).split("/")[0]?.trim();
  return id || null;
}
