import { proxyToBackend } from "@/lib/proxy";

export async function POST(request: Request) {
  return proxyToBackend("/api/workouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
