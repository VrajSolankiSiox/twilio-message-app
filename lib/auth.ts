import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import {
  ORGANIZATION_GREEN_ID,
  getOrganizationById,
} from "@/lib/db/organizations";
import { getDb } from "@/lib/mongodb";
import {
  findUserById,
  User,
  UserRole,
  verifyUserPasswordForLogin,
} from "@/lib/db/users";
import { requestContext } from "@/lib/request-context";

const SESSION_COOKIE = "session";
/** JWT and session cookie lifetime for logged-in users. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_DURATION = `${SESSION_MAX_AGE_SECONDS}s`;

export interface SessionUser {
  userId: string;
  email: string;
  role: UserRole;
  fullName: string;
  organizationId: string;
  organizationName: string;
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
  return verifyUserPasswordForLogin(email.trim(), password);
}

async function organizationNameForUser(user: User): Promise<string> {
  const orgId = user.organizationId ?? ORGANIZATION_GREEN_ID;
  const db = await getDb();
  const org = await db
    .collection<{ _id: string; name?: string }>("organizations")
    .findOne({ _id: orgId }, { projection: { name: 1 } });
  return org?.name ?? "Organization";
}

export async function createSessionToken(user: User): Promise<string> {
  const organizationName = await organizationNameForUser(user);
  return new SignJWT({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    organizationId: user.organizationId ?? ORGANIZATION_GREEN_ID,
    organizationName,
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

    let organizationId =
      typeof payload.organizationId === "string" ? payload.organizationId : "";
    let organizationName =
      typeof payload.organizationName === "string"
        ? payload.organizationName
        : "";

    if (!organizationId) {
      const user = await findUserById(payload.userId);
      if (!user) return null;
      organizationId = user.organizationId ?? ORGANIZATION_GREEN_ID;
      organizationName = await organizationNameForUser(user);
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role as UserRole,
      fullName: payload.fullName,
      organizationId,
      organizationName,
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
