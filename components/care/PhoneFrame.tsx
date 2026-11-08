"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";

/** The caregiver phone, running live beside the ward. It is the real /phone page in a frame, same browser, same local link. */
export function PhoneFrame({ onReady }: { onReady?: () => void }) {
  const r = useRef<HTMLDivElement>(null), seen = useInView(r, { once: true, margin: "200px" }), [ok, setOk] = useState(false);
  useEffect(() => { if (seen) setOk(true); }, [seen]);
  return (
    <div ref={r} className="phone-frame relative mx-auto h-[640px] w-[318px] border-[10px] border-[#1c2a27] bg-[#050909] shadow-[0_0_0_1px_#26352f]">
      <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 bg-[#1c2a27] phone-notch" />
      <div className="phone-screen relative h-full w-full overflow-hidden">
        {ok && <iframe title="Caregiver phone" src="/phone" onLoad={onReady} className="absolute left-0 top-0 h-[844px] w-[390px] origin-top-left border-0" style={{ transform: "scale(0.7538)" }} />}
      </div>
    </div>
  );
}
