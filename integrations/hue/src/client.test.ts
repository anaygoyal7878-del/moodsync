import { describe, expect, it } from 'vitest';
import { buildLightStatePayload } from './client.js';

describe('buildLightStatePayload', () => {
  it('builds an on/off payload', () => {
    expect(buildLightStatePayload({ on: true })).toEqual({ on: { on: true } });
  });

  it('builds a brightness payload', () => {
    expect(buildLightStatePayload({ brightness: 75 })).toEqual({ dimming: { brightness: 75 } });
  });

  it('builds a color (xy) payload', () => {
    expect(buildLightStatePayload({ colorXy: { x: 0.31, y: 0.32 } })).toEqual({
      color: { xy: { x: 0.31, y: 0.32 } },
    });
  });

  it('builds a color temperature payload', () => {
    expect(buildLightStatePayload({ colorTemperatureMirek: 366 })).toEqual({
      color_temperature: { mirek: 366 },
    });
  });

  it('combines multiple fields into one payload', () => {
    expect(buildLightStatePayload({ on: true, brightness: 50 })).toEqual({
      on: { on: true },
      dimming: { brightness: 50 },
    });
  });

  it('omits fields that were not provided', () => {
    expect(buildLightStatePayload({})).toEqual({});
  });
});
