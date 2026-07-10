import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getSupabaseAdmin, requireUser } from "../_shared/supabaseAdmin.ts";
import { dispatchDiffuserCommand, MoodLabel } from "../_shared/automationDispatch.ts";

const VALID_MOODS: readonly MoodLabel[] = [
  "relaxed",
  "focused",
  "high_stress",
  "fatigued",
  "sleeping",
  "recovering",
  "energized",
];

interface MoodIngestBody {
  mood: MoodLabel;
  confidence: number; // 0-1
  componentScores: Record<string, number>;
  contributingFactors: string[];
  engineVersion: string;
  inferredAt?: string; // ISO 8601, defaults to now
}

/**
 * Receives the *output* of the on-device mood engine only — never raw
 * HealthKit samples. The iOS app runs MoodEngine locally against HealthKit
 * data and posts just the inferred mood + score breakdown here, which is
 * the minimum needed to drive automation and let the user review history.
 */
Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const { user } = await requireUser(req);
    const body = await req.json() as MoodIngestBody;

    if (!VALID_MOODS.includes(body.mood)) {
      return new Response(JSON.stringify({ error: `Invalid mood: ${body.mood}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof body.confidence !== "number" || body.confidence < 0 || body.confidence > 1) {
      return new Response(JSON.stringify({ error: "confidence must be between 0 and 1" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();

    const { data: moodState, error: insertError } = await admin
      .from("mood_states")
      .insert({
        user_id: user.id,
        mood: body.mood,
        confidence: body.confidence,
        component_scores: body.componentScores,
        contributing_factors: body.contributingFactors ?? [],
        engine_version: body.engineVersion,
        inferred_at: body.inferredAt ?? new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !moodState) throw insertError ?? new Error("Failed to insert mood state");

    const dispatch = await dispatchDiffuserCommand(admin, {
      userId: user.id,
      triggerSource: "mood_engine",
      moodStateId: moodState.id,
      mood: body.mood,
    });

    return new Response(
      JSON.stringify({ moodStateId: moodState.id, dispatch }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
