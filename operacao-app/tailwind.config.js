/** @type {import('tailwindcss').Config} */
//
// A paleta `brand` é a da Olyvia, tirada do CRM e não inventada aqui:
// `src/index.css` do CRM define `--primary: 262 83% 58%`, que é exatamente
// #7c3aed. Os restantes tons são a mesma família, para que um botão desta app
// e um botão do CRM se leiam como o mesmo produto.
//
// O acento rosa (#e5197f) também vem do CRM — `--sidebar-primary: 340 82% 52%`,
// usado lá nos gradientes. Aqui serve só para detalhes de marca.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        brand: {
          DEFAULT: "#7c3aed",
          dark: "#6d28d9",
          light: "#a78bfa",
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
        },
        accent: {
          DEFAULT: "#e5197f",
          50: "#fdf2f8",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
        elevated: "0 10px 30px -12px rgba(15, 23, 42, 0.25)",
      },
    },
  },
  plugins: [],
};
