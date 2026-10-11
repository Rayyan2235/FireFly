import Anthropic from '@anthropic-ai/sdk';
import type { Tool } from '../tools/index.ts';

export type Message = Anthropic.Beta.BetaMessage;
export type MessageParam = Anthropic.Beta.BetaMessageParam;

/** One call to the model: the conversation so far in, the model's next turn out. */
export type AskModel = (request: { system: string; tools: Tool[]; messages: MessageParam[] }) => Promise<Message>;

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * The real model. `tool_choice` stays on auto (this model rejects forced tool use),
 * tool inputs are held to their schemas with `strict`, and thinking can't be turned
 * off, so `effort` is the speed lever: set FIREFLY_EFFORT=low to trade depth for latency.
 */
export function claude(): AskModel {
  const model = process.env.FIREFLY_MODEL ?? 'claude-opus-5-5';
  const effort = (process.env.FIREFLY_EFFORT ?? 'medium') as Effort;
  let client: Anthropic | null = null; // made on first use, so the server still starts without a key

  return ({ system, tools, messages }) => {
    client ??= new Anthropic();
    return client.beta.messages.create({
      model,
      max_tokens: 16000,
      // Progress notes between tool calls come back as short real text; a declined request falls back server-side.
      betas: ['thinking-display-updates-2026-08-18', 'server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive', display: 'updates' },
      output_config: { effort },
      cache_control: { type: 'ephemeral' },
      system,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, strict: true })),
      messages,
    });
  };
}
