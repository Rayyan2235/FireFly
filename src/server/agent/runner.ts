import type { Incident, IncidentStatus, Worker } from '../../contract.ts';
import type { Contention } from '../contention.ts';
import type { Dispatch } from '../dispatch.ts';
import type { Simulator } from '../simulator.ts';
import { TOOLS, runTool } from '../tools/index.ts';
import type { ToolContext, ToolInput } from '../tools/index.ts';
import type { World } from '../world.ts';
import type { AskModel, MessageParam } from './model.ts';
import { SYSTEM_PROMPT, incidentBrief } from './prompt.ts';

export const TOOL_BUDGET = 20; // tool calls per incident before the system steps in

interface Run {
  incidentId: string;
  agentId: string;
  messages: MessageParam[]; // append-only: the model's own turns go back exactly as they came
  toolCalls: number;
  busy: boolean; // a model turn is in flight
  news: string[]; // observations that arrived while it was busy
  note?: { from: string; text: string; seq: number }; // the last supervisor note this run was told about
}

export interface RunnerParts {
  world: World;
  sim: Simulator;
  dispatch: Dispatch;
  contention?: Contention;
  /** Outcomes recorded in earlier shifts, when a flight recorder is connected. */
  memory?: () => Promise<Record<string, unknown>>;
  ask: AskModel;
}

/**
 * Gives each incident to one agent and runs that agent's loop: ask the model,
 * run the tools it chose, hand the results back, until the model ends its turn.
 * Every tool call and result is written to the event log as it happens.
 */
export class AgentRunner {
  private readonly parts: RunnerParts;
  private readonly runs = new Map<string, Run>();
  private epoch = 0; // bumped on reset so runs from the old yard stop quietly

  constructor(parts: RunnerParts) {
    this.parts = parts;
  }

  /**
   * Gives every queued incident a free agent, oldest first. Claiming is one
   * uninterrupted step, so two incidents can never get the same agent.
   */
  assign(): void {
    const { incidents, workers } = this.parts.world.state;
    for (const incident of incidents.filter((i) => i.status === 'queued')) {
      const agent = workers.find((w) => w.kind === 'agent' && w.status === 'free');
      if (!agent) return; // the rest wait in the queue
      agent.status = 'busy';
      this.workerChanged(agent, `${agent.name} took ${incident.id}.`);
      incident.agentId = agent.id;
      this.setStatus(incident, 'working', `${incident.id} assigned to ${agent.name}.`);

      const run: Run = { incidentId: incident.id, agentId: agent.id, messages: [{ role: 'user', content: incidentBrief(incident, agent.name) }], toolCalls: 0, busy: false, news: [] };
      this.runs.set(incident.id, run);
      void this.turn(run);
    }
  }

  /** Something relevant happened: tell the agent working that incident and let it continue. */
  wake(incidentId: string, observation: string): void {
    const run = this.runs.get(incidentId);
    if (!run) return;
    run.news.push(observation);
    if (!run.busy) void this.turn(run);
  }

  /**
   * Passes a supervisor note to the agent on one incident, or to every agent at work.
   * The note is what gives a run the authority to save a correction. Returns how many were told.
   */
  supervisorNote(note: { from: string; text: string; seq: number }, incidentId?: string): number {
    const told = [...this.runs.values()].filter((run) => !incidentId || run.incidentId === incidentId);
    for (const run of told) {
      run.note = note;
      this.wake(run.incidentId, `Supervisor note from ${note.from}: "${note.text}"`);
    }
    return told.length;
  }

  /** Forgets every run (used by reset). Turns already in flight notice and stop. */
  stop(): void {
    this.epoch++;
    this.runs.clear();
  }

  /* ---------- one agent's loop ---------- */

  private async turn(run: Run): Promise<void> {
    const { world, ask } = this.parts;
    const epoch = this.epoch;
    const stale = () => epoch !== this.epoch;
    const incident = world.state.incidents.find((i) => i.id === run.incidentId);
    if (!incident || incident.status === 'resolved') return;
    const status = (): IncidentStatus => incident.status; // re-read after every await: tools change it

    run.busy = true;
    if (run.news.length) run.messages.push({ role: 'user', content: run.news.splice(0).join('\n') });
    if (status() !== 'working') this.setStatus(incident, 'working', `${incident.id}: ${this.name(run.agentId)} is back on it.`);

    try {
      while (true) {
        const started = Date.now();
        const reply = await ask({ system: SYSTEM_PROMPT, tools: TOOLS, messages: run.messages });
        if (stale()) return;
        console.log(`[${run.agentId} ${run.incidentId}] model ${((Date.now() - started) / 1000).toFixed(1)}s · in ${reply.usage.input_tokens} · out ${reply.usage.output_tokens} · ${reply.stop_reason}`);
        run.messages.push({ role: 'assistant', content: reply.content });

        if (reply.stop_reason === 'refusal') return this.systemEscalate(run, 'the model declined to continue.');
        if (reply.stop_reason === 'max_tokens') return this.systemEscalate(run, 'the model ran out of room mid-reply.');

        const results: Extract<MessageParam['content'], unknown[]> = [];
        for (const block of reply.content) {
          // The model's own short notes. Only real model output is ever shown as agent activity.
          if ((block.type === 'thinking' && block.thinking.trim()) || (block.type === 'text' && block.text.trim())) {
            const note = block.type === 'thinking' ? block.thinking : block.text;
            this.note(run, note.trim());
          }
          if (block.type !== 'tool_use') continue;

          if (run.toolCalls >= TOOL_BUDGET) {
            results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: `Not run: the budget of ${TOOL_BUDGET} tool calls for this incident is used up.` });
            continue;
          }
          run.toolCalls++;
          const input = block.input as ToolInput;
          const called = world.emit({
            type: 'tool.called',
            actor: { kind: 'agent', id: run.agentId },
            source_mode: 'real-model',
            incident_id: run.incidentId,
            summary: `${block.name}(${describe(input)})`,
            payload: { tool: block.name, input },
          });
          const result = await runTool(this.context(run), block.name, input);
          if (stale()) return;
          world.emit({
            type: 'tool.result',
            actor: { kind: 'system', id: 'tools' },
            source_mode: 'system',
            incident_id: run.incidentId,
            caused_by: called.seq,
            summary: result.summary,
            payload: { tool: block.name, ok: result.ok, output: result.output },
          });
          results.push({ type: 'tool_result', tool_use_id: block.id, is_error: !result.ok, content: JSON.stringify({ summary: result.summary, ...result.output }) });
        }

        if (status() === 'resolved') return this.finish(run);
        if (results.length) {
          // News that arrived mid-turn rides along with the tool results, so the model sees it at once.
          if (run.news.length) results.push({ type: 'text', text: run.news.splice(0).join('\n') });
          run.messages.push({ role: 'user', content: results });
          if (run.toolCalls >= TOOL_BUDGET && reply.stop_reason === 'tool_use') return this.systemEscalate(run, `the budget of ${TOOL_BUDGET} tool calls is used up.`);
          continue;
        }

        // The model ended its turn without resolving: it is waiting on someone else.
        if (run.news.length) {
          run.messages.push({ role: 'user', content: run.news.splice(0).join('\n') });
          continue;
        }
        if (status() === 'working') this.setStatus(incident, 'waiting', `${incident.id}: ${this.name(run.agentId)} is waiting.`);
        return;
      }
    } catch (err) {
      if (stale()) return;
      console.error(`[${run.agentId} ${run.incidentId}]`, err);
      this.systemEscalate(run, `the model call failed (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      run.busy = false;
    }
  }

  /** The incident is verified: the agent is free again and the next queued incident gets it. */
  private finish(run: Run): void {
    this.runs.delete(run.incidentId);
    const agent = this.parts.world.state.workers.find((w) => w.id === run.agentId);
    if (agent) {
      agent.status = 'free';
      this.workerChanged(agent, `${agent.name} is free.`);
    }
    this.assign();
  }

  /** The system, not the model, hands the incident to the supervisor, and says so. The truck stays held. */
  private systemEscalate(run: Run, why: string): void {
    const incident = this.parts.world.state.incidents.find((i) => i.id === run.incidentId);
    if (!incident || incident.status === 'resolved') return;
    incident.status = 'needs_you';
    this.parts.world.emit({
      type: 'incident.updated',
      actor: { kind: 'system', id: 'runner' },
      source_mode: 'system',
      incident_id: incident.id,
      summary: `${incident.id} escalated by the system: ${why}`,
      payload: { ...incident },
    });
  }

  private note(run: Run, text: string): void {
    const incident = this.parts.world.state.incidents.find((i) => i.id === run.incidentId);
    if (!incident) return;
    this.parts.world.emit({
      type: 'incident.updated',
      actor: { kind: 'agent', id: run.agentId },
      source_mode: 'real-model',
      incident_id: incident.id,
      summary: `${this.name(run.agentId)}: ${text}`,
      payload: { ...incident },
    });
  }

  private setStatus(incident: Incident, status: IncidentStatus, summary: string): void {
    incident.status = status;
    this.parts.world.emit({
      type: 'incident.updated',
      actor: { kind: 'system', id: 'runner' },
      source_mode: 'system',
      incident_id: incident.id,
      summary,
      payload: { ...incident },
    });
  }

  private workerChanged(worker: Worker, summary: string): void {
    this.parts.world.emit({ type: 'worker.changed', actor: { kind: 'system', id: 'runner' }, source_mode: 'system', summary, payload: { ...worker } });
  }

  private context(run: Run): ToolContext {
    const { world, sim, dispatch, contention, memory } = this.parts;
    return { world, sim, dispatch, contention, memory, incidentId: run.incidentId, agentId: run.agentId, note: run.note, wake: (id, observation) => this.wake(id, observation) };
  }

  private name(agentId: string): string {
    return this.parts.world.state.workers.find((w) => w.id === agentId)?.name ?? agentId;
  }
}

/** `{ job_id: 'J-2', door: 4 }` → `J-2, Door 4`, for the one-line activity summary. */
function describe(input: ToolInput): string {
  return Object.entries(input)
    .map(([key, value]) => (key === 'door' ? `Door ${value}` : key === 'wait_s' ? `wait ${value}s` : String(value)))
    .join(', ');
}
