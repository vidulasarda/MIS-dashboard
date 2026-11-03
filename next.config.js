/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['xlsx', 'pdf-parse', 'exceljs'],
  },
};

module.exports = nextConfig;
