import type { Config } from "tailwindcss";

/**
 * Design language (ARCHITECTURE.md §5.2): calm, dense, analytical instrument.
 * Neutral surfaces, single restrained accent, monospaced numerics.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        panel2: "var(--panel-2)",
        line: "var(--line)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        ok: "var(--ok)",
        warn: "var(--warn)",
        bad: "var(--bad)",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        num: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};
export default config;
