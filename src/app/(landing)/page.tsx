import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <span className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
        ZGate
      </span>
      <h1 className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
        Universal AI gateway and router.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Bring your own provider keys, connect once, and call every model through a single
        endpoint with seamless combo fallback, token-saving RTK, and cross-session memory.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-[var(--radius-base)] bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Open dashboard
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </main>
  );
}
