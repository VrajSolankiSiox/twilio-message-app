import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    redirect("/messages");
  }

  return null;
}
