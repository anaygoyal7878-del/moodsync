import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Only needed for local/tunnel-based Alexa testing (see
   * docs/ALEXA_DEVELOPER_GUIDE.md): Amazon's servers call
   * /api/alexa/skill and /api/integrations/alexa/token directly, but a
   * free ngrok account only allows one simultaneous public tunnel. These
   * rewrites let a single tunnel pointed at the frontend also reach the
   * backend for just those two paths, proxied transparently (Next.js
   * forwards the raw request to an external rewrite destination without
   * re-parsing the body, which matters for /api/alexa/skill's signature
   * verification needing the exact original bytes). Every other
   * /api/... path is handled by this app's own Route Handlers, not this
   * rewrite, since Next.js only applies a rewrite when no local route
   * already matches.
   */
  async rewrites() {
    const backendUrl = process.env.ALEXA_TUNNEL_BACKEND_URL;
    if (!backendUrl) return [];
    return [
      { source: "/api/alexa/skill", destination: `${backendUrl}/api/alexa/skill` },
      { source: "/api/integrations/alexa/token", destination: `${backendUrl}/api/integrations/alexa/token` },
    ];
  },
};

export default nextConfig;
