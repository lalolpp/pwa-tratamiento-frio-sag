/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.html',
    './src/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        glass: {
          white: 'rgba(255, 255, 255, 0.15)',
          white2: 'rgba(255, 255, 255, 0.25)',
          white3: 'rgba(255, 255, 255, 0.35)',
          dark: 'rgba(15, 23, 42, 0.6)',
          dark2: 'rgba(15, 23, 42, 0.8)',
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-success': '0 0 20px rgba(34, 197, 94, 0.4)',
        'glow-danger': '0 0 20px rgba(239, 68, 68, 0.4)',
        'glow-warning': '0 0 20px rgba(245, 158, 11, 0.4)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
        'glass-lg': '0 8px 32px 0 rgba(31, 38, 135, 0.25)',
        'glass-dark': '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
      },
      backdropBlur: {
        'glass': '16px',
      },
    },
  },
  plugins: [],
};
