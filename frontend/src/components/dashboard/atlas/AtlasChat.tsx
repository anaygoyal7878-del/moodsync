"use client";

import { useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Atlas's chat UI. Stateless on the backend (see backend/src/api/routes/atlas.ts's
 * doc comment) — this component owns the whole conversation in local
 * state and resends the full history each turn, so a page refresh
 * genuinely starts over rather than silently losing "saved" messages a
 * user might expect to persist. Errors are shown as a real assistant-style
 * bubble stating what happened (not configured / request failed) rather
 * than a generic toast, since this is the one place in the dashboard
 * where "the AI didn't answer" needs its own explanation. */
export function AtlasChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/atlas/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : "Atlas couldn't respond right now.";
        setMessages((prev) => [...prev, { role: "assistant", content: message }]);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "" }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Couldn't reach Atlas — check your connection and try again." }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    }
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
            it reads your real MoodSync data before answering.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
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
