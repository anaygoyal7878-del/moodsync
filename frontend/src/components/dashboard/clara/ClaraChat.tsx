"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, ShieldQuestion } from "lucide-react";

/**
 * Clara, in the app.
 *
 * Talks to `/api/clara/chat` — the same agentic engine the messaging
 * channel runs on (`ai/src/agenticMessaging.ts`), reached over HTTP
 * instead of a phone number. Those two backend endpoints were kept
 * deliberately when the old web chat was removed, precisely so a surface
 * like this could come back without re-plumbing anything; see
 * `backend/src/api/routes/clara.ts`.
 *
 * The architectural difference from the phone channel, and the reason
 * this component holds state the phone one doesn't: this path is
 * **stateless server-side**. There's no `MessagingConnection` row and no
 * `MessagingPendingAction` to park a proposed action between turns, so
 * the browser is what replays conversation history and what holds a
 * pending action until the user answers. Refreshing genuinely starts
 * over — a real, disclosed limit rather than a bug.
 *
 * The confirmation flow is the part that must not be softened. When
 * Clara proposes something with real-world effect (turning a light off,
 * creating a calendar event) the server returns `pendingAction` and
 * executes *nothing*. This renders it as an explicit Confirm/Cancel, and
 * confirming posts the exact tool name and args back — which the server
 * re-validates from scratch, because a light can be renamed or
 * disconnected between the proposal and the tap.
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  toolName: string;
  args: Record<string, unknown>;
}

/** Turns a tool name into something a person can read, for the
 * confirmation chip. Falls back to the raw name rather than inventing a
 * friendly label for a tool this list doesn't know — a wrong label on a
 * confirm button is worse than an ugly one. */
const TOOL_LABELS: Record<string, string> = {
  control_hue_light: "Change a light",
  activate_hue_scene: "Activate a scene",
  create_calendar_event: "Create a calendar event",
};

const SUGGESTIONS = [
  "How am I doing?",
  "Why am I tired?",
  "Should I train today?",
];

export function ClaraChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      // A new message supersedes any outstanding proposal: answering
      // something else is not consent to the thing that was asked.
      setPending(null);
      setError(null);
      const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(nextMessages);
      setInput("");
      setBusy(true);

      try {
        const response = await fetch("/api/clara/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        const data = (await response.json().catch(() => null)) as
          | { reply?: string; pendingAction?: PendingAction | null; error?: string }
          | null;

        if (!response.ok) {
          setError(data?.error ?? "Clara couldn't respond right now.");
          return;
        }
        if (data?.reply) setMessages((prev) => [...prev, { role: "assistant", content: data.reply! }]);
        if (data?.pendingAction) setPending(data.pendingAction);
      } catch {
        setError("Couldn't reach Clara just now.");
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  const confirmAction = useCallback(async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/clara/actions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      if (!response.ok) {
        setError(data?.error ?? "That didn't go through.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data?.reply ?? "Done." }]);
      setPending(null);
    } catch {
      setError("Couldn't reach Clara just now.");
    } finally {
      setBusy(false);
    }
  }, [pending, busy]);

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        className="flex max-h-[52vh] min-h-[180px] flex-col gap-3 overflow-y-auto rounded-[20px] p-4"
        style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
      >
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
              Ask about your own data — Clara answers from your real readings, and says so when something hasn&apos;t
              synced.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full px-3 py-1.5 text-[12.5px]"
                  style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className="max-w-[85%] rounded-[16px] px-3.5 py-2.5 text-[13.5px] leading-snug"
              style={
                message.role === "user"
                  ? { alignSelf: "flex-end", background: "var(--lux-sage)", color: "#16211a" }
                  : { alignSelf: "flex-start", background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }
              }
            >
              {message.content}
            </div>
          ))
        )}

        {busy && (
          <div className="flex items-center gap-2 self-start text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Thinking…
          </div>
        )}
      </div>

      {/* Nothing has happened yet at this point — the server proposed and
          deliberately did not act. */}
      {pending && (
        <div
          className="flex flex-col gap-2.5 rounded-[16px] p-3.5"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline-gold)" }}
        >
          <div className="flex items-center gap-2">
            <ShieldQuestion size={14} style={{ color: "var(--lux-gold)" }} aria-hidden="true" />
            <span className="text-[12px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--lux-gold)" }}>
              Needs your OK · {TOOL_LABELS[pending.toolName] ?? pending.toolName}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void confirmAction()}
              disabled={busy}
              className="rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50"
              style={{ background: "var(--lux-sage)", color: "#16211a" }}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-full px-4 py-2 text-[13px] font-medium"
              style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[12.5px]" style={{ color: "var(--lux-rose)" }}>
          {error}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          // Enter sends, explicitly, rather than leaning on the browser's
          // implicit form submission. Two reasons, both real: implicit
          // submission is a browser behavior that can't be exercised in
          // jsdom or driven by a synthetic keypress, so relying on it
          // left the single most-used interaction in this component
          // permanently unverifiable — and it quietly stops working the
          // day this becomes a <textarea> for multi-line input, which a
          // chat box tends to.
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // `isComposing` guards IME input: mid-composition Enter
            // commits a candidate character (Japanese, Chinese, Korean),
            // and sending there would cut the word off mid-typing.
            if (event.nativeEvent.isComposing) return;
            // preventDefault runs for Shift+Enter too, not just plain
            // Enter. A single-line input can't hold a newline, so the
            // browser's own behavior here is to submit — meaning without
            // this, the Shift branch below would `return` and the form
            // would send anyway, which is exactly the accidental send
            // someone reaching for a line break did not want. (Found by
            // a test that asserted the guard worked; it didn't.)
            event.preventDefault();
            if (event.shiftKey) return;
            void send(input);
          }}
          placeholder="Ask Clara…"
          aria-label="Message Clara"
          className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[13.5px] outline-none"
          style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: "var(--lux-sage)", color: "#16211a" }}
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </form>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
        This conversation isn&apos;t saved — refreshing starts over. Clara can also text you; add a number under
        Connections.
      </p>
    </div>
  );
}
