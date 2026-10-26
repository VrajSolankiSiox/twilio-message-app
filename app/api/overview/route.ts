import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOverviewMetrics } from "@/lib/db/overview";
import { runWithOrganizationId } from "@/lib/org-context";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const metrics = await runWithOrganizationId(session.organizationId, () =>
      getOverviewMetrics()
    );
    return NextResponse.json({
      ...metrics,
      organizationName: session.organizationName,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load overview" },
      { status: 500 }
    );
  }
}
