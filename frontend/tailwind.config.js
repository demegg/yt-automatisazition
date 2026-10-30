/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#06070A",
        sidebar: "#0A0B10",
        surface: {
          DEFAULT: "#0B0C12",
          raised: "#11131B",
          inset: "#0D0F16",
          border: "#232634",
        },
        ink: "#F5F6FA",
        muted: "#A4A9BC",
        faint: "#7C8197",
        accent: {
          DEFAULT: "#A78BFA",
          strong: "#7C5CFF",
          hover: "#6A47FF",
        },
        brand: {
          DEFAULT: "#FF7A45",
          hover: "#FFA37F",
        },
        ember: {
          300: "#FFB38A",
          400: "#FF8A57",
          500: "#FF6B3D",
          600: "#F0492A",
        },
        violet: {
          400: "#A78BFA",
          500: "#8B6CFF",
          600: "#7C5CFF",
        },
        ok: "#34D399",
        warn: "#FBBF24",
        danger: "#F87171",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Sora", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -20px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(255,122,69,0.35), 0 10px 40px -10px rgba(255,107,61,0.55)",
        "glow-violet": "0 0 0 1px rgba(124,92,255,0.35), 0 10px 40px -10px rgba(124,92,255,0.55)",
        lift: "0 24px 60px -24px rgba(0,0,0,0.75)",
      },
      maxWidth: {
        content: "72rem",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #FF8A57 0%, #FF4D7E 50%, #8B6CFF 100%)",
        "brand-gradient-soft":
          "linear-gradient(135deg, rgba(255,138,87,0.18) 0%, rgba(255,77,126,0.14) 50%, rgba(139,108,255,0.18) 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(6px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        stripes: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "28px 0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        "spin-slow": {
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.28s cubic-bezier(0.22,1,0.36,1) both",
        "slide-in-right": "slide-in-right 0.35s cubic-bezier(0.22,1,0.36,1) both",
        "slide-in-left": "slide-in-left 0.3s cubic-bezier(0.22,1,0.36,1) both",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 9s ease-in-out infinite",
        "gradient-pan": "gradient-pan 8s ease infinite",
        shimmer: "shimmer 2.2s linear infinite",
        stripes: "stripes 0.8s linear infinite",
        marquee: "marquee 30s linear infinite",
        "pulse-ring": "pulse-ring 1.6s cubic-bezier(0.22,1,0.36,1) infinite",
        "spin-slow": "spin-slow 18s linear infinite",
      },
    },
  },
  plugins: [],
};
