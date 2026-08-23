"use client";

import { useRef, useState, type FormEvent } from "react";
import { Send, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface PendingAction {
  toolName: string;
  args: Record<string, unknown>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Present only on an assistant message that proposed a real action
   * (e.g. control a Hue light, create a calendar event). `undefined`
   * once the user has confirmed or cancelled it, so the buttons render
   * exactly once per proposal. */
  pendingAction?: PendingAction;
}

/** Atlas's chat UI — the in-app conversational interface to the same
 * intelligence engine the iMessage bot runs on (see
 * backend/src/api/routes/atlas.ts's top comment). Stateless on the
 * backend, so this component owns the whole conversation in local
 * state and resends the full history each turn — a page refresh
 * genuinely starts over rather than silently losing "saved" messages a
 * user might expect to persist.
 *
 * When Atlas proposes a real action, the reply comes back as a
 * confirmation sentence *plus* structured `pendingAction` data — the
 * exact tool name and args, not just text. Confirming re-sends that
 * data to `/api/atlas/actions/confirm`, which re-validates it from
 * scratch server-side rather than trusting what the browser held.
 * Cancelling needs no round trip at all — there's nothing server-side
 * to clean up, since (unlike the phone channel) no server-side
 * `MessagingPendingAction` row was ever created for it.
 */
export function AtlasChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [actingOn, setActingOn] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/atlas/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : "Atlas couldn't respond right now.";
        setMessages((prev) => [...prev, { role: "assistant", content: message }]);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "", pendingAction: data.pendingAction ?? undefined },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Couldn't reach Atlas — check your connection and try again." }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  async function confirmAction(index: number) {
    const action = messages[index]?.pendingAction;
    if (!action) return;
    setActingOn(index);
    try {
      const response = await fetch("/api/atlas/actions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const data = await response.json().catch(() => ({}));
      const resultText = response.ok
        ? (data.reply ?? "Done.")
        : (typeof data.error === "string" ? data.error : "That didn't work — try again.");
      setMessages((prev) => [
        ...prev.map((m, i) => (i === index ? { ...m, pendingAction: undefined } : m)),
        { role: "assistant", content: resultText },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev.map((m, i) => (i === index ? { ...m, pendingAction: undefined } : m)),
        { role: "assistant", content: "Couldn't reach Atlas — check your connection and try again." },
      ]);
    } finally {
      setActingOn(null);
      scrollToBottom();
    }
  }

  function cancelAction(index: number) {
    setMessages((prev) => [
      ...prev.map((m, i) => (i === index ? { ...m, pendingAction: undefined } : m)),
      { role: "assistant", content: "Okay, cancelled." },
    ]);
    scrollToBottom();
  }

  return (
    <div className="relative flex h-[calc(100vh-8rem)] max-h-[900px] flex-col sm:h-[calc(100vh-6rem)]">
      <div className="mb-4 text-center">
        <h1 className="font-luxury-display text-[22px] font-semibold" style={{ color: "var(--lux-ink, var(--ink))" }}>
          Atlas
        </h1>
        <p className="text-[13px]" style={{ color: "var(--lux-muted, var(--ink-muted))" }}>
          Your AI wellness assistant
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-1 pb-3">
        {messages.length === 0 && (
          <div
            className="mx-auto max-w-sm rounded-2xl border px-4 py-3 text-center text-[13px]"
            style={{ borderColor: "var(--lux-hairline, var(--line))", color: "var(--lux-muted, var(--ink-muted))" }}
          >
            Ask Atlas about your recovery, a workout that fits how you slept, or what to do about elevated stress —
            it reads your real MoodSync data before answering, and can act on what it finds when you say go.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[80%]">
              <div
                className="rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
                style={
                  m.role === "user"
                    ? { background: "var(--lux-sage, var(--brand))", color: "#1a241e" }
                    : {
                        background: "var(--lux-bg-card, var(--surface))",
                        border: "1px solid var(--lux-hairline, var(--line))",
                        color: "var(--lux-ink, var(--ink))",
                      }
                }
              >
                {m.content}
              </div>
              {m.pendingAction && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirmAction(i)}
                    disabled={actingOn === i}
                    className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50"
                    style={{ background: "var(--lux-sage, var(--brand))", color: "#1a241e" }}
                  >
                    <Check size={14} aria-hidden="true" />
                    {actingOn === i ? "Working…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelAction(i)}
                    disabled={actingOn === i}
                    className="flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] disabled:opacity-50"
                    style={{ borderColor: "var(--lux-hairline, var(--line))", color: "var(--lux-muted, var(--ink-muted))" }}
                  >
                    <X size={14} aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl px-4 py-2.5 text-[13px]"
              style={{
                background: "var(--lux-bg-card, var(--surface))",
                border: "1px solid var(--lux-hairline, var(--line))",
                color: "var(--lux-muted, var(--ink-muted))",
              }}
            >
              Atlas is thinking…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Atlas anything about your wellness…"
          disabled={sending}
          className="flex-1 rounded-full border px-4 py-3 text-[14px] focus:outline-none disabled:opacity-60"
          style={{
            background: "var(--lux-bg-card, var(--surface))",
            borderColor: "var(--lux-hairline, var(--line))",
            color: "var(--lux-ink, var(--ink))",
          }}
        />
        <Button type="submit" variant="primary" disabled={sending || !input.trim()} className="!px-4">
          <Send size={16} aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
