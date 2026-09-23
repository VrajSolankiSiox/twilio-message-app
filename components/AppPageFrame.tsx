import type { ReactNode } from "react";
import { APP_PAGE_INNER, APP_PAGE_STACK } from "@/lib/app-layout";

type AppPageFrameProps = {
  children: ReactNode;
  /** Use for full-height layouts (e.g. calls). */
  fillHeight?: boolean;
  className?: string;
};

export default function AppPageFrame({
  children,
  fillHeight = false,
  className = "",
}: AppPageFrameProps) {
  const inner = fillHeight
    ? `${APP_PAGE_INNER} flex h-full min-h-0 flex-col`
    : `${APP_PAGE_INNER} ${APP_PAGE_STACK} pb-8`;

  return (
    <div
      className={`h-full min-h-0 overflow-x-hidden overflow-y-auto ${className}`}
    >
      <div className={inner}>{children}</div>
    </div>
  );
}
