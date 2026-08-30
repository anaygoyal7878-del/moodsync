import { GoogleGenAI } from '@google/genai';
import {
  biometricReadingRepository,
  automationRuleRepository,
  wearableConnectionRepository,
  smartHomeConnectionRepository,
  meditationSessionRepository,
} from '@moodsync/database';
import { computeWellnessScores, type WellnessScores } from './wellness.js';
import { computePersonalBaselines, type BaselineComparison } from './personalBaselines.js';
import { detectHealthScenarios } from './healthScenarios.js';
import { withGeminiFallback, geminiCallOptions, CLARA_MODEL_CANDIDATES } from './geminiRetry.js';

export interface ClaraChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ClaraNotConfiguredError extends Error {
  constructor() {
    super('Clara is not configured — GEMINI_API_KEY is not set.');
  }
}


/** Renders one score for the system prompt, or "no data yet" — Clara
 * must never guess a number the way it must never fabricate anything
 * else; a null score is stated as missing, not omitted or interpolated. */
function formatScore(score: WellnessScores[keyof WellnessScores]): string {
  return score.value === null ? 'no data yet' : `${score.value}/100 (${score.basis})`;
}

/**
 * Builds Clara's system prompt from this user's real, current MoodSync
 * data — the same repositories/computations the dashboard itself reads
 * (biometricReadingRepository, computeWellnessScores, automationRuleRepository,
 * connection lists, recent meditation sessions). Nothing here is
 * synthesized: a field with no data says so explicitly, so Clara's
 * answers are grounded in what's actually true for this account rather
 * than a plausible-sounding guess.
 */
export async function buildClaraSystemPrompt(userId: string): Promise<string> {
  const [latest, rules, wearables, smartHome, sessions] = await Promise.all([
    biometricReadingRepository.findLatestNormalized(userId),
    automationRuleRepository.listForUser(userId),
    wearableConnectionRepository.listForUser(userId),
    smartHomeConnectionRepository.listForUser(userId),
    meditationSessionRepository.listForUser(userId, 5),
  ]);

  let wellnessSection = 'No wearable data has synced for this user yet.';
  // Two sections Clara did not previously get, and the reason she could
  // describe numbers without being able to interpret them: what is
  // *normal for this user*, and which researched patterns currently
  // apply. Without a baseline, "resting heart rate 58" is a number with
  // no meaning — the model has no way to know whether that is this
  // person's calm or their alarm, so it either says nothing useful or
  // guesses against a population norm that may not fit them at all.
  let baselineSection = 'Not enough history yet to know this user’s personal normal ranges.';
  let scenarioSection = 'No researched physiological scenarios currently apply.';

  if (latest) {
    const history = await biometricReadingRepository.listRecentNormalized(userId, 30);
    const priorReadings = history.filter((r) => r.timestamp !== latest.reading.timestamp);
    const scores = computeWellnessScores(latest.reading, priorReadings);

    const baselines = computePersonalBaselines(latest.reading, priorReadings);
    if (baselines.hasAnyBaseline) {
      const line = (label: string, c: BaselineComparison | null, unit: string) =>
        c === null ? null : `  ${label}: ${c.value.toFixed(0)}${unit} vs personal average ${c.baseline.toFixed(0)}${unit} (${c.z >= 0 ? '+' : ''}${c.z.toFixed(1)} SD, from ${c.sampleSize} readings)`;
      baselineSection = [
        `This user's own normal ranges (never compare them to population averages — use these):`,
        line('restingHeartRate', baselines.restingHeartRate, 'bpm'),
        line('heartRateVariability', baselines.heartRateVariability, 'ms'),
        line('heartRate', baselines.heartRate, 'bpm'),
        line('sleepScore', baselines.sleepScore, ''),
        line('activityLevel', baselines.activityLevel, ''),
      ]
        .filter((l): l is string => l !== null)
        .join('\n');
    }

    const scenarios = detectHealthScenarios(baselines);
    if (scenarios.length > 0) {
      scenarioSection = scenarios
        .map((sc) => `- [${sc.severity}] ${sc.title}\n    Finding: ${sc.finding}\n    Suggested: ${sc.guidance}\n    Basis: ${sc.basis}\n    Backed by ${sc.sampleSize} readings. NOT diagnostic.`)
        .join('\n');
    }

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

  return `You are Clara, MoodSync's AI wellness assistant. You help this user understand their wellness data, suggest exercises and workout ideas, and offer recommendations grounded in what's actually true about their account below. You are warm, concise, and direct — not a generic chatbot.

CRITICAL: Only reference data given below. If something isn't in this context (e.g. exact calorie targets, medical diagnoses, a specific exercise's biomechanics you're not sure about), say so plainly rather than inventing a number or fact. You are not a doctor and must not give medical diagnoses — for anything that sounds like a medical concern, suggest they talk to a real clinician.

=== THIS USER'S REAL MOODSYNC DATA ===

${wellnessSection}

--- THIS USER'S PERSONAL BASELINES ---
${baselineSection}

--- RESEARCHED SCENARIOS CURRENTLY APPLYING ---
${scenarioSection}

Connected wearables: ${wearableSection}
Connected smart home: ${smartHomeSection}

Active automation rules:
${rulesSection}

Recent meditation sessions:
${sessionsSection}

=== END DATA ===

Keep replies conversational and reasonably short unless the user asks for detail. When you suggest a workout or exercise, ground it in the recovery/stress/sleep numbers above when they're available (e.g. low recovery -> suggest lighter activity), and say plainly when you're giving general wellness guidance not tied to their specific data.

HOW TO REASON WITH THE TWO SECTIONS ABOVE:

1. Compare to THEM, not to averages. A resting heart rate of 58 means nothing on its own — it matters only against their own average. When a personal baseline exists, say where they sit relative to it ("that's about 6bpm above your usual"). When there is no baseline yet, say you don't know their normal yet rather than falling back on a textbook range.

2. Lead with the researched scenarios when any apply. They are the highest-value thing you know: real patterns, with stated thresholds, in this person's own data. Explain what was measured and what it suggests. A "caution" outranks anything else you might have said.

3. Give the basis when you lean on a scenario. The user should be able to disagree with the reasoning, which means they need to see it. Do not present a threshold as your own opinion, and do not inflate it into certainty.

4. Never turn a scenario into a diagnosis. These are statistical signals, not tests. "Two stress signals together, which often means an easy day is the right call" is correct. "You are getting sick" is not, however strong the numbers look. Anything that sounds genuinely medical goes to a clinician.

5. Say when nothing applies. "Nothing in your numbers is standing out today" is a real, useful answer. Do not hunt for something to flag.

6. Respect the sample size. A scenario backed by 6 readings is a hint; one backed by 60 is a pattern. Say which you're looking at when it matters.

7. On music: when suggesting listening, the useful specifics are roughly 60–80 BPM for calming down or recovering (slow tempo is associated with lower heart rate and arousal) and 120–140 BPM for training (associated with longer time to exhaustion). MoodSync matches playlists in their own library by name and cannot read the tempo of their actual tracks, so offer these as what to reach for — never claim to know the BPM of a specific playlist of theirs.`;
}

/**
 * Sends one turn to Clara via the real Google Gemini API (Google AI
 * Studio's Gemini Developer API, not Vertex — see `GoogleGenAI({apiKey})`
 * below) — no canned/templated replies. Requires `GEMINI_API_KEY`;
 * callers should catch `ClaraNotConfiguredError` and surface a clear
 * "not set up yet" state rather than a generic 500. Gemini's chat
 * turns use `role: 'model'` for the assistant side (not 'assistant' —
 * a real, confirmed difference from Anthropic's/OpenAI's convention),
 * mapped at the boundary here so the rest of the app can keep using
 * 'assistant' everywhere else.
 */
export async function sendClaraMessage(userId: string, messages: ClaraChatMessage[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ClaraNotConfiguredError();

  const client = new GoogleGenAI({ apiKey });
  const systemInstruction = await buildClaraSystemPrompt(userId);

  const response = await withGeminiFallback(
    CLARA_MODEL_CANDIDATES,
    (model) =>
      client.models.generateContent({
        model,
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        config: { systemInstruction, ...geminiCallOptions() },
      }),
    'clara.chat',
  );

  return response.text ?? '';
}
