/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Violet-black grounds, after the dark field of a fluorescence microscope.
        ink: { 950: "#08070c", 900: "#100e17", 800: "#17141f", 700: "#231f2e", 600: "#383243" },
        bone: "#f3eee6",
        slate: { 100: "#f3eee6", 200: "#e6e0d8", 300: "#cbc4c6", 400: "#a39ba8", 500: "#817989", 600: "#5d5666" },
        // Brainbow labels. "sky" is kept as the name of the primary action ramp.
        sky: { 300: "#ffb39f", 400: "#ff8a6b", 500: "#ff6a4d" },
        gold: "#f6b73c",
        violet: { 300: "#b9acff", 400: "#9f8ff8", 500: "#8f7bf0" },
        teal: { 300: "#5fdcc3", 400: "#22c3a6" },
        rosy: "#ec5fa6",
        azure: "#5ea3f0",
      },
      fontFamily: {
        display: ["Anybody", "Instrument Sans", "system-ui", "sans-serif"],
        sans: ["Instrument Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
