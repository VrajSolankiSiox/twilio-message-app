import { APP_PAGE_INNER, APP_PAGE_STACK } from "@/lib/app-layout";

/** Shown instantly while a tab’s data components mount/fetch (not Messages). */
export default function PageLoadingSkeleton() {
  return (
    <div className={`${APP_PAGE_INNER} ${APP_PAGE_STACK} pb-8`}>
      <div className="h-10 w-48 animate-pulse rounded-lg bg-brand-muted/30" />
      <div className="h-36 animate-pulse rounded-2xl border border-border bg-surface" />
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />
    </div>
  );
}
