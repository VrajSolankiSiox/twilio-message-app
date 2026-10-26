import { getSession, type SessionUser } from "@/lib/auth";
import { runWithOrganizationId } from "@/lib/org-context";

export async function withSessionOrganization<T>(
  fn: (session: SessionUser) => Promise<T>
): Promise<T> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return runWithOrganizationId(session.organizationId, () => fn(session));
}
