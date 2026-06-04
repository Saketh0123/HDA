module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          500: '#6366F1', // Indigo 500
          600: '#4F46E5', // Indigo 600
          700: '#4338CA', // Indigo 700
          900: '#312E81', // Indigo 900
        },
        accent: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          500: '#F59E0B', // Amber/Gold 500
          600: '#D97706',
        },
        sidebar: '#1E1B4B', // Dark indigo for sidebar
        success: '#10B981',
        alert: '#EF4444',
        bg: '#F8F7FF',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '20px',
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        'xxl': '48px',
      },
      boxShadow: {
        'subtle': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'medium': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'large': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(79, 70, 229, 0.5)',
      },
      fontFamily: {
        'sans': [
          '"Inter"',
          '"SF Pro Display"',
          '"Roboto"',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      fontSize: {
        'h1': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'h2': ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'h3': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body': ['14px', { lineHeight: '21px', fontWeight: '400' }],
        'body-sm': ['12px', { lineHeight: '18px', fontWeight: '400' }],
        'button': ['14px', { lineHeight: '20px', fontWeight: '600' }],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
