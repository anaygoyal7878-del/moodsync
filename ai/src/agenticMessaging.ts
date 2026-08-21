import { GoogleGenAI, createPartFromFunctionResponse, type Content } from '@google/genai';
import { messagingMemoryRepository } from '@moodsync/database';
import { AtlasNotConfiguredError, buildAtlasSystemPrompt, type AtlasChatMessage } from './atlasChat.js';
import { MESSAGING_TOOLS, MESSAGING_ACTION_TOOL_NAMES } from './messagingTools.js';

/** Same alias rationale as atlasChat.ts — see that file's comment. */
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

You also have tools to look up this user's real wearable/biometric data (including readiness), list and control their connected smart home devices, log a caffeinated drink they report having, give general nutrition guidance, and remember a durable fact about them. Use a tool whenever the user's message calls for real data or a real action rather than answering from general knowledge alone — never guess a biometric number or invent a device name when a tool can get the real one.

For control_hue_light and activate_hue_scene: calling the tool does NOT turn anything on or off yet — it only prepares a confirmation. After calling either tool, your turn is over; do not describe additional actions or ask a second question in the same turn.

Never call control_hue_light or activate_hue_scene with a light or scene name that didn't come from list_smart_home_devices in this conversation — call list_smart_home_devices first if you don't already have the real names.

log_caffeine_intake and remember_fact execute immediately — they don't need a confirmation, unlike the device-control tools above. Only call log_caffeine_intake when the person is reporting a drink they actually had, never for a hypothetical ("should I have a coffee?"). Call remember_fact only for something genuinely durable — a preference or recurring pattern worth recalling weeks from now — not for today's mood or schedule; most turns should call it zero times.

"How am I doing" or "status" style questions should be answered from get_wearable_snapshot's real numbers, including its readiness figure — do not invent or estimate any of them.`;

function toGeminiTools() {
  return [
    {
      functionDeclarations: Object.values(MESSAGING_TOOLS).map((tool) => ({
        name: tool.declaration.name,
        description: tool.declaration.description,
        parametersJsonSchema: tool.declaration.parameters,
      })),
    },
  ];
}

/**
 * The messaging channel's agentic counterpart to `sendAtlasMessage` —
 * same grounded-in-real-data philosophy, extended with real tool calls
 * so a text can complete a task, not just describe one. See
 * docs/MESSAGING_AGENTIC_ARCHITECTURE.md.
 */
export async function sendAgenticMessage(userId: string, messages: AtlasChatMessage[]): Promise<AgenticReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AtlasNotConfiguredError();

  const client = new GoogleGenAI({ apiKey });
  const [systemInstruction, facts] = await Promise.all([
    buildAtlasSystemPrompt(userId),
    // Best-effort — a memory lookup failing should never take down the
    // whole reply, it should just mean this turn has no memory of past
    // conversations.
    messagingMemoryRepository.listForUser(userId).catch(() => []),
  ]);
  const memoryBlock =
    facts.length > 0
      ? `\n\nWhat you remember about this person from past conversations:\n${facts.map((f) => `- ${f.fact}`).join('\n')}`
      : '';
  const contents: Content[] = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction: systemInstruction + SYSTEM_PROMPT_SUFFIX + memoryBlock, tools: toGeminiTools() },
    });

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
    const tool = MESSAGING_TOOLS[name];
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

    // Read tool: feed the result back and let the model produce the
    // actual reply, possibly after another tool call (e.g. list devices
    // then propose an action).
    contents.push({ role: 'model', parts: [{ functionCall: { name, args: call.args ?? {} } }] });
    contents.push({ role: 'user', parts: [createPartFromFunctionResponse(call.id ?? name, name, result.data)] });
  }

  return { text: "That took more steps than I could keep up with — try asking a bit more specifically.", pendingAction: null };
}
