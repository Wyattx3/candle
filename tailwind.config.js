/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Candle design tokens (mirrors constants/theme.ts -> Candle).
      // Sourced from the Pencil design file (candle.pen). Exposes NativeWind
      // utilities like bg-canvas, text-primary, border-hairline, bg-flame, etc.
      colors: {
        // Accent / flame
        accent: "#FF9500",
        "accent-soft": "#FF95001F",
        flame: "#FF9500",
        "flame-core": "#FFB340",
        "flame-deep": "#EA6C0A",
        ember: "#FF5E3A",

        // Backgrounds / surfaces
        canvas: "#FBF6EF",
        elevated: "#FFFDFA",
        "warm-deep": "#F3EBDE",
        "surface-sunken": "#F2EADD",

        // Ink / text
        ink: "#2A201A",
        "text-primary": "#2A201A",
        "text-secondary": "#7D7066",
        "text-tertiary": "#A89C8E",
        "text-on-accent": "#FFFFFF",
        "text-on-ink": "#FFFDF8",

        // Lines / glass
        hairline: "#2A201A17",
        "glass-border": "#FFFFFFDE",
        "glass-regular": "#FFFDF8C7",
        "glass-thick": "#FFFCF5D9",

        // Status
        success: "#3E9D5B",
        warning: "#C77400",
        danger: "#C0341D",

        // Terminal
        "terminal-bg": "#241B14",
        "terminal-text": "#FFB340",
      },
    },
  },
  plugins: [],
}
