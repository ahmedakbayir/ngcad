/** @type {import('next').NextConfig} */
const CAD_DEV_ORIGIN = process.env.CAD_DEV_ORIGIN || 'http://127.0.0.1:5500';

const nextConfig = {
  experimental: {
    typedRoutes: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  // CAD'i same-origin gibi servis et (Live Server'a proxy).
  // Böylece Supabase cookie'leri sorunsuz gider, CORS gerekmez.
  async rewrites() {
    return [
      { source: '/cad',            destination: `${CAD_DEV_ORIGIN}/index.html` },
      { source: '/cad/',           destination: `${CAD_DEV_ORIGIN}/index.html` },
      { source: '/cad/:path*',     destination: `${CAD_DEV_ORIGIN}/:path*` },
    ];
  },
};

export default nextConfig;
