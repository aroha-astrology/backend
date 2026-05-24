import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Only transpile shared types; astro-engine has compiled dist + uses WASM
  // Tell Next.js NOT to bundle these packages for server routes — load from node_modules at runtime
  serverExternalPackages: ['swisseph-wasm', '@aroha-astrology/astro-engine', '@aroha-astrology/shared', '@react-pdf/renderer', 'firebase-admin'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Force webpack to never bundle swisseph-wasm or astro-engine on server
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('swisseph-wasm', '@aroha-astrology/astro-engine', '@aroha-astrology/shared');
      }
    }

    // Stub Capacitor native plugins — they're dynamic-imported and guarded by
    // isNativePlatform() at runtime, so they never execute on web.
    // Mapping to false makes webpack emit an empty module instead of failing.
    const capacitorModules = [
      '@capacitor/geolocation',
      '@capacitor/camera',
      '@capacitor/browser',
      '@capacitor/push-notifications',
      '@capacitor/app',
      '@capacitor/splash-screen',
      '@capacitor/status-bar',
      '@capacitor/preferences',
      '@capacitor-community/speech-recognition',
      '@capacitor-community/text-to-speech',
    ];
    config.resolve.alias = config.resolve.alias ?? {};
    for (const mod of capacitorModules) {
      config.resolve.alias[mod] = false;
    }

    return config;
  },
};

export default nextConfig;
