/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#070b09",
        panel: "#101614",
        line: "#1c2a24",
        mist: "#9aada3",
        accent: "#3dd68c",
        warn: "#e6b84d",
        conflict: "#e85d4c",
      },
    },
  },
  plugins: [],
};
