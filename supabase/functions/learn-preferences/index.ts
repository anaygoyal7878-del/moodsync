import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getSupabaseAdmin, requireUser } from "../_shared/supabaseAdmin.ts";
import { MoodLabel } from "../_shared/automationDispatch.ts";

type LearningSignal = "override" | "success";

interface LearnPreferencesBody {
  signal: LearningSignal;
  mood: MoodLabel;
  fragranceProfileId?: string;
  /** 0-1 intensity the user actually ended up with (their override, or the
   * automation's chosen intensity when the signal is "success"). */
  intensity?: number;
}

interface PreferencesRow {
  scent_affinity: Record<string, number>;
  intensity_preference: Record<string, number>;
  override_count: number;
  successful_automation_count: number;
}

// Exponential-moving-average learning rate: how strongly a single new
// signal shifts the running preference. Kept low so one outlier override
// doesn't overwrite weeks of consistent behavior.
const LEARNING_RATE = 0.2;
// A "success" (no override) is a weaker, more implicit signal than an
// explicit override, so it moves preferences more gently.
const SUCCESS_LEARNING_RATE = 0.08;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const { user } = await requireUser(req);
    const body = await req.json() as LearnPreferencesBody;

    if (body.signal !== "override" && body.signal !== "success") {
      return new Response(JSON.stringify({ error: "signal must be 'override' or 'success'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("user_preferences")
      .select("scent_affinity, intensity_preference, override_count, successful_automation_count")
      .eq("user_id", user.id)
      .maybeSingle<PreferencesRow>();

    const current: PreferencesRow = existing ?? {
      scent_affinity: {},
      intensity_preference: {},
      override_count: 0,
      successful_automation_count: 0,
    };

    const rate = body.signal === "override" ? LEARNING_RATE : SUCCESS_LEARNING_RATE;

    if (typeof body.intensity === "number") {
      const prior = current.intensity_preference[body.mood] ?? body.intensity;
      current.intensity_preference[body.mood] = ema(prior, body.intensity, rate);
    }

    if (body.fragranceProfileId) {
      const prior = current.scent_affinity[body.fragranceProfileId] ?? 0.5;
      const target = body.signal === "override" ? 1 : 1; // reinforcing signal either way
      current.scent_affinity[body.fragranceProfileId] = ema(prior, target, rate);
    }

    if (body.signal === "override") {
      current.override_count += 1;
    } else {
      current.successful_automation_count += 1;
    }

    const { error: upsertError } = await admin.from("user_preferences").upsert({
      user_id: user.id,
      scent_affinity: current.scent_affinity,
      intensity_preference: current.intensity_preference,
      override_count: current.override_count,
      successful_automation_count: current.successful_automation_count,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ preferences: current }), {
      status: 200,
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

function ema(prior: number, sample: number, rate: number): number {
  return prior + rate * (sample - prior);
}
