import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteInvoice, updateInvoice } from "@/lib/db/invoices";

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "Forbidden";
  return NextResponse.json(
    { error: message },
    { status: message === "Unauthorized" ? 401 : 403 }
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireAdmin();
  } catch (error) {
    return authError(error);
  }

  try {
    const [{ id }, body] = await Promise.all([params, request.json()]);
    const input = body as { name?: unknown; data?: unknown } | null;
    const invoice = await updateInvoice(
      id,
      session.userId,
      input?.name,
      input?.data
    );
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update invoice";
    const status = /must|invalid|required|between/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireAdmin();
  } catch (error) {
    return authError(error);
  }

  try {
    const { id } = await params;
    const deleted = await deleteInvoice(id, session.userId);
    if (!deleted) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
