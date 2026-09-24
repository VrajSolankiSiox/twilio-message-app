import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSessionToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email?.trim() || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await authenticateUser(email.trim(), password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = await createSessionToken(user);

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    const message =
      error instanceof Error ? error.message : "Login failed";

    const isDev = process.env.NODE_ENV === "development";

    return NextResponse.json(
      {
        error: isDev
          ? message
          : "Login failed. Check server logs or database configuration.",
      },
      { status: 500 }
    );
  }
}
