import { proxyToBackend } from "@/lib/proxy";

/** Recent biometric readings, for client-side analytics that refresh
 * without a page reload. `days` is passed through and bounded by the
 * backend. */
export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyToBackend(`/api/biometrics/history${query}`);
}
