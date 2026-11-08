import "./globals.css";
import localFont from "next/font/local";

// Fraunces: warm, soft-serif display (variable: weight, optical size, SOFT, WONK). Plex Sans: neutral, highly legible body.
// Plex Mono: every number on the ward screen, with tabular figures so live values never jitter.
const display = localFont({ src: [{ path: "./fonts/Fraunces-Normal.woff2", style: "normal" }, { path: "./fonts/Fraunces-Italic.woff2", style: "italic" }], variable: "--f-display", display: "swap" });
const body = localFont({ src: "./fonts/PlexSans.woff2", variable: "--f-body", display: "swap", weight: "100 700" });
const mono = localFont({ src: [{ path: "./fonts/PlexMono-400.woff2", weight: "400" }, { path: "./fonts/PlexMono-500.woff2", weight: "500" }], variable: "--f-mono", display: "swap" });

export const metadata = {
  title: "Ward Zero | A hospital ward inside a bedroom",
  description: "A hospital ward inside a bedroom: home vitals scored, explained and forecast, with a caregiver alerted and answering.",
};
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
