import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getSupabaseAdmin, requireUser } from "../_shared/supabaseAdmin.ts";
import { dispatchDiffuserCommand, stopDiffuserDevice } from "../_shared/automationDispatch.ts";

interface ManualDispatchBody {
  action?: "dispatch" | "stop";
  deviceId: string;
  fragranceProfileId?: string;
  intensity?: number; // 0-1
  runtimeMinutes?: number;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const { user } = await requireUser(req);
    const body = await req.json() as ManualDispatchBody;

    if (!body.deviceId) {
      return new Response(JSON.stringify({ error: "deviceId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();

    if (body.action === "stop") {
      await stopDiffuserDevice(admin, user.id, body.deviceId);
      return new Response(JSON.stringify({ outcome: "stopped" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await dispatchDiffuserCommand(admin, {
      userId: user.id,
      triggerSource: "manual_override",
      overrideDeviceId: body.deviceId,
      overrideFragranceProfileId: body.fragranceProfileId,
      overrideIntensity: body.intensity,
      overrideRuntimeMinutes: body.runtimeMinutes,
    });

    const status = result.outcome === "failed" ? 502 : 200;
    return new Response(JSON.stringify(result), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
