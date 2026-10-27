/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* Mode terang: skala “ink” dibalik jadi permukaan putih–abu muda supaya
           kelas lama (bg-ink-xxx) otomatis ikut terang. */
        ink: {
          950: '#eef4f4',
          900: '#ffffff',
          850: '#ffffff',
          800: '#f7fafa',
          700: '#e6eef0',
          600: '#cbd9dd',
        },
        /* Aksen utama = warna logo (teal/emerald), aksen kedua = cyan. */
        ok: '#16a34a',
        warn: '#d97706',
        bad: '#e11d48',
        brand: '#0d9488',
        accent: '#0891b2',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 42, 46, 0.04), 0 10px 24px -18px rgba(15, 42, 46, 0.35)',
        lift: '0 2px 6px 0 rgba(15, 42, 46, 0.06), 0 22px 40px -26px rgba(13, 148, 136, 0.45)',
        glow: '0 0 0 1px rgba(13,148,136,0.30), 0 0 28px -6px rgba(13,148,136,0.35)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: .45 } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        sheen: { '0%': { backgroundPosition: '-160% 0' }, '100%': { backgroundPosition: '260% 0' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        floaty: 'floaty 6s ease-in-out infinite',
        sheen: 'sheen 2.6s linear infinite',
      },
    },
  },
  plugins: [],
}
