import type { NextConfig } from "next";
import { backendOrigin } from "./lib/backend-url";

const messagingPaths = [
  "/api/send",
  "/api/contacts",
  "/api/conversations/close",
  "/api/conversations/assign",
  "/api/twilio/incoming",
  "/api/twilio/message-status",
  "/api/twilio/messages",
  "/api/twilio/messages/:path*",
  "/api/campaigns/:id/tick",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["twilio", "jose"],
  async rewrites() {
    const origin = backendOrigin();
    return {
      beforeFiles: messagingPaths.map((source) => ({
        source,
        destination: `${origin}${source}`,
      })),
    };
  },
  async redirects() {
    return [
      {
        source: "/bulk",
        destination: "/campaign",
        permanent: true,
      },
      {
        source: "/bulk/:path*",
        destination: "/campaign/:path*",
        permanent: true,
      },
      {
        source: "/calls",
        destination: "/messages",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "revenelx.com",
        pathname: "/wp-content/uploads/**",
      },
    ],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
