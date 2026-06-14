/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './screens/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#00D2FF',
          secondary: '#7B2FFF',
          accent: '#FF6B35',
          danger: '#FF3B3B',
          success: '#00FF88',
        },
        bg: {
          dark: '#050A18',
          card: '#0D1B2E',
          glass: 'rgba(13, 27, 46, 0.8)',
        },
      },
      fontFamily: {
        sans: ['Inter-Regular'],
        bold: ['Inter-Bold'],
        mono: ['JetBrainsMono-Regular'],
      },
    },
  },
  plugins: [],
};
