/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Allow large request bodies through middleware (audio recordings)
  middlewareClientMaxBodySize: false,
}

export default nextConfig
