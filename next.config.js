/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy. Ships as REPORT-ONLY by default so a missed third-party origin can't break
// the site on day one: deploy, open the browser console on each key page, fix any violations,
// then set CSP_ENFORCE=true to enforce it.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://image.tmdb.org https://*.razorpay.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isProd ? '' : " 'unsafe-eval'"}`,
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com",
  // Razorpay Checkout runs in an iframe served from api.razorpay.com / checkout.razorpay.com.
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "media-src 'self' blob:",
  'upgrade-insecure-requests'
].join('; ');

const securityHeaders = [
  { key: process.env.CSP_ENFORCE === 'true' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // camera=(self) is required by the organizer QR scanner.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com"), interest-cohort=()' },
  // same-origin-allow-popups: Razorpay opens bank/UPI pages in popups on some devices and needs to talk back.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'image.tmdb.org' }
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // API responses are data, not documents: keep them out of search indexes and out of shared caches.
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] }
    ];
  },
  async redirects() {
    return [
      // Canonicalise legacy/duplicate URLs into one indexable address each.
      { source: '/index', destination: '/', permanent: true },
      { source: '/favicon.svg', destination: '/icon.svg', permanent: true }
    ];
  }
};
module.exports = nextConfig;
