"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Check, Loader2, X } from "lucide-react";
import { Section, EmptyState, toneColor } from "./CompanionPrimitives";

interface MessagingConnection {
  id: string;
  channel: "IMESSAGE" | "SMS" | "WHATSAPP";
  handle: string;
  verifiedAt: string | null;
  optedOutAt: string | null;
}

const CHANNEL_LABEL: Record<MessagingConnection["channel"], string> = {
  IMESSAGE: "iMessage",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
};

/**
 * Connect a phone number so MoodSync can answer questions over
 * messaging.
 *
 * The verification round trip is the security model, not a formality:
 * the code is shown here, inside an authenticated session, and has to
 * be texted back from the device that owns the number. Until that
 * happens the bot tells that number nothing about the account. See
 * docs/MESSAGING_BOT.md.
 */
export function MessagingConnectCard() {
  const [connections, setConnections] = useState<MessagingConnection[] | null>(null);
  const [handle, setHandle] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/messaging/connections", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ connections: MessagingConnection[] }>) : null))
      .then((data) => setConnections(data?.connections ?? []))
      .catch(() => setConnections([]));
  }

  useEffect(load, []);

  function connect() {
    setBusy(true);
    setError(null);
    fetch("/api/messaging/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "IMESSAGE", handle }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(payload?.error ?? "Couldn't add that number.");
          return;
        }
        const data = (await res.json()) as { code: string };
        setPendingCode(data.code);
        setHandle("");
        load();
      })
      .catch(() => setError("Couldn't reach MoodSync just now."))
      .finally(() => setBusy(false));
  }

  function remove(id: string) {
    fetch(`/api/messaging/connections/${id}`, { method: "DELETE" }).then(load).catch(() => {});
  }

  return (
    <Section
      title="Text MoodSync"
      subtitle="Ask about your data from your Messages app."
      icon={MessageCircle}
    >
      {pendingCode && (
        <div className="mb-4 rounded-[18px] p-4" style={{ background: "var(--surface-raised)" }}>
          <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
            Text this code to the MoodSync number to finish connecting:
          </p>
          <p className="font-display tabular mt-2 text-[28px] font-semibold tracking-[0.2em]" style={{ color: "var(--gold)" }}>
            {pendingCode}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--ink-muted)" }}>
            Expires in 15 minutes. Until you send it, that number can&apos;t see anything about your account.
          </p>
        </div>
      )}

      {connections === null ? (
        <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-muted)" }}>
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading…
        </div>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No number connected"
          body="Add your number, text back the code, and you can ask MoodSync anything from Messages — grounded in the same data the app uses."
        />
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {connections.map((connection) => {
            const verified = connection.verifiedAt !== null;
            const optedOut = connection.optedOutAt !== null;
            const color = optedOut ? toneColor("caution") : verified ? toneColor("positive") : toneColor("neutral");
            const label = optedOut ? "Unsubscribed" : verified ? "Verified" : "Awaiting code";

            return (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-3 rounded-[16px] p-3"
                style={{ background: "var(--surface-raised)" }}
              >
                <div className="min-w-0">
                  <p className="text-[13.5px]" style={{ color: "var(--ink)" }}>
                    {connection.handle}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11.5px]" style={{ color }}>
                    {verified && !optedOut && <Check size={11} aria-hidden="true" />}
                    {CHANNEL_LABEL[connection.channel]} · {label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(connection.id)}
                  aria-label={`Remove ${connection.handle}`}
                  className="shrink-0 rounded-full p-1.5"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="tel"
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="+1 555 123 4567"
          aria-label="Phone number"
          className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[13px] outline-none"
          style={{ background: "var(--surface-raised)", color: "var(--ink)", border: "1px solid var(--line)" }}
        />
        <button
          type="button"
          onClick={connect}
          disabled={busy || handle.trim().length < 3}
          className="rounded-full px-4 py-2.5 text-[13px] font-medium disabled:opacity-50"
          style={{ background: "var(--brand)", color: "#12180f" }}
        >
          {busy ? "Adding…" : "Add number"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: "var(--ink-muted)" }}>
        Apple doesn&apos;t publish an iMessage API, so this runs through a messaging bridge and needs one configured on
        the server. Text STOP any time to unsubscribe.
      </p>
    </Section>
  );
}
