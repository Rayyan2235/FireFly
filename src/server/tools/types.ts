import type { Incident, Job, Truck } from '../../contract.ts';
import type { Contention } from '../contention.ts';
import type { Dispatch } from '../dispatch.ts';
import type { Simulator } from '../simulator.ts';
import type { World } from '../world.ts';

/** Everything a tool may touch, plus whose incident it is acting for. */
export interface ToolContext {
  world: World;
  sim: Simulator;
  dispatch: Dispatch;
  incidentId: string;
  agentId: string;
  contention?: Contention;
  /** The supervisor note this run was last told about. Only a note gives authority to save a correction. */
  note?: { from: string; text: string; seq: number };
  /** Tells another incident's agent that something it depends on changed. */
  wake?: (incidentId: string, observation: string) => void;
}

/** What the model gets back. `ok: false` always says what was wrong, so the model can adapt. */
export interface ToolResult {
  ok: boolean;
  summary: string; // the one line the activity view shows
  output: Record<string, unknown>;
}

export type ToolInput = Record<string, unknown>;

/**
 * A function the model may call. Read tools return context. Mutation tools change
 * the yard and re-check everything themselves at the moment they run (ADR 0004).
 */
export interface Tool {
  name: string;
  kind: 'read' | 'mutation';
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
  run(ctx: ToolContext, input: ToolInput): ToolResult | Promise<ToolResult>;
}

export const ok = (summary: string, output: Record<string, unknown> = {}): ToolResult => ({ ok: true, summary, output });
export const fail = (conflict: string, summary: string, output: Record<string, unknown> = {}): ToolResult => ({
  ok: false,
  summary,
  output: { conflict, ...output },
});

/** Builds the strict input schema: every listed field is required and nothing else is allowed. */
export const schema = (properties: Record<string, unknown>): Tool['input_schema'] => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export class BadInput extends Error {}

export function text(input: ToolInput, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) throw new BadInput(`"${key}" must be a non-empty string.`);
  return value.trim();
}

export function int(input: ToolInput, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new BadInput(`"${key}" must be a whole number.`);
  return value;
}

/** The incident this run owns, with its truck and job. An agent only acts for its own incident. */
export function scope(ctx: ToolContext): { incident: Incident; truck: Truck; job: Job } {
  const { incidents, trucks, jobs } = ctx.world.state;
  const incident = incidents.find((i) => i.id === ctx.incidentId);
  const truck = trucks.find((t) => t.id === incident?.truckId);
  const job = jobs.find((j) => j.id === truck?.jobId);
  if (!incident || !truck || !job) throw new BadInput(`Incident ${ctx.incidentId} has no truck and job to act on.`);
  return { incident, truck, job };
}
