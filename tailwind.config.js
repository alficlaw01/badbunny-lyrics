/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'concert-bg': '#0a0a0a',
        'concert-yellow': '#FFE600',
        'concert-dim': '#4a4a4a',
      },
    },
  },
  plugins: [],
}

