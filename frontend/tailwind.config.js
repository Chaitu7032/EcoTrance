/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Newsreader", "Charter", "Georgia", "Cambria", "serif"],
        sans: ["IBM Plex Sans", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        ink: "#0c1216",
        paper: "#f4f1ea",
        panel: "#121a20",
        panelAlt: "#162028",
        line: "#22303a",
        lineBright: "#324452",
        stone: "#8e99a2",
        mist: "#8e99a2",
        forest: "#2d5a43",
        forestLight: "#3e7b5c",
        accent: "#34d399",
        warn: "#eab308",
        conflict: "#f43f5e",
      },
    },
  },
  plugins: [],
};
