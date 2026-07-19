import { GoogleGenAI } from '@google/genai';
import {
  biometricReadingRepository,
  automationRuleRepository,
  wearableConnectionRepository,
  smartHomeConnectionRepository,
  meditationSessionRepository,
} from '@moodsync/database';
import { computeWellnessScores, type WellnessScores } from './wellness.js';

export interface AtlasChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AtlasNotConfiguredError extends Error {
  constructor() {
    super('Atlas is not configured — GEMINI_API_KEY is not set.');
  }
}

/** Google's maintained "latest flash" alias rather than a dated model
 * name (e.g. `gemini-2.5-flash`) — confirmed live against this
 * project's real key that a dated name can 404 with "no longer
 * available to new users" even while still listed in `models.list`,
 * so pinning to a specific version is the wrong tradeoff here; the
 * alias is what Google itself repoints as models get deprecated.
 * Free-tier-eligible on Google AI Studio (ai.google.dev/gemini-api/docs/rate-limits). */
const MODEL = 'gemini-flash-latest';

/** Renders one score for the system prompt, or "no data yet" — Atlas
 * must never guess a number the way it must never fabricate anything
 * else; a null score is stated as missing, not omitted or interpolated. */
function formatScore(score: WellnessScores[keyof WellnessScores]): string {
  return score.value === null ? 'no data yet' : `${score.value}/100 (${score.basis})`;
}

/**
 * Builds Atlas's system prompt from this user's real, current MoodSync
 * data — the same repositories/computations the dashboard itself reads
 * (biometricReadingRepository, computeWellnessScores, automationRuleRepository,
 * connection lists, recent meditation sessions). Nothing here is
 * synthesized: a field with no data says so explicitly, so Atlas's
 * answers are grounded in what's actually true for this account rather
 * than a plausible-sounding guess.
 */
async function buildSystemPrompt(userId: string): Promise<string> {
  const [latest, rules, wearables, smartHome, sessions] = await Promise.all([
    biometricReadingRepository.findLatestNormalized(userId),
    automationRuleRepository.listForUser(userId),
    wearableConnectionRepository.listForUser(userId),
    smartHomeConnectionRepository.listForUser(userId),
    meditationSessionRepository.listForUser(userId, 5),
  ]);

  let wellnessSection = 'No wearable data has synced for this user yet.';
  if (latest) {
    const history = await biometricReadingRepository.listRecentNormalized(userId, 30);
    const scores = computeWellnessScores(
      latest.reading,
      history.filter((r) => r.timestamp !== latest.reading.timestamp),
    );
    const r = latest.reading;
    wellnessSection = [
      `Latest reading (${r.timestamp}, provider: ${r.provider}):`,
      `  heartRate: ${r.heartRate ?? 'n/a'}, restingHeartRate: ${r.restingHeartRate ?? 'n/a'}`,
      `  sleepScore: ${r.sleepScore ?? 'n/a'}, recoveryScore: ${r.recoveryScore ?? 'n/a'}, stressLevel: ${r.stressLevel ?? 'n/a'}`,
      `  activityLevel: ${r.activityLevel ?? 'n/a'}, steps: ${r.steps ?? 'n/a'}, calories: ${r.calories ?? 'n/a'}`,
      `Computed wellness scores (0-100, MoodSync's own heuristics — see basis):`,
      `  stress: ${formatScore(scores.stress)}, recovery: ${formatScore(scores.recovery)}, sleep: ${formatScore(scores.sleep)}`,
      `  energy: ${formatScore(scores.energy)}, fatigue: ${formatScore(scores.fatigue)}, focus: ${formatScore(scores.focus)}`,
      `  relaxation: ${formatScore(scores.relaxation)}, overall: ${formatScore(scores.overall)}`,
    ].join('\n');
  }

  const activeRules = rules.filter((r) => r.enabled);
  const rulesSection =
    activeRules.length === 0
      ? 'No active automation rules.'
      : activeRules
          .map((r) => `- "${r.name}": ${r.conditions.length} condition(s), ${r.actions.length} action(s), cooldown ${r.cooldownMinutes}min`)
          .join('\n');

  const wearableSection = wearables.length === 0 ? 'None connected.' : wearables.map((w) => `${w.provider} (${w.status})`).join(', ');
  const smartHomeSection = smartHome.length === 0 ? 'None connected.' : smartHome.map((c) => `${c.provider} (${c.status})`).join(', ');

  const sessionsSection =
    sessions.length === 0
      ? 'No meditation sessions logged yet.'
      : sessions.map((s) => `- ${s.durationMinutes}min ${s.ambience ?? 'silent'} session on ${s.completedAt}`).join('\n');

  return `You are Atlas, MoodSync's AI wellness assistant. You help this user understand their wellness data, suggest exercises and workout ideas, and offer recommendations grounded in what's actually true about their account below. You are warm, concise, and direct — not a generic chatbot.

CRITICAL: Only reference data given below. If something isn't in this context (e.g. exact calorie targets, medical diagnoses, a specific exercise's biomechanics you're not sure about), say so plainly rather than inventing a number or fact. You are not a doctor and must not give medical diagnoses — for anything that sounds like a medical concern, suggest they talk to a real clinician.

=== THIS USER'S REAL MOODSYNC DATA ===

${wellnessSection}

Connected wearables: ${wearableSection}
Connected smart home: ${smartHomeSection}

Active automation rules:
${rulesSection}

Recent meditation sessions:
${sessionsSection}

=== END DATA ===

Keep replies conversational and reasonably short unless the user asks for detail. When you suggest a workout or exercise, ground it in the recovery/stress/sleep numbers above when they're available (e.g. low recovery -> suggest lighter activity), and say plainly when you're giving general wellness guidance not tied to their specific data.`;
}

/**
 * Sends one turn to Atlas via the real Google Gemini API (Google AI
 * Studio's Gemini Developer API, not Vertex — see `GoogleGenAI({apiKey})`
 * below) — no canned/templated replies. Requires `GEMINI_API_KEY`;
 * callers should catch `AtlasNotConfiguredError` and surface a clear
 * "not set up yet" state rather than a generic 500. Gemini's chat
 * turns use `role: 'model'` for the assistant side (not 'assistant' —
 * a real, confirmed difference from Anthropic's/OpenAI's convention),
 * mapped at the boundary here so the rest of the app can keep using
 * 'assistant' everywhere else.
 */
export async function sendAtlasMessage(userId: string, messages: AtlasChatMessage[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AtlasNotConfiguredError();

  const client = new GoogleGenAI({ apiKey });
  const systemInstruction = await buildSystemPrompt(userId);

  const response = await client.models.generateContent({
    model: MODEL,
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    config: { systemInstruction },
  });

  return response.text ?? '';
}
