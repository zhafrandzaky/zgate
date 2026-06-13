import { Construction } from "lucide-react";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-4 px-6">
      <Construction className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="max-w-xl text-muted-foreground">
        The dashboard is under construction. Provider connections, combos, API keys, usage,
        and settings arrive in TASK-012 onward.
      </p>
    </main>
  );
}
