import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  listLightsMock,
  listScenesMock,
  setHueLightByNameMock,
  activateHueSceneByNameMock,
  findByUserAndProviderMock,
  findLatestNormalizedMock,
  listRecentNormalizedMock,
  listRecentForUserMock,
  createCaffeineLogMock,
  addMemoryFactMock,
  createPendingCalendarWriteMock,
  getAppleCalendarSnapshotMock,
  getTimezoneMock,
} = vi.hoisted(() => ({
  listLightsMock: vi.fn(),
  listScenesMock: vi.fn(),
  setHueLightByNameMock: vi.fn(),
  activateHueSceneByNameMock: vi.fn(),
  findByUserAndProviderMock: vi.fn(),
  findLatestNormalizedMock: vi.fn(),
  listRecentNormalizedMock: vi.fn(async () => []),
  // Explicitly typed for the same reason as getAppleCalendarSnapshotMock
  // below: a bare `[]` return narrows the mock to `never[]`, and a test
  // resolving real caffeine logs stops compiling.
  listRecentForUserMock: vi.fn(async (): Promise<Array<{ mg: number; loggedAt: Date }>> => []),
  createCaffeineLogMock: vi.fn(),
  addMemoryFactMock: vi.fn(),
  createPendingCalendarWriteMock: vi.fn(),
  // Explicitly typed: otherwise the literal `null` return narrows the
  // mock's type to `null`-only, and a test resolving a real snapshot
  // stops compiling.
  getAppleCalendarSnapshotMock: vi.fn(
    async (): Promise<{ events: unknown[]; pushedAt: Date } | null> => null,
  ),
  getTimezoneMock: vi.fn(async () => 'UTC'),
}));

vi.mock('@moodsync/database', () => ({
  biometricReadingRepository: {
    findLatestNormalized: findLatestNormalizedMock,
    listRecentNormalized: listRecentNormalizedMock,
  },
  caffeineLogRepository: { listRecentForUser: listRecentForUserMock, create: createCaffeineLogMock },
  smartHomeConnectionRepository: { findByUserAndProvider: findByUserAndProviderMock },
  messagingMemoryRepository: { add: addMemoryFactMock },
  pendingCalendarWriteRepository: { create: createPendingCalendarWriteMock },
  appleCalendarSnapshotRepository: { getForUser: getAppleCalendarSnapshotMock },
  userTimezoneRepository: { getTimezone: getTimezoneMock },
}));

vi.mock('./hueActionExecutor.js', () => ({
  listHueLightsForUser: listLightsMock,
  listHueScenesForUser: listScenesMock,
  setHueLightByName: setHueLightByNameMock,
  activateHueSceneByName: activateHueSceneByNameMock,
}));

const { MESSAGING_TOOLS, executeConfirmedAction, selectMessagingTools, resolveMessagingCapabilities } = await import(
  './messagingTools.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  listRecentNormalizedMock.mockResolvedValue([]);
  listRecentForUserMock.mockResolvedValue([]);
});

describe('list_smart_home_devices', () => {
  it('reports no Hue connection distinctly from an empty light list', async () => {
    findByUserAndProviderMock.mockResolvedValueOnce(null);
    const result = await MESSAGING_TOOLS.list_smart_home_devices!.handler('u1', {});
    expect(result.data.hueConnected).toBe(false);
    expect(listLightsMock).not.toHaveBeenCalled();
  });

  it('lists real light and scene names when connected', async () => {
    findByUserAndProviderMock.mockResolvedValueOnce({ status: 'ACTIVE' });
    listLightsMock.mockResolvedValueOnce([{ id: 'l1', metadata: { name: 'Bedroom' }, on: { on: true }, dimming: { brightness: 80 } }]);
    listScenesMock.mockResolvedValueOnce([{ id: 's1', metadata: { name: 'Relax' } }]);

    const result = await MESSAGING_TOOLS.list_smart_home_devices!.handler('u1', {});

    expect(result.data).toMatchObject({
      hueConnected: true,
      lights: [{ name: 'Bedroom', on: true, brightness: 80 }],
      scenes: ['Relax'],
    });
  });
});

describe('control_hue_light — action tool', () => {
  it('never calls the Hue API itself — only validates and returns a confirmation prompt', async () => {
    listLightsMock.mockResolvedValueOnce([{ id: 'l1', metadata: { name: 'Bedroom' }, on: { on: true } }]);

    const result = await MESSAGING_TOOLS.control_hue_light!.handler('u1', { lightName: 'bedroom', on: false });

    expect(result.confirmPrompt).toContain('Bedroom');
    expect(result.confirmPrompt).toContain('Turn off');
    expect(setHueLightByNameMock).not.toHaveBeenCalled();
  });

  it('throws a message listing available lights when the name does not match', async () => {
    listLightsMock.mockResolvedValueOnce([{ id: 'l1', metadata: { name: 'Kitchen' }, on: { on: true } }]);

    await expect(MESSAGING_TOOLS.control_hue_light!.handler('u1', { lightName: 'Bedroom' })).rejects.toThrow('Kitchen');
  });
});

describe('activate_hue_scene — action tool', () => {
  it('resolves the scene by name and returns a confirmation prompt without activating it', async () => {
    listScenesMock.mockResolvedValueOnce([{ id: 's1', metadata: { name: 'Relax' } }]);

    const result = await MESSAGING_TOOLS.activate_hue_scene!.handler('u1', { sceneName: 'relax' });

    expect(result.confirmPrompt).toContain('Relax');
    expect(activateHueSceneByNameMock).not.toHaveBeenCalled();
  });
});

describe('executeConfirmedAction', () => {
  it('re-resolves control_hue_light by name at confirm time rather than trusting stored args blindly', async () => {
    await executeConfirmedAction('u1', 'control_hue_light', { lightName: 'Bedroom', on: false });
    expect(setHueLightByNameMock).toHaveBeenCalledWith('u1', 'Bedroom', { on: false });
  });

  it('activates the named scene', async () => {
    await executeConfirmedAction('u1', 'activate_hue_scene', { sceneName: 'Relax' });
    expect(activateHueSceneByNameMock).toHaveBeenCalledWith('u1', 'Relax');
  });

  it('rejects a tool name that is not a confirmable action', async () => {
    await expect(executeConfirmedAction('u1', 'get_wearable_snapshot', {})).rejects.toThrow('not a confirmable action tool');
  });
});

describe('get_wearable_snapshot', () => {
  it('states plainly when nothing has synced instead of fabricating a reading', async () => {
    findLatestNormalizedMock.mockResolvedValueOnce(null);
    const result = await MESSAGING_TOOLS.get_wearable_snapshot!.handler('u1', {});
    expect(result.data.hasData).toBe(false);
  });

  it('includes a real readiness figure so "how am I doing" never needs the retired deterministic path', async () => {
    findLatestNormalizedMock.mockResolvedValueOnce({
      id: 'r1',
      reading: { provider: 'WHOOP', timestamp: new Date().toISOString(), heartRate: 62 },
    });
    listRecentNormalizedMock.mockResolvedValueOnce([]);
    const result = await MESSAGING_TOOLS.get_wearable_snapshot!.handler('u1', {});
    expect(result.data.hasData).toBe(true);
    expect(typeof result.data.readiness).toBe('string');
  });
});

describe('log_caffeine_intake — write tool', () => {
  it('logs the preset mg for a known drink type without needing confirmation', async () => {
    findLatestNormalizedMock.mockResolvedValueOnce(null);
    const result = await MESSAGING_TOOLS.log_caffeine_intake!.handler('u1', { drinkType: 'espresso' });
    expect(createCaffeineLogMock).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', mg: 63 }));
    expect(result.confirmPrompt).toBeUndefined();
    expect(result.data).toMatchObject({ logged: true, mg: 63 });
  });

  it('prefers a stated custom amount over the preset', async () => {
    findLatestNormalizedMock.mockResolvedValueOnce(null);
    await MESSAGING_TOOLS.log_caffeine_intake!.handler('u1', { drinkType: 'coffee', customMg: 200 });
    expect(createCaffeineLogMock).toHaveBeenCalledWith(expect.objectContaining({ mg: 200 }));
  });

  it('rejects an unknown drink type with no custom amount rather than logging 0mg', async () => {
    await expect(MESSAGING_TOOLS.log_caffeine_intake!.handler('u1', {})).rejects.toThrow();
    expect(createCaffeineLogMock).not.toHaveBeenCalled();
  });

  it('returns a deterministic receipt naming the mg, not a model paraphrase', async () => {
    // The model previously narrated this and replied "Logged your
    // espresso." — dropping the estimate the user is held to.
    findLatestNormalizedMock.mockResolvedValueOnce(null);
    const result = await MESSAGING_TOOLS.log_caffeine_intake!.handler('u1', { drinkType: 'espresso' });
    expect(result.replyText).toContain('63mg');
  });

  it('names the resulting energy in the receipt when a wearable can supply one', async () => {
    findLatestNormalizedMock.mockResolvedValueOnce({
      reading: { timestamp: '2026-08-29T03:00:00Z', provider: 'apple_health', heartRate: 62, restingHeartRate: 55 },
    });
    listRecentNormalizedMock.mockResolvedValueOnce([]);
    listRecentForUserMock.mockResolvedValueOnce([{ mg: 63, loggedAt: new Date() }]);

    const result = await MESSAGING_TOOLS.log_caffeine_intake!.handler('u1', { drinkType: 'espresso' });
    expect(result.replyText).toContain('63mg');
    // Either a real energy figure or the honest "connect a wearable"
    // fallback — never a silent omission.
    expect(result.replyText).toMatch(/Energy now \d+\/100|Connect a wearable/);
  });
});

describe('remember_fact — write tool', () => {
  it('saves a short fact immediately, no confirmation', async () => {
    const result = await MESSAGING_TOOLS.remember_fact!.handler('u1', { fact: 'Trains best in the morning.' });
    expect(addMemoryFactMock).toHaveBeenCalledWith('u1', 'Trains best in the morning.');
    expect(result.confirmPrompt).toBeUndefined();
    expect(result.data).toEqual({ saved: true, fact: 'Trains best in the morning.' });
  });

  it('rejects an empty fact', async () => {
    await expect(MESSAGING_TOOLS.remember_fact!.handler('u1', { fact: '  ' })).rejects.toThrow();
    expect(addMemoryFactMock).not.toHaveBeenCalled();
  });

  it('rejects a fact that is too long to be a durable one-liner', async () => {
    await expect(MESSAGING_TOOLS.remember_fact!.handler('u1', { fact: 'x'.repeat(250) })).rejects.toThrow('too long');
  });
});

describe('get_nutrition_guidance', () => {
  it('always instructs the model not to invent calorie/macro numbers', async () => {
    findLatestNormalizedMock.mockResolvedValueOnce(null);
    listRecentForUserMock.mockResolvedValueOnce([]);
    const result = await MESSAGING_TOOLS.get_nutrition_guidance!.handler('u1', { question: 'what should I eat before a run?' });
    expect(result.data.instructionsForModel).toContain('Never invent a calorie count');
    expect(result.data.energy).toEqual({ hasData: false });
  });
});

describe('selectMessagingTools — the per-conversation tool surface', () => {
  it('withholds every Hue tool from an account with no bridge', () => {
    const tools = selectMessagingTools({ hueConnected: false, appleCalendarConnected: false });

    expect(tools.control_hue_light).toBeUndefined();
    expect(tools.activate_hue_scene).toBeUndefined();
    expect(tools.list_smart_home_devices).toBeUndefined();
  });

  it('grants them once a bridge is actually connected', () => {
    const tools = selectMessagingTools({ hueConnected: true, appleCalendarConnected: false });

    expect(tools.control_hue_light).toBeDefined();
    expect(tools.activate_hue_scene).toBeDefined();
    expect(tools.list_smart_home_devices).toBeDefined();
  });

  it('keeps the wearable snapshot regardless — "nothing has synced" is a real answer', () => {
    // Gating this would leave the model with no grounded way to find
    // out there is no data, which is exactly when it would guess.
    expect(selectMessagingTools({ hueConnected: false, appleCalendarConnected: false }).get_wearable_snapshot).toBeDefined();
  });

  it('keeps tools with no external dependency available to everyone', () => {
    const tools = selectMessagingTools({ hueConnected: false, appleCalendarConnected: false });

    expect(tools.log_caffeine_intake).toBeDefined();
    expect(tools.remember_fact).toBeDefined();
    expect(tools.get_nutrition_guidance).toBeDefined();
  });

  it('never invents a tool that is not in the full registry', () => {
    for (const name of Object.keys(selectMessagingTools({ hueConnected: true, appleCalendarConnected: false }))) {
      expect(MESSAGING_TOOLS[name]).toBeDefined();
    }
  });
});

describe('resolveMessagingCapabilities', () => {
  it('grants Hue only on an ACTIVE connection', async () => {
    findByUserAndProviderMock.mockResolvedValueOnce({ status: 'ACTIVE' });
    expect(await resolveMessagingCapabilities('u1')).toEqual({ hueConnected: true, appleCalendarConnected: false });
  });

  it('treats an expired connection as no capability', async () => {
    findByUserAndProviderMock.mockResolvedValueOnce({ status: 'EXPIRED' });
    expect(await resolveMessagingCapabilities('u1')).toEqual({ hueConnected: false, appleCalendarConnected: false });
  });

  it('fails closed to the smaller surface rather than granting on a lookup error', async () => {
    findByUserAndProviderMock.mockRejectedValueOnce(new Error('db down'));
    expect(await resolveMessagingCapabilities('u1')).toEqual({ hueConnected: false, appleCalendarConnected: false });
  });

  it('grants the calendar capability once a snapshot has ever been pushed', async () => {
    findByUserAndProviderMock.mockResolvedValueOnce(null);
    getAppleCalendarSnapshotMock.mockResolvedValueOnce({ events: [], pushedAt: new Date() });
    expect(await resolveMessagingCapabilities('u1')).toEqual({ hueConnected: false, appleCalendarConnected: true });
  });

  it('fails the calendar capability closed independently of a Hue failure', async () => {
    // Each capability must fail closed on its own — a Hue lookup error
    // must not also hide a calendar capability that resolved fine.
    findByUserAndProviderMock.mockRejectedValueOnce(new Error('hue db down'));
    getAppleCalendarSnapshotMock.mockResolvedValueOnce({ events: [], pushedAt: new Date() });
    expect(await resolveMessagingCapabilities('u1')).toEqual({ hueConnected: false, appleCalendarConnected: true });
  });
});

describe('selectMessagingTools — Apple Calendar gating', () => {
  it('withholds create_calendar_event with no snapshot ever pushed', () => {
    const tools = selectMessagingTools({ hueConnected: false, appleCalendarConnected: false });
    expect(tools.create_calendar_event).toBeUndefined();
  });

  it('grants it once a snapshot exists', () => {
    const tools = selectMessagingTools({ hueConnected: false, appleCalendarConnected: true });
    expect(tools.create_calendar_event).toBeDefined();
  });
});

describe('create_calendar_event — action tool', () => {
  it('never writes directly — only validates and returns a confirmation prompt', async () => {
    const result = await MESSAGING_TOOLS.create_calendar_event!.handler('u1', {
      title: 'Dentist',
      startsAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 25 * 60 * 60_000).toISOString(),
    });

    expect(result.confirmPrompt).toContain('Dentist');
    expect(result.confirmPrompt).toContain('next time your phone opens MoodSync');
    expect(createPendingCalendarWriteMock).not.toHaveBeenCalled();
  });

  it('rejects an end time before the start time', async () => {
    const start = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    await expect(
      MESSAGING_TOOLS.create_calendar_event!.handler('u1', { title: 'X', startsAt: start, endsAt: start }),
    ).rejects.toThrow('endsAt must be after startsAt');
  });

  it('rejects a start time too far in the future', async () => {
    const farOut = new Date(Date.now() + 200 * 24 * 60 * 60_000).toISOString();
    await expect(
      MESSAGING_TOOLS.create_calendar_event!.handler('u1', {
        title: 'X',
        startsAt: farOut,
        endsAt: new Date(new Date(farOut).getTime() + 60 * 60_000).toISOString(),
      }),
    ).rejects.toThrow('90 days');
  });

  it('rejects an event longer than the duration cap', async () => {
    const start = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const end = new Date(new Date(start).getTime() + 30 * 60 * 60_000).toISOString();
    await expect(
      MESSAGING_TOOLS.create_calendar_event!.handler('u1', { title: 'X', startsAt: start, endsAt: end }),
    ).rejects.toThrow('24 hours');
  });

  it('rejects a missing title', async () => {
    const start = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const end = new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
    await expect(
      MESSAGING_TOOLS.create_calendar_event!.handler('u1', { title: '', startsAt: start, endsAt: end }),
    ).rejects.toThrow('requires a title');
  });
});

describe('executeConfirmedAction — create_calendar_event', () => {
  it('queues the write rather than executing anything itself', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString();

    const result = await executeConfirmedAction('u1', 'create_calendar_event', { title: 'Dentist', startsAt, endsAt });

    expect(createPendingCalendarWriteMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', title: 'Dentist' }),
    );
    expect(result).toContain('next time your phone opens MoodSync');
  });
});
