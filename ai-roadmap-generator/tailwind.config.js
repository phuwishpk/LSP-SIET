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
    extend: {},
  },
  plugins: [],
}
