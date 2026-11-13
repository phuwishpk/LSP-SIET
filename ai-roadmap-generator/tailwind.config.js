const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    '../shared/components/**/*.{js,ts,jsx,tsx}',
    '../shared/mascot/**/*.{js,ts,jsx,tsx}',
  ],
  // `dark:` follows SIET Space's choice (lib/theme.js sets the class), not the OS.
  darkMode: 'class',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // `font-sans` (the page shell) is this app's face, as in AI Quiz.
      fontFamily: {
        sans: ['Nunito', 'IBM Plex Sans Thai', 'Noto Sans Thai', ...defaultTheme.fontFamily.sans],
      },
      // Tailwind 4 names used by the shared navbar (SIET Space and AI Quiz are on
      // Tailwind 4), with Tailwind 4's values.
      boxShadow: { xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
      dropShadow: { xs: '0 1px 1px rgb(0 0 0 / 0.05)' },
      backdropBlur: { xs: '4px' },
    },
  },
  plugins: [
    ({ addUtilities }) => {
      addUtilities({ '.outline-hidden': { outline: '2px solid transparent', 'outline-offset': '2px' } })
    },
  ],
}
