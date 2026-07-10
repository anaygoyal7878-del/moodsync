import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { decryptCredentials } from "./credentialCrypto.ts";

export interface MoodoCredentials {
  token: string;
  apiBaseUrl?: string;
}

export interface HomeAssistantCredentials {
  baseUrl: string;
  longLivedToken: string;
}

export interface GoveeCredentials {
  apiKey: string;
}

export interface SwitchBotCredentials {
  token: string;
  secret: string;
}

export async function loadMoodoCredentials(
  admin: SupabaseClient,
  userId: string,
): Promise<MoodoCredentials> {
  const payload = await loadDecryptedCredentials(admin, userId, "moodo");
  if (typeof payload.token !== "string") {
    throw new Error("Stored Moodo credentials are missing a token");
  }
  return {
    token: payload.token,
    apiBaseUrl: typeof payload.apiBaseUrl === "string" ? payload.apiBaseUrl : undefined,
  };
}

export async function loadHomeAssistantCredentials(
  admin: SupabaseClient,
  userId: string,
): Promise<HomeAssistantCredentials> {
  const payload = await loadDecryptedCredentials(admin, userId, "home_assistant");
  if (typeof payload.baseUrl !== "string" || typeof payload.longLivedToken !== "string") {
    throw new Error("Stored Home Assistant credentials are incomplete");
  }
  return { baseUrl: payload.baseUrl, longLivedToken: payload.longLivedToken };
}

export async function loadGoveeCredentials(
  admin: SupabaseClient,
  userId: string,
): Promise<GoveeCredentials> {
  const payload = await loadDecryptedCredentials(admin, userId, "govee");
  if (typeof payload.apiKey !== "string") {
    throw new Error("Stored Govee credentials are missing an apiKey");
  }
  return { apiKey: payload.apiKey };
}

export async function loadSwitchBotCredentials(
  admin: SupabaseClient,
  userId: string,
): Promise<SwitchBotCredentials> {
  const payload = await loadDecryptedCredentials(admin, userId, "switchbot");
  if (typeof payload.token !== "string" || typeof payload.secret !== "string") {
    throw new Error("Stored SwitchBot credentials are incomplete");
  }
  return { token: payload.token, secret: payload.secret };
}

async function loadDecryptedCredentials(
  admin: SupabaseClient,
  userId: string,
  provider: "moodo" | "pura" | "home_assistant" | "homekit" | "govee" | "switchbot",
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("device_provider_credentials")
    .select("encrypted_payload, encryption_nonce")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (error || !data) {
    throw new Error(`No stored credentials for provider "${provider}"`);
  }

  const ciphertext = new Uint8Array(data.encrypted_payload as ArrayBuffer);
  const nonce = new Uint8Array(data.encryption_nonce as ArrayBuffer);
  return await decryptCredentials(ciphertext, nonce);
}
