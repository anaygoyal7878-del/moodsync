import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userPreferencesRepository } from '@moodsync/database';
import { geocodeLocation, getCurrentWeather } from '@moodsync/integration-weather';

/** No account-linking here — Open-Meteo needs no OAuth (see
 * docs/WEATHER_INTEGRATION.md), so this is just a location preference
 * (geocoded once, stored) plus an on-demand current-weather fetch. */
export default async function weatherRoutes(app: FastifyInstance) {
  app.get('/weather/location', { preHandler: app.authenticate }, async (request, reply) => {
    const location = await userPreferencesRepository.getWeatherLocation(request.userId!);
    return reply.send({ location });
  });

  app.post('/weather/location', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = z.object({ query: z.string().min(1).max(200) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const resolved = await geocodeLocation(parsed.data.query);
    if (!resolved) return reply.code(404).send({ error: `No location found matching "${parsed.data.query}"` });

    const location = { name: resolved.name, lat: resolved.latitude, lng: resolved.longitude };
    await userPreferencesRepository.setWeatherLocation(request.userId!, location);
    return reply.send({ location });
  });

  app.get('/weather/current', { preHandler: app.authenticate }, async (request, reply) => {
    const location = await userPreferencesRepository.getWeatherLocation(request.userId!);
    if (!location) return reply.code(404).send({ error: 'No weather location set for this user' });

    try {
      const weather = await getCurrentWeather(location.lat, location.lng);
      return reply.send({ location: location.name, weather });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to fetch current weather');
      return reply.code(502).send({ error: 'Could not reach the weather service' });
    }
  });
}
