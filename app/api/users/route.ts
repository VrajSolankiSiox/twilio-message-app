import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/auth";
import { createUser, listUsers } from "@/lib/db/users";

export async function GET() {
  try {
    await requireSession();
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    const status = message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const { fullName, email, password } = await request.json();

    if (!fullName?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { error: "Full name, email, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const user = await createUser(fullName.trim(), email.trim(), password);

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "Unauthorized") {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      if (err.message === "Forbidden") {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      if (err.message.includes("already exists")) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
