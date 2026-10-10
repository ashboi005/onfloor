"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

type BlurState = { filter: string; opacity: number; y: number };

type BlurTextProps = {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  stepDuration?: number;
  onAnimationComplete?: () => void;
};

export default function BlurText({
  text = "",
  delay = 200,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  stepDuration = 0.35,
  onAnimationComplete,
}: BlurTextProps) {
  const elements = useMemo(() => animateBy === "words" ? text.split(" ") : text.split(""), [animateBy, text]);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(element);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  const from = useMemo<BlurState>(() => ({
    filter: "blur(10px)",
    opacity: 0,
    y: direction === "top" ? -50 : 50,
  }), [direction]);
  const to = useMemo<BlurState[]>(() => [
    { filter: "blur(5px)", opacity: 0.5, y: direction === "top" ? 5 : -5 },
    { filter: "blur(0px)", opacity: 1, y: 0 },
  ], [direction]);
  const keyframes = useMemo(() => ({
    filter: [from.filter, ...to.map((step) => step.filter)],
    opacity: [from.opacity, ...to.map((step) => step.opacity)],
    y: [from.y, ...to.map((step) => step.y)],
  }), [from, to]);
  const finalState = to[to.length - 1];
  const totalDuration = stepDuration * to.length;
  const times = Array.from({ length: to.length + 1 }, (_, index) => index / to.length);

  return (
    <div ref={ref} className={`flex flex-wrap ${className}`}>
      {elements.map((segment, index) => (
        <motion.span
          className="inline-block will-change-[transform,filter,opacity]"
          key={`${segment}-${index}`}
          initial={reduceMotion ? finalState : from}
          animate={reduceMotion ? finalState : inView ? keyframes : from}
          transition={{
            duration: reduceMotion ? 0 : totalDuration,
            times,
            delay: reduceMotion ? 0 : (index * delay) / 1000,
            ease: "easeOut",
          }}
          onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
        >
          {segment === " " ? "\u00A0" : segment}
          {animateBy === "words" && index < elements.length - 1 ? "\u00A0" : null}
        </motion.span>
      ))}
    </div>
  );
}
