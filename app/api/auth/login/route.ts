import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";
import { ensureOrganizations } from "@/lib/db/organizations";

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
    void ensureOrganizations().catch((err) => {
      console.error("Post-login org sync failed:", err);
    });

    const response = NextResponse.json({
      success: true,
      token,
      expiresIn: SESSION_MAX_AGE_SECONDS,
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
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
