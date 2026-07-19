import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next.js's dev server blocks cross-origin requests to its own assets
   * (HMR, _next/*, etc.) by default from any origin other than
   * localhost — a real, confirmed dev-mode CSRF hardening feature, not
   * a config oversight. Without this, loading the dev server from a
   * phone via the Mac's LAN IP (e.g. testing the iOS-synced dashboard
   * on a real device) silently fails to hydrate, which looks like the
   * login button doing nothing. Only takes effect under `next dev` —
   * production builds have no such restriction.
   */
  allowedDevOrigins: ["192.168.68.68"],
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
