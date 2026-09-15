import Dashboard from "@/components/Dashboard";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();

  const initialUser = session
    ? {
        id: session.userId,
        fullName: session.fullName,
        email: session.email,
        role: session.role,
      }
    : null;

  return <Dashboard initialUser={initialUser} />;
}
