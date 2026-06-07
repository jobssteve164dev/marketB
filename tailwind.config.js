/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./sidebar.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bili: '#00AEEC',
          youtube: '#FF0000',
        }
      }
    },
  },
  plugins: [],
}
