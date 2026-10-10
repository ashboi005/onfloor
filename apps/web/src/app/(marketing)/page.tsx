/**
 * Landing page. OWNER: Mansukh. Spec: docs/specs/05-mansukh-design.md §3.
 * Placeholder. Replace entirely.
 */
import Link from "next/link";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">OnFloor</p>
      <h1 className="text-5xl font-semibold leading-tight">The flight simulator for the call floor.</h1>
      <p className="text-lg text-muted-foreground">
        Practice against adversarial AI customers, get coached live on real calls, and get every call scored the moment
        it ends.
      </p>
      <div className="flex gap-3">
        <Link href="/simulator" className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Try the simulator
        </Link>
        <Link href="/live" className="rounded-md border px-4 py-2">
          Open the live HUD
        </Link>
      </div>
    </main>
  );
}
