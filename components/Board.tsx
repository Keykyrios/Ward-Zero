"use client";
import { SplitFlapDisplay } from "@/components/cy/split-flap-display";
import { AnnotatedText } from "@/components/cy/annotated-text";

export default function Board({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <section className="grid gap-12 border-t border-line px-6 py-28 md:grid-cols-[5fr_7fr] md:px-14">
      <div>
        <div className="label mb-4">Lead time</div>
        <h2 className="font-display text-5xl md:text-6xl">Hours of warning before the score <AnnotatedText variant="underline" color="text-warn">turns red</AnnotatedText>.</h2>
        <p className="mt-6 max-w-md leading-7 text-mute">Each row is measured on the three patients in this demo: the time between the first early signal and the first NEWS2 elevated band. The control patient is there to prove the system stays quiet when nothing is wrong.</p>
      </div>
      <div className="overflow-x-auto"><SplitFlapDisplay rows={rows} columns={26} size="sm" accentColor="#6adcd1" showIndicators /></div>
    </section>
  );
}
