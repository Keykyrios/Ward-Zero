module.exports = {
  content: ["./app/**/*.tsx", "./components/**/*.tsx"],
  theme: { extend: {
    colors: {
      ink: "#0a1110", surface: "#0f1816", panel: "#0f1816", raise: "#16221f", overlay: "#1c2a27", ember: "#e98a3d", line: "rgba(232,238,232,.14)",
      bone: "#e8eee8", mute: "#9fb0a8",
      vital: "#6adcd1", warn: "#e7b923", crit: "#eb605c",
      care: { bg: "#0a1110", band: "#0f1816", tint: "#16221f", text: "#e8eee8", soft: "#9fb0a8", line: "#26352f", brand: "#6adcd1", brandHover: "#8fe6dd", onBrand: "#0a1110", ok: "#6adcd1", warn: "#e7b923", warnBg: "#2b2510", hot: "#e98a3d", hotBg: "#2d1d10", crit: "#eb605c", critBg: "#2e1514" },
    },
    fontFamily: { display: ["var(--f-display)", "Georgia", "serif"], body: ["var(--f-body)", "system-ui", "sans-serif"], mono: ["var(--f-mono)", "ui-monospace", "monospace"] },
  } },
  plugins: [],
};
