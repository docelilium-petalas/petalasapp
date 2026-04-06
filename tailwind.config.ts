import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: "#7C3AED",
                    50: "#f5f3ff",
                    100: "#ede9fe",
                    200: "#ddd6fe",
                    300: "#c4b5fd",
                    400: "#a78bfa",
                    500: "#8b5cf6",
                    600: "#7c3aed",
                    700: "#6d28d9",
                    800: "#5b21b6",
                    900: "#4c1d95",
                    950: "#2e1065",
                },
                accent: {
                    DEFAULT: "#F472B6",
                    50: "#fdf2f8",
                    100: "#fce7f3",
                    200: "#fbcfe8",
                    300: "#f9a8d4",
                    400: "#f472b6",
                    500: "#ec4899",
                },
                surface: {
                    DEFAULT: "#FFFFFF",
                    50: "#F9FAFB",
                    100: "#F3F4F6",
                    200: "#E5E7EB",
                    300: "#D1D5DB",
                    muted: "#9CA3AF",
                },
                text: {
                    primary: "#111827",
                    secondary: "#4B5563",
                    muted: "#9CA3AF",
                    inverted: "#FFFFFF",
                }
            },
            fontFamily: {
                sans: ["var(--font-outfit)", "Inter", "system-ui", "sans-serif"],
                outfit: ["var(--font-outfit)", "Inter", "sans-serif"],
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "gradient-primary": "linear-gradient(135deg, #7C3AED 0%, #8B5CF6 50%, #9061FF 100%)",
                "gradient-subtle": "linear-gradient(135deg, #f5f3ff 0%, #fdf2f8 100%)",
                "gradient-glass": "linear-gradient(rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.1))",
            },
            boxShadow: {
                soft: "0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                medium: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                purple: "0 0 20px rgba(124, 58, 237, 0.15)",
                "purple-lg": "0 0 40px rgba(124, 58, 237, 0.25)",
                'premium': '0 20px 40px -15px rgba(124, 58, 237, 0.1)',
            },
            animation: {
                "fade-in": "fadeIn 0.4s ease-out",
                "slide-up": "slideUp 0.4s ease-out",
                "pulse-purple": "pulsePurple 2s ease-in-out infinite",
                shimmer: "shimmer 2s linear infinite",
                "bounce-slow": "bounce 3s infinite",
                "slide-left-slow": "slideLeft 5s linear infinite",
                "fade-in-up": "fadeInUp 0.6s ease-out forwards",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0", transform: "translateY(10px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                slideUp: {
                    "0%": { opacity: "0", transform: "translateY(20px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                pulsePurple: {
                    "0%, 100%": { boxShadow: "0 0 20px rgba(124, 58, 237, 0.15)" },
                    "50%": { boxShadow: "0 0 40px rgba(124, 58, 237, 0.35)" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" },
                },
                slideLeft: {
                    "0%": { transform: "translateX(0)" },
                    "50%": { transform: "translateX(-15px)" },
                    "100%": { transform: "translateX(0)" },
                },
                fadeInUp: {
                    "0%": { opacity: "0", transform: "translateY(20px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                }
            },
        },
    },
    plugins: [],
};
export default config;


