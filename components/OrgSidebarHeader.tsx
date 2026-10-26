"use client";

import Logo from "@/components/Logo";
import { orgSidebarTheme, orgSidebarVariant } from "@/lib/org-sidebar";
import "./OrgSidebarHeader.css";

interface OrgSidebarHeaderProps {
  organizationId?: string;
  organizationName?: string;
}

export default function OrgSidebarHeader({
  organizationId,
  organizationName,
}: OrgSidebarHeaderProps) {
  const variant = orgSidebarVariant(organizationId);
  const theme = orgSidebarTheme(organizationId);
  const label = organizationName?.trim() || "Revenelx";

  return (
    <div className={`org-sidebar-header org-sidebar-header--${variant} px-5 py-5`}>
      <div className="org-sidebar-header__aura" aria-hidden />
      <div className="org-sidebar-header__sheen" aria-hidden />
      <div className="org-sidebar-header__spark" aria-hidden />
      <div className="org-sidebar-header__content">
        <div className="flex min-w-0 flex-col gap-3">
          <Logo
            size="sm"
            tone={variant === "green" ? "green" : "default"}
          />
          <p
            className={`org-sidebar-header__org-name ${theme.subtitleClass}`}
          >
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
