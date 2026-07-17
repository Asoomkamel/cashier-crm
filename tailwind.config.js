/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          // Sampled from the Peurma logo's cyan-to-navy gradient.
          50: "#eaf7ff",
          100: "#cdeeff",
          200: "#9ee0ff",
          300: "#5ecdfb",
          400: "#00b4f0",
          500: "#0090dc",
          600: "#0072b8",
          700: "#005a94",
          800: "#003c78",
          900: "#001450",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #00b4f0 0%, #0072b8 45%, #001450 100%)",
      },
    },
  },
  plugins: [],
};
