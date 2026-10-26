import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createInvoice, listInvoices } from "@/lib/db/invoices";

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "Forbidden";
  return NextResponse.json(
    { error: message },
    { status: message === "Unauthorized" ? 401 : 403 }
  );
}

export async function GET() {
  let session;
  try {
    session = await requireAdmin();
  } catch (error) {
    return authError(error);
  }

  try {
    return NextResponse.json({ invoices: await listInvoices() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load invoices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireAdmin();
  } catch (error) {
    return authError(error);
  }

  try {
    const body = await request.json();
    const invoice = await createInvoice(session.userId, body?.name, body?.data);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save invoice";
    const status = /must|invalid|required|between/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
