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
        app: "rgb(var(--color-app) / <alpha-value>)",
        sidebar: "rgb(var(--color-sidebar) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        surfaceHigh: "rgb(var(--color-surface-high) / <alpha-value>)",
        elevated: "rgb(var(--color-elevated) / <alpha-value>)",
        mutedSurface: "rgb(var(--color-muted-surface) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        accentLine: "rgb(var(--color-accent-line) / <alpha-value>)",
        logoSurface: "rgb(var(--color-logo-surface) / <alpha-value>)",
        hoverLine: "rgb(var(--color-hover-line) / <alpha-value>)",
        brandPurple: "rgb(var(--color-brand-purple) / <alpha-value>)",
        brandOrange: "rgb(var(--color-brand-orange) / <alpha-value>)",
        good: "rgb(var(--color-good) / <alpha-value>)",
        warn: "rgb(var(--color-warn) / <alpha-value>)",
        bad: "rgb(var(--color-bad) / <alpha-value>)",
        info: "rgb(var(--color-info) / <alpha-value>)"
      }
    }
  },
  plugins: []
};
