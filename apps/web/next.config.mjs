/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Saída mínima para container (Docker/Coolify).
  output: 'standalone',
  // Lint é executado pelo turbo (eslint), não no build do Next.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
