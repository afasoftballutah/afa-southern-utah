/** @type {import('next').NextConfig} */
const nextConfig = {
  // localhost and 127.0.0.1 are different origins in the browser; allow both in dev
  // so client JS / HMR work whether you open either URL.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Old /scorekeeper/* director paths → /director/*; field → /scorekeeper/*
  async redirects() {
    return [
      {
        source: "/scorekeeper/field",
        destination: "/scorekeeper",
        permanent: true,
      },
      {
        source: "/scorekeeper/field/:path*",
        destination: "/scorekeeper/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/tournaments",
        destination: "/director/tournaments",
        permanent: true,
      },
      {
        source: "/scorekeeper/tournaments/:path*",
        destination: "/director/tournaments/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/teams",
        destination: "/director/teams",
        permanent: true,
      },
      {
        source: "/scorekeeper/teams/:path*",
        destination: "/director/teams/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/players",
        destination: "/director/players",
        permanent: true,
      },
      {
        source: "/scorekeeper/players/:path*",
        destination: "/director/players/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/registrations",
        destination: "/director/registrations",
        permanent: true,
      },
      {
        source: "/scorekeeper/registrations/:path*",
        destination: "/director/registrations/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/division/:path*",
        destination: "/director/division/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/umpires",
        destination: "/director/umpires",
        permanent: true,
      },
      {
        source: "/scorekeeper/umpires/:path*",
        destination: "/director/umpires/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
