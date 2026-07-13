import { createWidget, widget, prop, align } from '@zos/ui';
import { HeartRate, Sleep, Step, Time } from '@zos/sensor';
import { px } from '@zos/utils';
import { getDeviceInfo } from '@zos/device';
import { showToast } from '@zos/interaction';

import { BasePage } from '@zeppos/zml/base/base-page';
import { pagePlugin } from '@zeppos/zml/2.0/module/messaging/plugin/page';

BasePage.use(pagePlugin);

const { width: DEVICE_WIDTH } = getDeviceInfo();

/**
 * Reads current sensor values into a plain, JSON-serializable snapshot.
 * Every field is independently optional — a device that doesn't support a
 * given sensor, or a sensor with no reading yet, simply omits that field
 * rather than failing the whole sync (mirrors the ingest endpoint's
 * all-optional schema, see backend/src/api/routes/integrations/amazfit.ts).
 */
function readSensorSnapshot(heartRateSensor, sleepSensor, stepSensor, timeSensor) {
  const snapshot = { timestamp: new Date(timeSensor.getTime()).toISOString() };

  const hr = heartRateSensor.getLast();
  if (typeof hr === 'number' && hr > 0) snapshot.heartRate = hr;

  const sleepInfo = sleepSensor.getInfo();
  if (sleepInfo?.score !== undefined) snapshot.sleepScore = sleepInfo.score;

  const steps = stepSensor.getCurrent();
  if (typeof steps === 'number') snapshot.steps = steps;

  return snapshot;
}

Page(
  BasePage({
    state: {
      textWidget: null,
      syncButton: null,
      heartRateSensor: null,
      sleepSensor: null,
      stepSensor: null,
      timeSensor: null,
      lastSnapshot: null,
    },
    build() {
      this.state.heartRateSensor = new HeartRate();
      this.state.sleepSensor = new Sleep();
      this.state.stepSensor = new Step();
      this.state.timeSensor = new Time();

      this.state.textWidget = createWidget(widget.TEXT, {
        x: (DEVICE_WIDTH - px(400)) / 2,
        y: px(60),
        w: px(400),
        h: px(200),
        text_size: px(24),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: 'Tap Sync to send data\nto MoodSync',
        color: 0xffffff,
      });

      this.state.syncButton = createWidget(widget.BUTTON, {
        x: (DEVICE_WIDTH - px(300)) / 2,
        y: px(300),
        w: px(300),
        h: px(80),
        text_size: px(32),
        radius: px(12),
        normal_color: 0x336699,
        press_color: 0x224466,
        text: 'Sync',
        click_func: () => this.syncToMoodSync(),
      });
    },
    syncToMoodSync() {
      const snapshot = readSensorSnapshot(
        this.state.heartRateSensor,
        this.state.sleepSensor,
        this.state.stepSensor,
        this.state.timeSensor
      );
      this.state.lastSnapshot = snapshot;

      const lines = Object.entries(snapshot).map(([key, val]) => `${key}: ${val}`);
      this.state.textWidget.setProperty(prop.TEXT, lines.join('\n'));

      this.request({ type: 'SYNC', params: snapshot })
        .then((data) => {
          showToast({ content: data?.message ?? 'Synced' });
        })
        .catch(() => {
          showToast({ content: 'Sync failed — check MoodSync login in settings' });
        });
    },
    /** Handles requests pushed from the Side Service (e.g. the Settings App asking for fresh data). */
    onCall(data) {
      this.responseCall(data);
    },
    responseCall(data) {
      const { type = '' } = data;
      if (type === 'SETTINGS_APP_REQUEST_SYNC') {
        this.syncToMoodSync();
      }
    },
  })
);
