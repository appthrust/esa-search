// AppThrust web-service probes (startup/liveness) hit /healthz; the readiness
// probe uses "/". Keep this dependency-free so a Knowledge or database outage
// never restarts the container.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
