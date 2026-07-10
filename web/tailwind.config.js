/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      colors: {
        // A warmer, plum-tinted near-black instead of flat gray-black —
        // reads as premium wellness tech rather than generic "dark mode."
        canvas: '#0C0A11',
        surface: {
          DEFAULT: '#16131E',
          raised: '#1E1A29',
          hover: '#262032',
        },
        line: 'rgba(255,255,255,0.07)',
        'line-strong': 'rgba(255,255,255,0.14)',
        ink: {
          DEFAULT: '#F5F1EC',
          secondary: '#AA9FB5',
          muted: '#726A80',
        },
        // Single signature accent for primary actions/active states, per
        // the "one accent" restraint rule — distinct from the per-state
        // wellness colors below so it never gets confused with a reading.
        brand: {
          DEFAULT: '#FF7A59',
          hover: '#FF9075',
          soft: 'rgba(255,122,89,0.15)',
        },
        state: {
          relax: '#2DD4A7',
          focus: '#5B8CFF',
          sleep: '#9B87F5',
          energize: '#FFB454',
          recover: '#5CDB8C',
          meditate: '#E68FD0',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
        glow: '0 0 40px -8px var(--tw-shadow-color)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 2.2s cubic-bezier(0.2,0.6,0.4,1) infinite',
      },
    },
  },
  plugins: [],
}
