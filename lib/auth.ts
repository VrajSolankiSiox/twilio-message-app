import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { findUserById, User, UserRole, verifyUserPassword } from "@/lib/db/users";
import { requestContext } from "@/lib/request-context";

const SESSION_COOKIE = "session";
const SESSION_DURATION = "7d";

export interface SessionUser {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
}

function getSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not defined. Add it to .env.local or Vercel environment variables."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<User | null> {
  return verifyUserPassword(email.trim(), password);
}

export async function createSessionToken(user: User): Promise<string> {
  return new SignJWT({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.fullName !== "string"
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role as UserRole,
      fullName: payload.fullName,
    };
  } catch {
    return null;
  }
}

export function tokenFromHeaders(
  authorization: string | null,
  cookieHeader: string | null
): string | null {
  if (authorization?.startsWith("Bearer ")) {
    const bearer = authorization.slice("Bearer ".length).trim();
    if (bearer) return bearer;
  }
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const session = parts.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!session) return null;
  const value = session.slice(SESSION_COOKIE.length + 1);
  return value ? decodeURIComponent(value) : null;
}

export async function getSession(): Promise<SessionUser | null> {
  const scoped = requestContext.getStore();
  if (scoped) {
    return scoped.token ? verifySessionToken(scoped.token) : null;
  }

  const headerStore = await headers();
  const token = tokenFromHeaders(
    headerStore.get("authorization"),
    headerStore.get("cookie")
  );
  if (token) return verifySessionToken(token);

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookieToken) return null;
  return verifySessionToken(cookieToken);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireSession();
  if (session.role !== "admin") throw new Error("Forbidden");
  return session;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  return findUserById(session.userId);
}

export { SESSION_COOKIE };
