import { AsyncLocalStorage } from "node:async_hooks";

const organizationStorage = new AsyncLocalStorage<string>();

export function runWithOrganizationId<T>(
  organizationId: string,
  fn: () => T
): T {
  return organizationStorage.run(organizationId, fn);
}

export function getOrganizationId(): string | null {
  return organizationStorage.getStore() ?? null;
}

export function requireOrganizationId(): string {
  const id = getOrganizationId();
  if (!id) {
    throw new Error("Organization context is required");
  }
  return id;
}

export function organizationQuery(): { organizationId: string } {
  return { organizationId: requireOrganizationId() };
}
