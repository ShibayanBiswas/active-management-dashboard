import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--ar-bg)",
        surface: "var(--ar-surface)",
        panel: "var(--ar-panel)",
        ink: "var(--ar-ink)",
        muted: "var(--ar-muted)",
        gold: { DEFAULT: "#d4b24c", light: "#e5cf94", dark: "#b8860b" },
        maroon: { DEFAULT: "#7a1e2c", dark: "#5c1520" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Times New Roman", "Times", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
