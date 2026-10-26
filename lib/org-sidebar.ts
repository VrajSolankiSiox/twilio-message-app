import {
  ORGANIZATION_BLUE_ID,
  ORGANIZATION_GREEN_ID,
} from "@/lib/organization-ids";

export type OrgSidebarVariant = "green" | "blue" | "default";

export interface OrgSidebarTheme {
  subtitleClass: string;
}

export function orgSidebarVariant(
  organizationId: string | undefined
): OrgSidebarVariant {
  if (organizationId === ORGANIZATION_GREEN_ID) return "green";
  if (organizationId === ORGANIZATION_BLUE_ID) return "blue";
  return "default";
}

export function orgSidebarTheme(organizationId: string | undefined): OrgSidebarTheme {
  const variant = orgSidebarVariant(organizationId);
  if (variant === "green") {
    return { subtitleClass: "text-emerald-800/95" };
  }
  if (variant === "blue") {
    return { subtitleClass: "text-sky-900/95" };
  }
  return { subtitleClass: "text-zinc-600" };
}
