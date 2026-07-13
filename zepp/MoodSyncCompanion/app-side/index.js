import { BaseSideService } from '@zeppos/zml/base/base-side';
import { messagingPlugin } from '@zeppos/zml/2.0/module/messaging/plugin/side';

BaseSideService.use(messagingPlugin);

/**
 * Set this to your MoodSync backend's public origin before running
 * `zeus preview` — e.g. an ngrok tunnel during development, or your
 * deployed backend URL in production. There is no build-time env
 * injection confirmed for Zepp OS Side Services, so this is a plain
 * constant edited per-environment (same limitation noted for the ngrok
 * tunnel setup used for the Alexa skill).
 */
const MOODSYNC_API_BASE = 'https://your-moodsync-backend.example.com/api';

AppSideService(
  BaseSideService({
    async onRequest(req, res) {
      const { type, params } = req;

      if (type === 'SYNC') {
        const result = await this.syncReading(params);
        res(null, result);
      }
    },
    onInit() {
      settings.settingsStorage.addListener('change', async ({ key }) => {
        if (key === 'LOGIN_ACTION') {
          await this.login();
        } else if (key === 'REQUEST_SYNC_ACTION') {
          this.call({ type: 'SETTINGS_APP_REQUEST_SYNC' });
        }
      });
    },
    /**
     * Logs into the user's existing MoodSync account — the same
     * POST /api/auth/login the web app and iOS companion use, not a
     * separate device-pairing OAuth flow (see
     * docs/AMAZFIT_ARCHITECTURE.md §3).
     */
    async login() {
      const email = settings.settingsStorage.getItem('email');
      const password = settings.settingsStorage.getItem('password');

      try {
        const res = await fetch({
          url: `${MOODSYNC_API_BASE}/auth/login`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (res.status !== 200) {
          settings.settingsStorage.setItem('loginError', `Login failed (${res.status})`);
          return;
        }

        const body = JSON.parse(res.body);
        settings.settingsStorage.setItem('accessToken', body.accessToken);
        settings.settingsStorage.setItem('refreshToken', body.refreshToken);
        settings.settingsStorage.setItem('loginError', '');
        settings.settingsStorage.setItem('loggedIn', true);
      } catch (error) {
        settings.settingsStorage.setItem('loginError', `Login failed: ${error?.message ?? error}`);
      }
    },
    /**
     * Posts one sensor snapshot to the ingest endpoint. The access token
     * is attached the same way every other MoodSync client attaches it —
     * `Authorization: Bearer <token>` — never trusted from the request
     * body server-side (see backend/src/api/routes/integrations/amazfit.ts).
     */
    async syncReading(snapshot) {
      const accessToken = settings.settingsStorage.getItem('accessToken');
      if (!accessToken) {
        return { code: 1, message: 'Not logged in — open MoodSync settings to log in' };
      }

      try {
        const res = await fetch({
          url: `${MOODSYNC_API_BASE}/integrations/amazfit/ingest`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ readings: [snapshot] }),
        });

        if (res.status === 401) {
          return { code: 1, message: 'Session expired — log in again in MoodSync settings' };
        }
        if (res.status !== 200) {
          return { code: 1, message: `Sync failed (${res.status})` };
        }

        settings.settingsStorage.setItem('lastSyncedAt', new Date().toISOString());
        return { code: 0, message: 'Synced' };
      } catch (error) {
        return { code: 1, message: `Sync failed: ${error?.message ?? error}` };
      }
    },
  })
);
