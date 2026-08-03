/** @type {import('next').NextConfig} */
const nextConfig = {
  // localhost and 127.0.0.1 are different origins in the browser; allow both in dev
  // so client JS / HMR work whether you open either URL.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
