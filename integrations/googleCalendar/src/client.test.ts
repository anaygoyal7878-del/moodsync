import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarClient } from './client.js';

describe('GoogleCalendarClient.listEvents', () => {
  it('normalizes a timed event using dateTime', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'evt1',
                summary: 'Team standup',
                start: { dateTime: '2026-07-28T15:00:00Z' },
                end: { dateTime: '2026-07-28T15:30:00Z' },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const client = new GoogleCalendarClient('token');
    const events = await client.listEvents(new Date('2026-07-28T00:00:00Z'), new Date('2026-07-29T00:00:00Z'));
    expect(events).toEqual([
      {
        id: 'evt1',
        title: 'Team standup',
        start: new Date('2026-07-28T15:00:00Z'),
        end: new Date('2026-07-28T15:30:00Z'),
        isAllDay: false,
      },
    ]);
    vi.unstubAllGlobals();
  });

  it('normalizes an all-day event using date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [{ id: 'evt2', summary: 'Company holiday', start: { date: '2026-07-28' }, end: { date: '2026-07-29' } }],
          }),
          { status: 200 },
        ),
      ),
    );
    const client = new GoogleCalendarClient('token');
    const [event] = await client.listEvents(new Date('2026-07-28T00:00:00Z'), new Date('2026-07-29T00:00:00Z'));
    expect(event?.isAllDay).toBe(true);
    expect(event?.title).toBe('Company holiday');
    vi.unstubAllGlobals();
  });

  it('falls back to a placeholder title when summary is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ items: [{ id: 'evt3', start: { dateTime: '2026-07-28T10:00:00Z' }, end: { dateTime: '2026-07-28T11:00:00Z' } }] }),
          { status: 200 },
        ),
      ),
    );
    const client = new GoogleCalendarClient('token');
    const [event] = await client.listEvents(new Date('2026-07-28T00:00:00Z'), new Date('2026-07-29T00:00:00Z'));
    expect(event?.title).toBe('(untitled event)');
    vi.unstubAllGlobals();
  });

  it('drops events with no parseable start or end instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              { id: 'evt4', summary: 'Broken event' },
              { id: 'evt5', summary: 'Valid event', start: { dateTime: '2026-07-28T10:00:00Z' }, end: { dateTime: '2026-07-28T11:00:00Z' } },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const client = new GoogleCalendarClient('token');
    const events = await client.listEvents(new Date('2026-07-28T00:00:00Z'), new Date('2026-07-29T00:00:00Z'));
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('evt5');
    vi.unstubAllGlobals();
  });

  it('throws GoogleCalendarApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );
    const client = new GoogleCalendarClient('bad-token');
    await expect(client.listEvents(new Date(), new Date())).rejects.toThrow('Google Calendar API request failed');
    vi.unstubAllGlobals();
  });
});
