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
    <main className="brand-mosaic flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="pixel-accent w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl shadow-primary/5 sm:p-9">
        <div className="mb-5 flex justify-center">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-info">
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
