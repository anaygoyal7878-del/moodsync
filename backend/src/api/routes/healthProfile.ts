import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { healthProfileRepository, biometricReadingRepository, userPreferencesRepository } from '@moodsync/database';
import { ageFrom, estimateMaxHeartRate, heartRateZones, bmiFor, weightTrend } from '@moodsync/ai';

/**
 * The health profile: what the person told MoodSync, plus what MoodSync
 * worked out from it.
 *
 * One GET returns both on purpose. The derived values (age, estimated
 * max heart rate, zones, BMI, weight trend) are cheap to compute and
 * change whenever the inputs do, so storing them would only create a
 * second copy that can drift from the first.
 */

const profileSchema = z.object({
  /** YYYY-MM-DD. A calendar date — time of birth is irrelevant here and
   * a timestamp would shift across a day boundary by timezone. */
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  heightCm: z.number().min(90).max(250).nullable().optional(),
});

const weightSchema = z.object({
  weightKg: z.number().min(20).max(350),
});

/** How far back to look for an observed heart-rate peak. A season of
 * training is enough to have hit something near max at least once; any
 * longer and an old peak from years ago outlives the fitness behind it. */
const PEAK_LOOKBACK_DAYS = 90;

export default async function healthProfileRoutes(app: FastifyInstance) {
  app.get('/health-profile', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [profile, weights, units, readings] = await Promise.all([
      healthProfileRepository.get(userId),
      healthProfileRepository.listWeights(userId),
      userPreferencesRepository.getPreferredUnits(userId),
      biometricReadingRepository.listRecentNormalized(userId, PEAK_LOOKBACK_DAYS),
    ]);

    const age = profile?.birthDate ? ageFrom(profile.birthDate) : null;

    // The highest heart rate the person's own device has recorded. When it
    // beats the age formula, the formula is demonstrably too low for them.
    const peaks = readings.map((r) => r.heartRate).filter((v): v is number => typeof v === 'number');
    const observedPeak = peaks.length > 0 ? Math.max(...peaks) : null;

    const maxHr = age !== null ? estimateMaxHeartRate(age, observedPeak) : null;
    const latestWeight = weights[0]?.weightKg ?? null;
    const bmi = profile?.heightCm && latestWeight !== null ? bmiFor(profile.heightCm, latestWeight, age) : null;

    return reply.send({
      profile: {
        birthDate: profile?.birthDate ? profile.birthDate.toISOString().slice(0, 10) : null,
        heightCm: profile?.heightCm ?? null,
      },
      units,
      weights: weights.map((w) => ({ id: w.id, weightKg: w.weightKg, recordedAt: w.recordedAt.toISOString() })),
      derived: {
        age,
        maxHeartRate: maxHr,
        zones: maxHr ? heartRateZones(maxHr.bpm) : null,
        bmi,
        weightTrend: weightTrend(weights.map((w) => ({ weightKg: w.weightKg, recordedAt: w.recordedAt }))),
      },
    });
  });

  app.put('/health-profile', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    let birthDate: Date | null | undefined;
    if (parsed.data.birthDate === null) birthDate = null;
    else if (parsed.data.birthDate !== undefined) {
      birthDate = new Date(`${parsed.data.birthDate}T00:00:00.000Z`);
      // Validated here as well as in the UI: a birth date that yields no
      // plausible age (future, or 1880) is an entry error, not data.
      if (ageFrom(birthDate) === null) return reply.code(400).send({ error: 'That birth date gives an implausible age.' });
    }

    await healthProfileRepository.upsert(request.userId!, {
      ...(birthDate !== undefined ? { birthDate } : {}),
      ...(parsed.data.heightCm !== undefined ? { heightCm: parsed.data.heightCm } : {}),
    });
    return reply.send({ saved: true });
  });

  app.post('/health-profile/weights', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = weightSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const entry = await healthProfileRepository.addWeight(request.userId!, parsed.data.weightKg);
    return reply.code(201).send({ id: entry.id });
  });

  app.delete<{ Params: { id: string } }>('/health-profile/weights/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const ok = await healthProfileRepository.removeWeight(request.userId!, request.params.id);
    if (!ok) return reply.code(404).send({ error: 'No such entry' });
    return reply.code(204).send();
  });

  app.put('/health-profile/units', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = z.object({ units: z.enum(['imperial', 'metric']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    await userPreferencesRepository.setPreferredUnits(request.userId!, parsed.data.units);
    return reply.send({ saved: true });
  });

  /** Removes all health-profile data without touching the account. */
  app.delete('/health-profile', { preHandler: app.authenticate }, async (request, reply) => {
    await healthProfileRepository.deleteAll(request.userId!);
    return reply.code(204).send();
  });
}
