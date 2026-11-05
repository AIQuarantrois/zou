const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/app.html" },
        { source: "/guides", destination: "/guides.html" },
        { source: "/guides/:id", destination: "/guides/:id.html" },
        { source: "/outils", destination: "/outils.html" },
        { source: "/outils/:id", destination: "/outils/:id.html" },
        { source: "/modeles", destination: "/modeles.html" },
        { source: "/modeles/:id", destination: "/modeles/:id.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: "/guides.html", destination: "/guides", permanent: true },
      { source: "/guides/:id.html", destination: "/guides/:id", permanent: true },
      { source: "/outils.html", destination: "/outils", permanent: true },
      { source: "/outils/:id.html", destination: "/outils/:id", permanent: true },
      { source: "/modeles.html", destination: "/modeles", permanent: true },
      { source: "/modeles/:id.html", destination: "/modeles/:id", permanent: true },
    ];
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    return [
      { source: "/:path*", headers: [...common, { key: "Content-Security-Policy", value: csp }] },
      { source: "/app.html", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      { source: "/assets/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
