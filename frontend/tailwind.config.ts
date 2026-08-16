import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── FlowState Design System (v2) — CSS variable driven ────
        'background': 'rgb(var(--background) / <alpha-value>)',
        'surface': 'rgb(var(--background) / <alpha-value>)',
        'surface-dim': 'rgb(var(--background) / <alpha-value>)',
        'surface-bright': '#37393b',
        'surface-container-lowest': '#0c0e10',
        'surface-container-low': 'rgb(var(--surface-container-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--surface-container-high) / <alpha-value>)',
        'surface-container-highest': '#333537',
        'surface-variant': '#333537',
        'on-surface': 'rgb(var(--on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--on-surface-variant) / <alpha-value>)',
        'on-background': 'rgb(var(--on-surface) / <alpha-value>)',
        // Primary
        'primary': 'rgb(var(--primary) / <alpha-value>)',
        'primary-container': 'rgb(var(--primary-container) / <alpha-value>)',
        'primary-fixed': '#ffdbc9',
        'primary-fixed-dim': 'rgb(var(--primary) / <alpha-value>)',
        'on-primary': 'rgb(var(--on-primary) / <alpha-value>)',
        'on-primary-container': '#682d00',
        'on-primary-fixed': '#321200',
        'on-primary-fixed-variant': 'rgb(var(--on-primary-fixed-variant) / <alpha-value>)',
        'inverse-primary': '#9a4600',
        'surface-tint': 'rgb(var(--primary) / <alpha-value>)',
        // Secondary
        'secondary': 'rgb(var(--secondary) / <alpha-value>)',
        'secondary-container': '#2f34b1',
        'secondary-fixed': '#e0e0ff',
        'secondary-fixed-dim': 'rgb(var(--secondary) / <alpha-value>)',
        'on-secondary': '#12139b',
        'on-secondary-container': '#aaaeff',
        'on-secondary-fixed': '#02006d',
        'on-secondary-fixed-variant': '#2f34b1',
        // Tertiary
        'tertiary': 'rgb(var(--tertiary) / <alpha-value>)',
        'tertiary-container': '#bc96ff',
        'tertiary-fixed': '#ebdcff',
        'tertiary-fixed-dim': 'rgb(var(--tertiary) / <alpha-value>)',
        'on-tertiary': '#400688',
        'on-tertiary-container': '#4e1f95',
        'on-tertiary-fixed': '#260058',
        'on-tertiary-fixed-variant': '#582a9f',
        // Error
        'error': '#ffb4ab',
        'error-container': '#93000a',
        'on-error': '#690005',
        'on-error-container': '#ffdad6',
        // Outline
        'outline': '#a58c7f',
        'outline-variant': 'rgb(var(--outline-variant) / <alpha-value>)',
        // Inverse
        'inverse-surface': '#e2e2e5',
        'inverse-on-surface': '#2f3133',
        // Legacy primary scale (400/500 map to theme-aware tokens)
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          50: '#fff7ed',
          100: '#ffedd5',
          400: 'rgb(var(--primary) / <alpha-value>)',
          500: 'rgb(var(--primary-container) / <alpha-value>)',
          600: '#ea580c',
          700: '#c2410c',
        },
      },
      borderRadius: {
        DEFAULT: '1rem',
        sm: '0.5rem',
        md: '0.75rem',
        lg: '2rem',
        xl: '3rem',
        full: '9999px',
      },
      spacing: {
        'base': '8px',
        'stack-sm': '12px',
        'stack-md': '24px',
        'stack-lg': '40px',
        'gutter': '24px',
        'margin-mobile': '20px',
        'margin-desktop': '64px',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
        'display-lg': ['Outfit', 'sans-serif'],
        'headline-lg': ['Outfit', 'sans-serif'],
        'title-md': ['Outfit', 'sans-serif'],
        'label-lg': ['Outfit', 'sans-serif'],
        'body-lg': ['Outfit', 'sans-serif'],
        'body-md': ['Outfit', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '600' }],
        'headline-lg-mobile': ['28px', { lineHeight: '36px', fontWeight: '600' }],
        'title-md': ['20px', { lineHeight: '28px', fontWeight: '500' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.6s ease-out forwards',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-sm': 'floatSm 3s ease-in-out infinite',
        'shine': 'shine 3s linear infinite',
        'bar-grow': 'barGrow 1.2s ease-in-out infinite',
        'wave': 'wave 1s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-short': 'bounceShort 0.5s ease-in-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        floatSm: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        shine: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
        barGrow: {
          '0%, 100%': { height: '20px' },
          '50%': { height: '80px' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(0.3)' },
        },
        bounceShort: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      boxShadow: {
        'primary': '0 0 20px rgba(255, 182, 141, 0.2)',
        'primary-lg': '0 0 30px rgba(255, 182, 141, 0.3)',
        'squishy': '0 4px 0 0 #763300',
        'squishy-sm': '0 2px 0 0 rgba(0,0,0,0.3)',
        'squishy-md': '0 6px 0 0 rgba(0,0,0,0.3)',
        'card': '0 8px 0 0 rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [typography, animate],
}

export default config
