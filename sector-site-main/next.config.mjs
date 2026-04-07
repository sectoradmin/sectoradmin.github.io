/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'thumbnailer.mixcloud.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig