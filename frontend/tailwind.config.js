/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        campusBlue: 'var(--color-campus-blue)',
        campusDark: 'var(--color-campus-dark)',
        campusCard: 'var(--color-campus-card)',
        campusText: 'var(--color-campus-text)',
        campusHover: 'var(--color-campus-hover)',
        campusBorder: 'var(--color-campus-border)',
        campusAccent: 'var(--color-campus-accent)',
        campusMuted: 'var(--color-campus-muted)',
        campusSuccess: 'var(--color-campus-success)',
        campusError: 'var(--color-campus-error)',
        campusWarn: 'var(--color-campus-warn)',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-dot': 'bounce 1.4s infinite ease-in-out both',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
