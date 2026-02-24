/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './contexts/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        dark: '#1a1a2e',
        'dark-card': '#2a2a3e',
        danger: '#ff3b30',
        warning: '#ff9500',
        success: '#4cd964',
      },
    },
  },
  plugins: [],
}
