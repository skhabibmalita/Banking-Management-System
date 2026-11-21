/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Manrope', 'system-ui', 'sans-serif'] },
      colors: {
        navy: {
          50: '#F3F6FB', 100: '#E3EAF5', 200: '#C3D1E8', 300: '#93AACF',
          400: '#5D7DB0', 500: '#3A5A91', 600: '#264577', 700: '#173A7A',
          800: '#0F2A5C', 900: '#0A1F44', 950: '#071530',
        },
        brand: { DEFAULT: '#0891B2', light: '#22D3EE', soft: '#ECFEFF' },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(10,31,68,.06), 0 4px 16px -6px rgba(10,31,68,.10)',
      },
    },
  },
  plugins: [],
};
