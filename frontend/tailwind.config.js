/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0a0d14", 900: "#0f1420", 800: "#161d2d", 700: "#212a3e", 600: "#2e3a54" },
        spike: { DEFAULT: "#38bdf8", hot: "#f472b6", warm: "#facc15" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "monospace"] },
    },
  },
  plugins: [],
};
