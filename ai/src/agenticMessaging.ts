import { GoogleGenAI, createPartFromFunctionResponse, type Content } from '@google/genai';
import { messagingMemoryRepository } from '@moodsync/database';
import { ClaraNotConfiguredError, buildClaraSystemPrompt, type ClaraChatMessage } from './claraChat.js';
import {
  MESSAGING_ACTION_TOOL_NAMES,
  selectMessagingTools,
  resolveMessagingCapabilities,
  type MessagingTool,
} from './messagingTools.js';
import { compileConversationProfile, renderProfileBlock, type InboundRecord } from './messagingProfile.js';
import { withGeminiRetry } from './geminiRetry.js';

/** Same alias rationale as claraChat.ts — see that file's comment. */
const MODEL = 'gemini-flash-latest';

/** Hard ceiling on tool-call round trips in one turn. A well-behaved
 * conversation needs at most 2-3 (e.g. list devices, then propose an
 * action); this exists purely to guarantee the loop terminates if the
 * model gets stuck re-calling a tool, not because that's expected. */
const MAX_TOOL_ROUNDS = 4;

export interface AgenticReplyAction {
  toolName: string;
  args: Record<string, unknown>;
  confirmPrompt: string;
}

export interface AgenticReply {
  text: string;
  /** Set when the model proposed a real-world action tool this turn.
   * The turn ends immediately when this is set — the model's own
   * conversational reply is discarded in favor of the tool's own
   * confirmation sentence, so the "are you sure" framing can never be
   * softened or dropped by a rephrase. The caller (messagingService)
   * is responsible for persisting this as a MessagingPendingAction. */
  pendingAction: AgenticReplyAction | null;
}

const SYSTEM_PROMPT_SUFFIX = `

You also have tools to look up this user's real wearable/biometric data (including readiness), list and control their connected smart home devices, log a caffeinated drink they report having, create a calendar event, give general nutrition guidance, and remember a durable fact about them. Use a tool whenever the user's message calls for real data or a real action rather than answering from general knowledge alone — never guess a biometric number or invent a device name when a tool can get the real one.

For control_hue_light, activate_hue_scene, and create_calendar_event: calling the tool does NOT act yet — it only prepares a confirmation. After calling one of these, your turn is over; do not describe additional actions or ask a second question in the same turn.

Never call control_hue_light or activate_hue_scene with a light or scene name that didn't come from list_smart_home_devices in this conversation — call list_smart_home_devices first if you don't already have the real names.

create_calendar_event only ever creates a brand-new event — never call it to move, edit, or cancel something that's already on the calendar, since you have no way to identify which existing event the person means. If someone asks to reschedule something, say plainly that you can't do that yet.

log_caffeine_intake and remember_fact execute immediately — they don't need a confirmation, unlike the device-control tools above. Only call log_caffeine_intake when the person is reporting a drink they actually had, never for a hypothetical ("should I have a coffee?"). Call remember_fact only for something genuinely durable — a preference or recurring pattern worth recalling weeks from now — not for today's mood or schedule; most turns should call it zero times.

"How am I doing" or "status" style questions should be answered from get_wearable_snapshot's real numbers, including its readiness figure — do not invent or estimate any of them.`;

function toGeminiTools(tools: Record<string, MessagingTool>) {
  return [
    {
      functionDeclarations: Object.values(tools).map((tool) => ({
        name: tool.declaration.name,
        description: tool.declaration.description,
        parametersJsonSchema: tool.declaration.parameters,
      })),
    },
  ];
}

/**
 * What the caller knows about this conversation that the `ai` package
 * can't reach on its own — the inbound log with its intents and
 * timestamps, and the user's timezone.
 *
 * Optional: without it the agent still works, it just runs without a
 * compiled profile. That degradation is deliberate — a missing profile
 * should cost personalization, never the reply itself.
 */
export interface AgenticContext {
  inboundHistory: InboundRecord[];
  timeZone: string;
}

/**
 * The messaging channel's agentic counterpart to `sendClaraMessage` —
 * same grounded-in-real-data philosophy, extended with real tool calls
 * so a text can complete a task, not just describe one. See
 * docs/MESSAGING_AGENTIC_ARCHITECTURE.md.
 */
export async function sendAgenticMessage(
  userId: string,
  messages: ClaraChatMessage[],
  context?: AgenticContext,
): Promise<AgenticReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ClaraNotConfiguredError();

  const client = new GoogleGenAI({ apiKey });
  // Every lookup here is best-effort: a failure should cost this turn
  // its personalization, never its reply. The fallbacks are all the
  // *smaller* claim — no facts, no capabilities — so a degraded turn
  // under-promises rather than over-promises.
  const [systemInstruction, facts, capabilities] = await Promise.all([
    buildClaraSystemPrompt(userId),
    messagingMemoryRepository.listForUser(userId).catch(() => []),
    resolveMessagingCapabilities(userId),
  ]);

  // This is where the agent stops being one program. The tool surface,
  // the capability statement, and the profile block are all assembled
  // from this account's real state — two people texting the same
  // sentence get different tools and a different prompt.
  const tools = selectMessagingTools(capabilities);
  const capabilityBlock = capabilities.hueConnected
    ? ''
    : "\n\nThis person has no smart home bridge connected, so you have no device-control tools this turn. If they ask you to change a light, say plainly that they haven't connected one yet — never imply you tried.";

  const profileBlock = context
    ? renderProfileBlock(compileConversationProfile(context.inboundHistory, context.timeZone), facts)
    : renderProfileBlock({ stillLearning: true, totalInbound: 0, replyLength: null, activeBand: null, recurringInterests: null }, facts);

  const contents: Content[] = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const systemPrompt = systemInstruction + SYSTEM_PROMPT_SUFFIX + capabilityBlock + profileBlock;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Retried per round rather than around the whole loop: a 503 on
    // round 2 must not replay round 1's tool call, which may already
    // have executed something.
    const response = await withGeminiRetry(
      () =>
        client.models.generateContent({
          model: MODEL,
          contents,
          config: { systemInstruction: systemPrompt, tools: toGeminiTools(tools) },
        }),
      'clara.agentic',
    );

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      return { text: response.text ?? '', pendingAction: null };
    }

    // Only the first call is honored per round — see the "your turn is
    // over" instruction above. A model that calls a read tool and an
    // action tool in the same round only gets the read tool's result
    // fed back if that happens to be first; in practice the prompt
    // steers this away, and MAX_TOOL_ROUNDS bounds the cost either way.
    const call = calls[0]!;
    const name = call.name ?? '';
    // Looked up in the *selected* surface, not the full registry: not
    // declaring a tool is the efficiency win, but refusing to execute
    // one that wasn't selected is the safety property. A model that
    // names a de-selected tool anyway (from prior context, or a
    // hallucinated name) must not reach its handler.
    const tool = tools[name];
    if (!tool) {
      return { text: "I tried to do something I don't actually support — let me try answering directly instead.", pendingAction: null };
    }

    let result: Awaited<ReturnType<typeof tool.handler>>;
    try {
      result = await tool.handler(userId, call.args ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'that failed';
      return { text: message, pendingAction: null };
    }

    if (MESSAGING_ACTION_TOOL_NAMES.has(name) && result.confirmPrompt) {
      return {
        text: result.confirmPrompt,
        pendingAction: { toolName: name, args: result.data, confirmPrompt: result.confirmPrompt },
      };
    }

    // A write tool that already composed its own receipt — used
    // verbatim, ending the turn without a second model call. See
    // MessagingToolResult.replyText for why the model doesn't get to
    // rewrite a confirmation whose exact numbers are the point.
    if (result.replyText) {
      return { text: result.replyText, pendingAction: null };
    }

    // Read tool: feed the result back and let the model produce the
    // actual reply, possibly after another tool call (e.g. list devices
    // then propose an action).
    //
    // The model's turn is echoed back *verbatim* — its own `content`
    // object, not a `{ functionCall: { name, args } }` rebuilt from the
    // parsed call. `gemini-flash-latest` now resolves to a Gemini 3.x
    // thinking model, which attaches a `thoughtSignature` to the
    // functionCall part and requires it back unmodified on the next
    // turn; Google's thinking guide is explicit that thought blocks
    // "MUST" be resent exactly as received. Reconstructing the part
    // dropped that signature and every tool-using turn died with
    // `400 INVALID_ARGUMENT: Function call is missing a
    // thought_signature in functionCall parts`. The fallback only
    // matters for a response with no candidate content, which would
    // already have returned above.
    const modelTurn = response.candidates?.[0]?.content;
    contents.push(modelTurn ?? { role: 'model', parts: [{ functionCall: { name, args: call.args ?? {} } }] });
    contents.push({ role: 'user', parts: [createPartFromFunctionResponse(call.id ?? name, name, result.data)] });
  }

  return { text: "That took more steps than I could keep up with — try asking a bit more specifically.", pendingAction: null };
}
