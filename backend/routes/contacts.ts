import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { upsertContactNames } from "@/lib/db/conversations";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    const status = message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const { contacts } = await request.json();

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: "At least one contact is required" },
        { status: 400 }
      );
    }

    const parsed = contacts
      .map((contact: { phone?: unknown; name?: unknown }) => ({
        phone: typeof contact.phone === "string" ? contact.phone.trim() : "",
        name: typeof contact.name === "string" ? contact.name.trim() : "",
      }))
      .filter((contact: { phone: string; name: string }) => contact.phone && contact.name);

    await upsertContactNames(parsed);

    return NextResponse.json({ saved: parsed.length });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
