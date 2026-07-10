# Diffuser provider coverage

Every brand here was checked against real, current documentation/source
before being wired in — nothing here is a guessed or invented endpoint.

## Direct integration (real public API, own provider + Edge Function client)

| Brand | API | Notes |
|---|---|---|
| **Moodo** | `rest.moodo.co` REST API | Verified against Moodo's own Homebridge plugin source. `token` header auth, `/boxes`, `/intensity/{device_key}`. |
| **Govee** | `openapi.api.govee.com` | Official developer API. Device types include `devices.types.aroma_diffuser` / `devices.types.humidifier`. Intensity control reads each device's own advertised capability rather than guessing an instance name Govee doesn't publicly enumerate. |
| **SwitchBot** | `api.switch-bot.com` v1.1 | Official, documented, HMAC-signed API. No dedicated diffuser type — covers SwitchBot's Humidifier-class devices and Plug/Plug Mini as a generic power fallback. |

## Routed through the user's own Home Assistant instance (`HomeAssistantProvider`)

These have no verified direct cloud API of their own that we're willing to embed account credentials for, but they have a real, working path through Home Assistant, which the automation rules explicitly call for:

| Brand | Path |
|---|---|
| **Pura** | Community `ha-pura` HACS integration (github.com/natekspencer/ha-pura). Pura's own API is a private, undocumented Firebase-authenticated API with no public docs — we don't talk to it directly. |
| **Rituals Perfume Genie** | Home Assistant's own **official core integration** (`rituals_perfume_genie`). |
| **Meross** Smart Wi-Fi Essential Oil Diffuser | Meross's cloud API (`iotx-*.meross.com`) is real but explicitly unofficial/reverse-engineered (the `meross_iot` library's own docs say Meross doesn't support or document it). Routed through HA's `meross_lan` custom integration instead of embedding that auth flow in our backend. |
| **TP-Link Kasa** smart plugs (generic power fallback) | `python-kasa`'s local KLAP protocol is unofficial/community-reverse-engineered. Routed through HA's official `tplink` core integration rather than reimplementing local crypto handshakes from scratch. |
| **VOCOlinc FlowerBud / Meross diffuser** as native HomeKit accessories | Can also be controlled directly on-device via `HomeKitProvider` if the user has them in Apple Home, bypassing Home Assistant entirely. |

## No viable integration path (explicitly unsupported, not silently ignored)

| Brand | Why |
|---|---|
| **Aera** | No public API, no developer portal, not on Apple's official "Works with Apple Home" accessory list — the "works with HomeKit" claims found only trace to third-party marketing/review sites, not Apple's own accessory database. |
| **Vitruvi** | No documented API, no Home Assistant integration, no reverse-engineering project found. Companion app's protocol (BLE vs. cloud) couldn't be confirmed from primary sources — flagged as unresolved, not assumed. |
| **Aroma360 / ScentAir** | Commercial HVAC-scenting systems with standalone programmable controllers; no API, HA, HomeKit, Matter, or IFTTT integration exists. |
| **Matter** | No fragrance/diffuser device type exists in the Matter spec at all as of this writing. |

If a user has a Vitruvi/Aera/Aroma360 device, the only thing MoodSync can legitimately offer is the generic HomeKit/HA smart-plug power fallback (on/off only, no scent/intensity control) — never a fake "supported" integration.
