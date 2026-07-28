/**
 * Google Calendar API v3 client — read-only, `events.list` only. Field
 * shapes confirmed live against developers.google.com/calendar/api/v3/reference/events/list
 * this session: `summary` (title), `start`/`end` (each carrying either
 * `dateTime` for a timed event or `date` for an all-day event — the
 * standard, long-documented Google Calendar event shape, not a guess).
 */

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

export class GoogleCalendarApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface GoogleCalendarEventTime {
  dateTime?: string;
  date?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start?: GoogleCalendarEventTime;
  end?: GoogleCalendarEventTime;
}

export interface NormalizedCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
}

function parseEventTime(time: GoogleCalendarEventTime | undefined): { date: Date; isAllDay: boolean } | null {
  if (time?.dateTime) return { date: new Date(time.dateTime), isAllDay: false };
  if (time?.date) return { date: new Date(`${time.date}T00:00:00Z`), isAllDay: true };
  return null;
}

/** Drops events missing a parseable start/end rather than throwing — a
 * malformed single event shouldn't take down the whole calendar read. */
function normalizeEvent(event: GoogleCalendarEvent): NormalizedCalendarEvent | null {
  const start = parseEventTime(event.start);
  const end = parseEventTime(event.end);
  if (!start || !end) return null;
  return { id: event.id, title: event.summary ?? '(untitled event)', start: start.date, end: end.date, isAllDay: start.isAllDay || end.isAllDay };
}

export class GoogleCalendarClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GoogleCalendarApiError(`Google Calendar API request failed: ${path} -> ${res.status} ${body}`, res.status);
    }
    return res.json() as Promise<T>;
  }

  /** `timeMin`/`timeMax` bound the window, `singleEvents=true` expands
   * recurring events into real instances (so a daily-recurring meeting
   * shows up once per actual occurrence, not as one unexpandable
   * recurrence rule), `orderBy=startTime` requires `singleEvents=true`
   * per Google's own docs — confirmed live this session. */
  async listEvents(timeMin: Date, timeMax: Date): Promise<NormalizedCalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    const { items } = await this.request<{ items?: GoogleCalendarEvent[] }>(`/calendars/primary/events?${params}`);
    return (items ?? []).map(normalizeEvent).filter((e): e is NormalizedCalendarEvent => e !== null);
  }
}
