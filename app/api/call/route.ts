import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runWithOrganizationId } from "@/lib/org-context";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { getAllCalls } = await import("@/lib/db/calls");
    const calls = await runWithOrganizationId(session.organizationId, () =>
      getAllCalls()
    );
    return NextResponse.json({ calls });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch calls",
      },
      { status: 500 }
    );
  }
}
