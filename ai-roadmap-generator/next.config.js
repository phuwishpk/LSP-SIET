const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    appDir: false,
    externalDir: true,
  },
  basePath: '/roadmap',
  webpack: (config) => {
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      ...(config.resolve.modules || ['node_modules']),
    ]
    return config
  },
}

module.exports = nextConfig
