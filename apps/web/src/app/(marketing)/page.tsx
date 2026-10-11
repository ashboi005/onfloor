import Link from "next/link";
import { ArrowRight, Bot, Zap, Activity, Globe, Server, AudioLines, Send } from "lucide-react";
import { CrowdCanvas } from "@/components/crowd-canvas";
import TechText from "@/components/tech-text";
import { ModeToggle } from "@/components/mode-toggle";
import { HudDemo } from "@/components/landing/hud-demo";
import { ReplayLoop } from "@/components/landing/replay-loop";

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="fixed bottom-5 left-5 z-50 rounded-lg bg-card p-1 shadow-lg backdrop-blur-md" aria-label="Appearance">
        <ModeToggle />
      </div>
      {/* 1. Hero Section */}
      <section className="brand-hero brand-mosaic relative mx-auto flex w-full flex-col items-center overflow-hidden border-b px-6 py-10 text-center md:py-12">
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center">
          <div className="brand-hero-intro">
            <div className="brand-wordmark relative h-[140px] w-full md:h-[180px]">
              <TechText
                text="OnFloor"
                fontWeight={800}
                fontSize={110}
                reveal="letter"
                dashLength={4}
                dashGap={2}
                specks={15}
                fontFamily=""
                color="#193bf2"
                accentColor="#193bf2"
                letterSpacing={-0.05}
                reach={200}
                softness={0.7}
                strokeWidth={1.5}
                speed={1}
                lineStyle="dashed"
                selection
                labels
                draggable
                sweep
              />
            </div>
            <div className="crowd-backdrop" aria-hidden="true">
              <CrowdCanvas src="https://cdn.21st.dev/assets/localized/abdb8990a7bef8c2f5af3e45f0a3c969c4b0603fba8be92e81347de4ea4e1ed7.png" rows={15} cols={7} />
            </div>
            <h2 className="brand-hero-heading text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Risk-free training. <span className="text-info">Win the call.</span>
            </h2>
            <p className="brand-hero-description mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Train agents against adversarial AI customers, coach them live during real calls, and get an instant QA score the moment they hang up.
            </p>
            <div className="brand-hero-action flex justify-center">
              <Link href="/simulator" className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition-colors hover:bg-card">
                Try simulation <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
          {/* Product visual: the live copilot HUD, self-playing */}
          <HudDemo />
        </div>
      </section>

      {/* 2. The Problem Section */}
      <section className="bg-card py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">The old way is broken</h2>
            <p className="mt-4 text-lg text-muted-foreground">Call centers struggle to balance live support and agent training.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "The Multitasking Dilemma", desc: "Agents juggle 4 screens while trying to sound empathetic.", stat: "40% cognitive overload" },
              { title: "The Live-Floor Freeze", desc: "When a rare objection hits, agents freeze. Supervisors can't whisper to everyone.", stat: "30s avg. delay" },
              { title: "QA Latency", desc: "Calls are scored days later. Feedback arrives too late to change behavior.", stat: "<2% calls reviewed" }
            ].map((item, i) => (
              <div key={i} className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="text-4xl font-bold text-info mb-4">{item.stat}</div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Three Pillars Section */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to level up</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center p-6">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary bg-card text-info">
                <Bot className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Simulator</h3>
              <p className="text-muted-foreground">Practice tough scenarios with AI personas that bite back. Integrated with a mock CRM.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary bg-card text-info">
                <Activity className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Shadow AI Copilot</h3>
              <p className="text-muted-foreground">Live hints, sentiment analysis, and guardrails right on the agent's screen during real calls.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary bg-card text-info">
                <Zap className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Instant QA</h3>
              <p className="text-muted-foreground">100% of calls scored automatically the moment they end. Compliance, soft skills, and CRM accuracy.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. The Replay Loop */}
      <section className="bg-card py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">From a real call to a practice rep.</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Stop guessing what customers will say. OnFloor extracts personas directly from your live calls, letting agents replay and practice the exact same scenario until they master it.
              </p>
              <ul className="space-y-4">
                {[
                  "Live customer calls in",
                  "AI extracts traits & objections into a Persona",
                  "Agent replays the exact scenario in the Simulator"
                ].map((text, i) => (
                  <li key={i} className="flex items-center">
                    <div className="mr-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                      {i + 1}
                    </div>
                    <span className="text-lg font-medium">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-10">
              <ReplayLoop />
            </div>
          </div>
        </div>
      </section>

      {/* 5 & 6. Multilingual & Tech Stack */}
      <section className="py-24 border-b">
        <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-16">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Globe className="h-6 w-6 text-info" />
              <h3 className="text-2xl font-bold">Speaks your language</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Natively voiced in English, Hindi, and Hinglish. Capable of understanding code-switching naturally, just like a real customer.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium">English</span>
              <span className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium">Hindi (हिंदी)</span>
              <span className="px-3 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium">Hinglish</span>
            </div>
          </div>
          <div>
             <div className="flex items-center gap-3 mb-4">
              <Server className="h-6 w-6 text-info" />
              <h3 className="text-2xl font-bold">Powered by the best</h3>
            </div>
            <p className="text-muted-foreground mb-8">
              Built on cutting-edge AI infrastructure to ensure near-zero latency and high fidelity interactions.
            </p>
            
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
              {[
                { name: "Gemini", Icon: GoogleMark },
                { name: "ElevenLabs", Icon: AudioLines },
                { name: "sarvam", Icon: null, customClass: "text-xl font-bold tracking-tighter lowercase" },
                { name: "Telegram", Icon: Send },
              ].map(({ name, Icon, customClass }) => (
                <div
                  key={name}
                  className="flex items-center justify-center gap-2.5 bg-background px-4 py-6 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  <span className={customClass || "font-semibold tracking-tight text-sm"}>
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="bg-background py-12 text-center text-muted-foreground">
        <div className="mx-auto max-w-6xl px-6">
           <p className="mb-4">Built with ❤️ in 24 hours at InnoHacks.</p>
           <p className="text-sm">Team: Ashwath, Tushar, Harnoor, Mansukh</p>
        </div>
      </footer>
    </div>
  );
}

function GoogleMark({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M3.06364 7.50914C4.70909 4.24092 8.09084 2 12 2C14.6954 2 16.959 2.99095 18.6909 4.60455L15.8227 7.47274C14.7864 6.48185 13.4681 5.97727 12 5.97727C9.39542 5.97727 7.19084 7.73637 6.40455 10.1C6.2045 10.7 6.09086 11.3409 6.09086 12C6.09086 12.6591 6.2045 13.3 6.40455 13.9C7.19084 16.2636 9.39542 18.0227 12 18.0227C13.3454 18.0227 14.4909 17.6682 15.3864 17.0682C16.4454 16.3591 17.15 15.3 17.3818 14.05H12V10.1818H21.4181C21.5364 10.8363 21.6 11.5182 21.6 12.2273C21.6 15.2727 20.5091 17.8363 18.6181 19.5773C16.9636 21.1046 14.7 22 12 22C8.09084 22 4.70909 19.7591 3.06364 16.4909C2.38638 15.1409 2 13.6136 2 12C2 10.3864 2.38638 8.85911 3.06364 7.50914Z" />
    </svg>
  );
}


