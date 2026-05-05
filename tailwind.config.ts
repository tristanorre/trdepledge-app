import type { Config } from "tailwindcss";

// Tailwind is wired up so future field-app modules can use utilities.
// The marketing site itself uses the prototype's hand-authored CSS in
// globals.css to stay 1:1 with the approved design.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0A1F3D",
        "navy-mid": "#112848",
        "navy-light": "#1a3a5c",
        lime: "#A8D818",
        "lime-dark": "#7AAB0F",
        yellow: "#FFE500",
        "yellow-dark": "#D4BE00",
        off: "#F2F2EC",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-dm-serif-display)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
