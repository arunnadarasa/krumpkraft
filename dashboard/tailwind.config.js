/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        krump: {
          black: '#0a0a0b',
          surface: '#111113',
          card: '#18181b',
          muted: '#71717a',
          gold: '#eab308',
          goldDim: '#a16207',
          teal: '#2dd4bf',
          tealDim: '#0d9488',
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        'glow-gold': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(234,179,8,0.15), transparent)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.85' } },
      },
    },
  },
  plugins: [],
};
