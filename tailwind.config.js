/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'baby-pink': '#F0DAE8',
        'baby-pink-light': '#F8EDF4',
        'baby-pink-dark': '#E5C7D9',
        'baby-text': '#373438',
        'baby-accent': '#A49AAE',
        'baby-accent-light': '#C4BCCB',
        'baby-cream': '#FDF8FB',
      },
      fontFamily: {
        'serif': ['Playfair Display', 'Georgia', 'serif'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 15px rgba(164, 154, 174, 0.15)',
        'soft-lg': '0 4px 25px rgba(164, 154, 174, 0.2)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
