"use client";
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from "motion/react";
import { useRef } from "react";

const wrap = (min: number, max: number, v: number) => { const r = max - min; return ((((v - min) % r) + r) % r) + min; };

/** Drifts on its own and speeds up (and flips direction) with scroll velocity. Pattern from the Motion docs. */
export default function VelocityMarquee({ text, base = -1.1 }: { text: string; base?: number }) {
  const still = useReducedMotion(), x = useMotionValue(0), { scrollY } = useScroll();
  const smooth = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const boost = useTransform(smooth, [0, 1000], [0, 5], { clamp: false });
  const dir = useRef(1);
  useAnimationFrame((_, delta) => {
    if (still) return;
    if (boost.get() < 0) dir.current = -1; else if (boost.get() > 0) dir.current = 1;
    let move = dir.current * base * (delta / 1000);
    move += dir.current * move * boost.get();
    x.set(x.get() + move);
  });
  const xp = useTransform(x, (v) => `${wrap(-25, -50, v)}%`);
  return (
    <div className="overflow-hidden whitespace-nowrap py-5 font-display text-4xl italic text-mute" aria-hidden>
      <motion.div style={{ x: xp }} className="i flex w-max gap-16">{[0, 1, 2, 3].map((i) => <span key={i} className="font-display">{text}</span>)}</motion.div>
    </div>
  );
}
