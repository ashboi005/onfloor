import type { ReactNode } from "react";

import BlurText from "@/components/blur-text";

type AuthCardProps = {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
};

export default function AuthCard({ title, eyebrow, description, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-xl shadow-black/[0.04] sm:p-9 dark:shadow-black/20">
        <div className="mb-5 flex justify-center">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
            {eyebrow}
          </span>
        </div>

        <h1 className="mb-3 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          <BlurText
            text={title}
            delay={110}
            animateBy="words"
            direction="top"
            stepDuration={0.25}
            className="justify-center text-center"
          />
        </h1>
        <p className="mb-8 text-center text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        {children}
      </section>
    </main>
  );
}
