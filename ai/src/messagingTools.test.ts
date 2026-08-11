import { describe, expect, it, vi } from 'vitest';

const { listLightsMock, listScenesMock, setHueLightByNameMock, activateHueSceneByNameMock, findByUserAndProviderMock, findLatestNormalizedMock, listRecentNormalizedMock, listRecentForUserMock } =
  vi.hoisted(() => ({
    listLightsMock: vi.fn(),
    listScenesMock: vi.fn(),
    setHueLightByNameMock: vi.fn(),
    activateHueSceneByNameMock: vi.fn(),
    findByUserAndProviderMock: vi.fn(),
    findLatestNormalizedMock: vi.fn(),
    listRecentNormalizedMock: vi.fn(async () => []),
    listRecentForUserMock: vi.fn(async () => []),
  }));

vi.mock('@moodsync/database', () => ({
  biometricReadingRepository: {
    findLatestNormalized: findLatestNormalizedMock,
    listRecentNormalized: listRecentNormalizedMock,
  },
  caffeineLogRepository: { listRecentForUser: listRecentForUserMock },
  smartHomeConnectionRepository: { findByUserAndProvider: findByUserAndProviderMock },
}));

vi.mock('./hueActionExecutor.js', () => ({
  listHueLightsForUser: listLightsMock,
  listHueScenesForUser: listScenesMock,
  setHueLightByName: setHueLightByNameMock,
  activateHueSceneByName: activateHueSceneByNameMock,
}));

const { MESSAGING_TOOLS, executeConfirmedAction } = await import('./messagingTools.js');

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
