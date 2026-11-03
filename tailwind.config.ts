import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14213D',
        inksoft: '#3A4A6B',
        paper: '#F5F1E6',
        card: '#FFFDF8',
        rule: '#D8D0BC',
        brass: '#A97C3F',
        brassdark: '#8A6530',
        oxblood: '#7A1F2B',
        oxbloodbg: '#F7E9E9',
        amber: '#B8721A',
        amberbg: '#FBF0DD',
        forest: '#2E5339',
        forestbg: '#E8F0E8',
        violet: '#5B4B8A',
        violetbg: '#EDE9F5',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-plexmono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
