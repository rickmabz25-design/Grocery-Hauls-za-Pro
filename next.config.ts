import type { NextConfig } from "next";

// STATIC (Spark) build: NEXT_PUBLIC_STATIC=1 switches to a fully static
// export for standard (free-plan) Firebase Hosting — no server, no API
// routes (scripts/build-static.mjs temporarily stashes them away).
// Normal builds keep the SSR standalone output for dev / preview / Blaze.
const isStatic = process.env.NEXT_PUBLIC_STATIC === "1";

const nextConfig: NextConfig = isStatic
  ? {
      output: "export",
      images: { unoptimized: true },
      typescript: { ignoreBuildErrors: true },
      reactStrictMode: false,
    }
  : {
      output: "standalone",
      /* config options here */
      typescript: {
        ignoreBuildErrors: true,
      },
      reactStrictMode: false,
    };

export default nextConfig;
