import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShellGate email={user.email}>{children}</AppShellGate>;
}

import { AppShell } from "@/components/AppShell";

function AppShellGate({ email, children }: { email: string; children: React.ReactNode }) {
  return <AppShell email={email}>{children}</AppShell>;
}
