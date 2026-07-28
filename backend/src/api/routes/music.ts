import type { FastifyInstance } from 'fastify';
import { biometricReadingRepository, userPreferencesRepository, userTimezoneRepository } from '@moodsync/database';
import { computeWellnessScores, recommendMusicCategory } from '@moodsync/ai';
import { getCurrentWeather } from '@moodsync/integration-weather';

/** Same zoned-hour computation as ai/src/ruleEngine.ts's
 * `zonedMinutesOfDay` — the user's stored IANA timezone, not the
 * server process's local time. */
function zonedHourOfDay(now: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now);
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
}

/** Music Intelligence's "Recommended for Right Now" — computes the
 * category server-side (real signals: wellness scores, time of day,
 * weather), leaves the actual playlist match against the user's
 * connected library (Spotify/Apple Music) to the client, since neither
 * provider's playlist listing goes through this backend today
 * (Apple Music is entirely MusicKit-JS/client-side). See
 * docs/MUSIC_INTELLIGENCE.md. */
export default async function musicIntelligenceRoutes(app: FastifyInstance) {
  app.get('/music/recommended-category', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [latest, timezone, weatherLocation] = await Promise.all([
      biometricReadingRepository.findLatestNormalized(userId),
      userTimezoneRepository.getTimezone(userId),
      userPreferencesRepository.getWeatherLocation(userId),
    ]);

    let stress: number | null = null;
    let recovery: number | null = null;
    if (latest) {
      const history = await biometricReadingRepository.listRecentNormalized(userId, 30);
      const scores = computeWellnessScores(latest.reading, history.filter((r) => r.timestamp !== latest.reading.timestamp));
      stress = scores.stress.value;
      recovery = scores.recovery.value;
    }

    let weatherCondition: Awaited<ReturnType<typeof getCurrentWeather>>['condition'] | undefined;
    if (weatherLocation) {
      try {
        const weather = await getCurrentWeather(weatherLocation.lat, weatherLocation.lng);
        weatherCondition = weather.condition;
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to fetch weather for music recommendation — proceeding without it');
      }
    }

    const hourOfDay = zonedHourOfDay(new Date(), timezone);
    const result = recommendMusicCategory({ stress, recovery, hourOfDay, weatherCondition });
    return reply.send(result);
  });
}
