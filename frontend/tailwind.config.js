/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
                display: ['Manrope', '"IBM Plex Sans"', 'sans-serif'],
                mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
            },
            colors: {
                rs: {
                    'deep-navy': '#06284A',
                    'navy-800': '#0A3A6B',
                    'navy-700': '#0D4D8A',
                    'primary': '#0757A8',
                    'bright': '#1389E8',
                    'cyan': '#35C7F4',
                    'orange': '#FF7417',
                    'orange-soft': '#FFB067',
                    'orange-pale': '#FFF4EB',
                    'ice': '#F7FBFF',
                    'ice-50': '#EDF4FB',
                    'text': '#06284A',
                    'text-secondary': '#3E5C7B',
                    'border': '#CBDCEE',
                    'border-dark': '#9CBBD8',
                    'card': '#FFFFFF',
                    'surface': '#F0F5FA',
                },
            },
            boxShadow: {
                'xs': '0 1px 2px rgba(0, 0, 0, 0.05)',
                'rs-xs': '0 1px 2px rgba(7, 87, 168, 0.04)',
                'rs-sm': '0 1px 3px rgba(7, 87, 168, 0.06), 0 1px 2px rgba(7, 87, 168, 0.04)',
                'rs-md': '0 4px 12px rgba(7, 87, 168, 0.08), 0 2px 4px rgba(7, 87, 168, 0.04)',
                'rs-lg': '0 8px 24px rgba(7, 87, 168, 0.10), 0 4px 8px rgba(7, 87, 168, 0.06)',
                'rs-xl': '0 16px 48px rgba(7, 87, 168, 0.12), 0 8px 16px rgba(7, 87, 168, 0.06)',
                'rs-glow': '0 0 20px rgba(19, 137, 232, 0.15), 0 0 60px rgba(19, 137, 232, 0.05)',
                'rs-orange': '0 4px 16px rgba(255, 116, 23, 0.20)',
                'rs-card': '0 1px 3px rgba(11, 46, 79, 0.04), 0 4px 12px rgba(11, 46, 79, 0.03)',
                'rs-card-hover': '0 4px 16px rgba(7, 87, 168, 0.10), 0 2px 6px rgba(7, 87, 168, 0.05)',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'slide-in-left': 'slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'scale-up': 'scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'scan-line': 'scanLine 2.5s ease-in-out infinite',
                'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
                'pulse-ring': 'pulseRing 2s ease-out infinite',
                'retina-rotate': 'retinaRotate 20s linear infinite',
                'shimmer': 'shimmer 2s linear infinite',
                'bounce-once': 'bounceOnce 0.5s ease-in-out',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
                fadeUp: {
                    from: { opacity: '0', transform: 'translateY(16px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                slideInLeft: {
                    from: { opacity: '0', transform: 'translateX(-20px)' },
                    to: { opacity: '1', transform: 'translateX(0)' },
                },
                slideInRight: {
                    from: { opacity: '0', transform: 'translateX(20px)' },
                    to: { opacity: '1', transform: 'translateX(0)' },
                },
                scaleUp: {
                    from: { opacity: '0', transform: 'scale(0.95)' },
                    to: { opacity: '1', transform: 'scale(1)' },
                },
                scanLine: {
                    '0%': { transform: 'translateY(-100%)', opacity: '0' },
                    '15%': { opacity: '1' },
                    '85%': { opacity: '1' },
                    '100%': { transform: 'translateY(100%)', opacity: '0' },
                },
                pulseSoft: {
                    '0%, 100%': { opacity: '1', transform: 'scale(1)' },
                    '50%': { opacity: '0.85', transform: 'scale(0.98)' },
                },
                pulseRing: {
                    '0%': { transform: 'scale(0.8)', opacity: '0.6' },
                    '100%': { transform: 'scale(2)', opacity: '0' },
                },
                retinaRotate: {
                    from: { transform: 'rotate(0deg)' },
                    to: { transform: 'rotate(360deg)' },
                },
                shimmer: {
                    from: { backgroundPosition: '-200% 0' },
                    to: { backgroundPosition: '200% 0' },
                },
                bounceOnce: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-4px)' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-8px)' },
                },
            },
        },
    },
    plugins: [],
};
