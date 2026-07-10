-- Arbitrary provider-specific device metadata that doesn't fit the fixed
-- `capabilities` shape — e.g. Govee's per-device raw capability descriptors
-- (needed to control mist/intensity without hardcoding an unverified
-- capability instance name) or a SwitchBot device's specific `deviceType`.
alter table public.devices
  add column provider_metadata jsonb not null default '{}'::jsonb;
