/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // 世系图节点字体族统一由 --node-font 提供，改一处所有节点同步生效
        song: ['var(--node-font)'],
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* ── 家族族谱专用色 ── */
        ink: {
          950: "#081A21",
          900: "#0C2129",
          800: "#12303B",
          700: "#173A47",
          600: "#1E4859",
          500: "#2F6377",
          400: "#4C7F92",
          300: "#7EA0AE",
          200: "#B4C9D2",
          100: "#DCE6EA",
          50: "#F0F4F6",
        },
        gold: {
          700: "#8F7134",
          600: "#C9A227",
          500: "#B8922A",
          200: "#E7D9BC",
          100: "#F3EBD9",
        },
        seal: {
          700: "#83372A",
          600: "#B04A3A",
          500: "#C86B5A",
          400: "#D98A7C",
          300: "#E8B2A7",
          100: "#F5E4DF",
        },
        /* 操作日志等辅助按钮用的沉静蓝（与整体水墨风协调） */
        azure: {
          700: "#2D5F8B",
          600: "#3572A5",
          400: "#7FA8CC",
          300: "#A6C2DA",
          100: "#E4EEF6",
        },
        paper: {
          50: "#FBFAF7",
          100: "#F4F1EA",
          200: "#ECE7DA",
          300: "#DED7C6",
          400: "#CFC8B9",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        card: "0 1px 2px rgba(12, 33, 41, 0.04), 0 8px 24px -12px rgba(12, 33, 41, 0.12)",
        float: "0 2px 8px rgba(12, 33, 41, 0.06), 0 16px 40px -16px rgba(12, 33, 41, 0.18)",
      },
      letterSpacing: {
        seal: "0.25em",
        wide2: "0.15em",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
