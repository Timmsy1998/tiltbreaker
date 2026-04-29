/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ]
      },
      colors: {
        panel: "#15181d",
        ink: "#eef2f3",
        muted: "#8d96a3",
        line: "#2a3038",
        brandPurple: "#8a3ffc",
        brandOrange: "#ff9f1a",
        good: "#27c07d",
        warn: "#e8aa3b",
        bad: "#ec5f67",
        info: "#4da3ff"
      }
    }
  },
  plugins: []
};
