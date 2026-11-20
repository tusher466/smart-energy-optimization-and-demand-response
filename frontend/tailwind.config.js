/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0D1210', 900: '#131A17', 800: '#1B2420', 700: '#26322C' },
        bone: { 50: '#F6F3EC', 100: '#EDE8DC', 200: '#DDD6C6' },
        signal: { DEFAULT: '#E0A73A', hover: '#F0BB55', deep: '#9A6F16' },
        moss: { DEFAULT: '#5F8F6B', soft: '#A9C7B0' },
        slate_teal: '#3E7C86',
        brick: '#C2503A',
        ochre: '#C98A2B'
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Instrument Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
}
