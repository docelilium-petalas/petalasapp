import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // unsafe-eval required by Next.js dev/prod runtime
      "style-src 'self' 'unsafe-inline'",                   // unsafe-inline required by Tailwind CSS-in-JS
      // Fotos das peças vêm da CDN da Nuvemshop. Sem estes hosts o navegador
      // bloqueava TODA foto do /catalogo (medido em 14/09/2026).
      "img-src 'self' data: blob: https://*.mitiendanube.com https://*.nuvemshop.com.br https://*.tiendanube.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
