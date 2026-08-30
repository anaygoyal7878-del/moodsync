import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClaraChat } from "./ClaraChat";

/**
 * Covers the two things in this component that would be quietly wrong
 * without a test: that Enter actually sends, and that a proposed
 * real-world action can't execute without an explicit confirmation.
 *
 * Enter is here specifically because it was the gap. The original
 * version relied on the browser's *implicit* form submission, which
 * jsdom doesn't implement and a synthetic keypress can't trigger — so
 * the most-used interaction in the component was unverifiable by
 * construction. The explicit `onKeyDown` handler is what makes this test
 * possible at all.
 */

function mockFetchOnce(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchOnce({ reply: "Recovery is 62.", pendingAction: null }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ClaraChat — sending", () => {
  it("sends on Enter", async () => {
    const user = userEvent.setup();
    render(<ClaraChat />);

    await user.type(screen.getByLabelText("Message Clara"), "how am I doing?{Enter}");

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/clara/chat", expect.objectContaining({ method: "POST" }));
    });
    expect(await screen.findByText("Recovery is 62.")).toBeDefined();
  });

  it("does not send on Shift+Enter — the reflex of someone reaching for a line break", async () => {
    // This one caught a real bug. The guard originally just `return`ed
    // on shiftKey without preventDefault, so the browser's implicit form
    // submission (which a single-line input does on Shift+Enter too)
    // sent the message anyway — a guard that silently did nothing.
    const user = userEvent.setup();
    render(<ClaraChat />);

    await user.type(screen.getByLabelText("Message Clara"), "half a thought{Shift>}{Enter}{/Shift}");

    expect(fetch).not.toHaveBeenCalled();
    // The draft survives, rather than being cleared by a send that
    // shouldn't have happened.
    expect(screen.getByLabelText("Message Clara")).toHaveProperty("value", "half a thought");
  });

  it("ignores Enter on an empty input rather than sending a blank turn", async () => {
    const user = userEvent.setup();
    render(<ClaraChat />);

    await user.type(screen.getByLabelText("Message Clara"), "{Enter}");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("replays the whole conversation, since the server keeps no history for this surface", async () => {
    const user = userEvent.setup();
    render(<ClaraChat />);
    const input = screen.getByLabelText("Message Clara");

    await user.type(input, "first{Enter}");
    await screen.findByText("Recovery is 62.");
    await user.type(input, "second{Enter}");

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const secondCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1]!;
    const sent = JSON.parse((secondCall[1] as RequestInit).body as string);
    // user → assistant → user: dropping the earlier turns would make
    // every follow-up question contextless.
    expect(sent.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});

describe("ClaraChat — action confirmation", () => {
  const proposal = {
    reply: 'Turn off "Bedroom"? Reply YES to confirm.',
    pendingAction: { toolName: "control_hue_light", args: { lightName: "Bedroom", on: false } },
  };

  it("shows a confirmation instead of acting, and only executes on Confirm", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => proposal })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Done — "Bedroom" updated.' }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ClaraChat />);
    await user.type(screen.getByLabelText("Message Clara"), "turn off the bedroom light{Enter}");

    // The proposal alone must not have executed anything: exactly one
    // call so far, and it's the chat call, not the confirm call.
    await screen.findByText(/Needs your OK/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/clara/actions/confirm");
    expect(await screen.findByText('Done — "Bedroom" updated.')).toBeDefined();
  });

  it("Cancel dismisses the proposal without executing it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => proposal });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ClaraChat />);
    await user.type(screen.getByLabelText("Message Clara"), "turn off the bedroom light{Enter}");
    await screen.findByText(/Needs your OK/i);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText(/Needs your OK/i)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a new message supersedes a pending proposal — answering something else is not consent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => proposal })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: "Recovery is 62.", pendingAction: null }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ClaraChat />);
    const input = screen.getByLabelText("Message Clara");
    await user.type(input, "turn off the bedroom light{Enter}");
    await screen.findByText(/Needs your OK/i);

    await user.type(input, "actually, how am I doing?{Enter}");

    await waitFor(() => expect(screen.queryByText(/Needs your OK/i)).toBeNull());
    // Still only the two chat calls — the light was never touched.
    expect(fetchMock.mock.calls.every((call) => call[0] === "/api/clara/chat")).toBe(true);
  });
});

describe("ClaraChat — failure", () => {
  it("surfaces a server error instead of hanging on the thinking state", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ error: "Clara couldn't respond right now." }, false));

    const user = userEvent.setup();
    render(<ClaraChat />);
    await user.type(screen.getByLabelText("Message Clara"), "hello{Enter}");

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Clara couldn't respond right now.");
  });
});
