-- Adds two more directly-integrable diffuser providers, both backed by
-- real, currently-documented public APIs:
--   * Govee  (developer.govee.com) — device types include
--     `devices.types.aroma_diffuser` and `devices.types.humidifier`.
--   * SwitchBot (github.com/OpenWonderLabs/SwitchBotAPI) — humidifier-class
--     devices plus Plug/Plug Mini as a generic power fallback.
alter type public.diffuser_provider_kind add value if not exists 'govee';
alter type public.diffuser_provider_kind add value if not exists 'switchbot';
