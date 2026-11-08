"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import SplitText from "@/components/rb/SplitText";
import { Magnetic } from "@/components/mp/magnetic";

// WebGL shader background (ReactBits Threads). Loaded client-only; it honours prefers-reduced-motion itself.
const Threads = dynamic(() => import("@/components/rb/Threads"), { ssr: false });

export default function Hero() {
  return (
    <section className="relative isolate flex min-h-[100dvh] flex-col justify-between overflow-hidden px-6 py-8 md:px-14">
      <div className="absolute inset-0 -z-10 opacity-70" aria-hidden>
        <Threads color={[0.416, 0.863, 0.82]} amplitude={1.1} distance={0.3} enableMouseInteraction lineCount={60} brightness={1.1} fade={0.35} />
      </div>
      <div className="flex justify-between label"><span>Operation Ward Zero</span><span>Home care</span></div>
      <div className="pb-6">
        <h1 className="max-w-4xl font-display text-[clamp(3rem,8.6vw,8rem)] font-light">
          <SplitText text="A hospital ward, inside a bedroom." tag="span" splitType="words" delay={55} duration={0.9} ease="power3.out"
            from={{ opacity: 0, y: 40 }} to={{ opacity: 1, y: 0 }} textAlign="left" trigger="load" />
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-8 text-mute md:text-xl">Bedroom sensors become a plain-language risk score, a two day forecast, and an alert a caregiver can answer.</p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Magnetic><Link href="/ward" className="inline-block bg-vital px-7 py-4 font-medium text-ink">Open the ward</Link></Magnetic>
          <a href="#pipeline" className="border border-line px-7 py-4 hover:border-vital">See how it works</a>
        </div>
      </div>
    </section>
  );
}
