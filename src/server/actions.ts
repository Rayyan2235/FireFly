import type { MessageType, Task, Worker } from '../contract.ts';
import { resumeBlockers } from './tools/people.ts';
import type { World } from './world.ts';

/** A human action that can't be applied right now. The message is shown to the person who tried. */
export class ActionError extends Error {}

/** What the people side needs from the agent side. */
export interface AgentLink {
  /** Tells the agent working an incident that something relevant happened. */
  wake(incidentId: string, observation: string): void;
  /** Passes a supervisor note to the agents at work. Returns how many were told. */
  supervisorNote(note: { from: string; text: string; seq: number }, incidentId?: string): number;
}

const SUPERVISOR = 'maria';

/**
 * Everything a person can do: the supervisor at the console and workers on the phone page.
 * Each action is recorded as a `human` event, then the agent that was waiting on it is woken.
 * These are people's reports; the system records them, it does not verify them.
 */
export class Actions {
  private readonly world: World;
  private readonly agents: AgentLink;

  constructor(world: World, agents: AgentLink) {
    this.world = world;
    this.agents = agents;
  }

  /** The supervisor tells Firefly something in plain words. A model interprets it; a tool decides whether it can be saved. */
  note(text: string, incidentId?: string): void {
    const said = text.trim();
    if (!said) throw new ActionError('Say something first.');
    const maria = this.worker(SUPERVISOR);
    const event = this.radio(maria, 'NOTE', said, incidentId);
    const told = this.agents.supervisorNote({ from: maria.name, text: said, seq: event.seq }, incidentId);
    if (told === 0) {
      const reply = 'No agent is working an incident right now, so nothing was saved from this note.';
      this.world.emit({
        type: 'radio',
        actor: { kind: 'system', id: 'firefly' },
        source_mode: 'system',
        caused_by: event.seq,
        summary: `Firefly → ${maria.name} NOTE: ${reply}`,
        payload: { from: 'Firefly', to: maria.name, type: 'NOTE', text: reply },
      });
    }
  }

  /** The supervisor authorizes a held truck to resume. */
  approve(approvalId: string): void {
    const approval = this.world.state.approvals.find((a) => a.id === approvalId);
    if (!approval) throw new ActionError('No such request.');
    if (approval.status !== 'pending') throw new ActionError('Already authorized.');
    const maria = this.worker(SUPERVISOR);
    approval.status = 'approved';
    this.radio(maria, 'APPROVE', `Resume authorized for ${approval.incidentId}.`, approval.incidentId);
    this.world.emit({ type: 'approval.changed', actor: { kind: 'person', id: maria.id }, source_mode: 'human', incident_id: approval.incidentId, summary: `${maria.name} authorized the resume for ${approval.incidentId}.`, payload: { ...approval } });
    this.agents.wake(approval.incidentId, `${maria.name} authorized the resume.`);
  }

  /**
   * The supervisor asks for a held truck to resume right now. It goes through the same
   * release check the agent's `request_resume` uses, so an early request is refused and
   * the refusal is recorded with what is missing. It never moves a truck by itself:
   * when nothing is missing, the agent on the incident is already resuming it.
   * (Added to show the gate on demand; may be removed.)
   */
  resumeNow(incidentId: string): void {
    const incident = this.world.state.incidents.find((i) => i.id === incidentId);
    const truck = this.world.state.trucks.find((t) => t.id === incident?.truckId);
    if (!incident || !truck) throw new ActionError('No held truck on that incident.');
    if (incident.status === 'resolved') throw new ActionError(`${incident.id} is already resolved.`);

    const maria = this.worker(SUPERVISOR);
    const asked = this.radio(maria, 'RESUME', `Resume ${truck.id} now.`, incident.id);
    const missing = resumeBlockers(this.world, incident);
    if (truck.controller !== 'held') missing.push(`${truck.id} is ${truck.controller}, not held.`);
    if (!missing.length) return;

    const refusal = `Resume rejected: ${missing.join(' ')}`;
    this.world.emit({
      type: 'incident.updated',
      actor: { kind: 'system', id: 'tools' },
      source_mode: 'system',
      incident_id: incident.id,
      caused_by: asked.seq,
      summary: `${refusal} ${truck.id} stays ${truck.controller}.`,
      payload: { ...incident },
    });
    throw new ActionError(refusal);
  }

  /** The supervisor ends a saved rule, e.g. maintenance cleared the forklift. */
  releaseCorrection(correctionId: string): void {
    const correction = this.world.state.corrections.find((c) => c.id === correctionId);
    if (!correction) throw new ActionError('No such rule.');
    if (!correction.active) throw new ActionError('That rule has already ended.');
    correction.active = false;
    this.world.emit({ type: 'correction.saved', actor: { kind: 'person', id: SUPERVISOR }, source_mode: 'human', summary: `Rule ended: ${correction.interpretation}`, payload: { ...correction } });
  }

  /** A worker answers an offer. */
  answer(taskId: string, workerId: string, accept: boolean): void {
    const { task, worker } = this.assigned(taskId, workerId);
    if (task.status !== 'offered') throw new ActionError(task.status === 'withdrawn' ? 'This offer was withdrawn.' : `This task is already ${task.status}.`);
    task.status = accept ? 'accepted' : 'declined';
    this.radio(worker, accept ? 'ACCEPT' : 'DECLINE', accept ? `On it with ${task.equipment}.` : 'Cannot take it.', task.incidentId);
    this.taskChanged(task, worker, `${worker.name} ${accept ? 'accepted' : 'declined'} ${task.id}.`);
    if (accept) this.setStatus(worker, 'busy');
    this.agents.wake(task.incidentId, `${worker.name} ${accept ? `accepted ${task.id} and is working with ${task.equipment}` : `declined ${task.id}`}.`);
  }

  /** A worker reports progress on accepted work: arrived, obstruction cleared, people clear. */
  report(taskId: string, workerId: string, what: 'arrived' | 'cleared' | 'people_clear'): void {
    const { task, worker } = this.assigned(taskId, workerId);
    if (task.status !== 'accepted') throw new ActionError(`This task is ${task.status}, not accepted.`);

    if (what === 'arrived') {
      task.arrived = true;
      this.taskChanged(task, worker, `${worker.name} arrived at Door ${task.door}.`);
    } else if (what === 'cleared') {
      task.cleared = true;
      this.radio(worker, 'DONE', `Door ${task.door} approach cleared.`, task.incidentId);
      const door = this.world.state.doors.find((d) => d.id === task.door);
      if (door?.obstruction) {
        door.obstruction = false;
        this.world.emit({ type: 'door.changed', actor: { kind: 'person', id: worker.id }, source_mode: 'human', incident_id: task.incidentId, summary: `${worker.name} reports the Door ${door.id} approach cleared.`, payload: { ...door } });
      }
      this.taskChanged(task, worker, `${worker.name} reports the obstruction cleared.`);
    } else {
      if (!task.cleared) throw new ActionError('Report the obstruction cleared first.');
      task.peopleClear = true;
      task.status = 'closed';
      this.radio(worker, 'CLEAR', `People clear of the Door ${task.door} approach.`, task.incidentId);
      this.taskChanged(task, worker, `${worker.name} reports people clear. ${task.id} closed.`);
      this.setStatus(worker, 'free');
    }
    const news = { arrived: `arrived at Door ${task.door}`, cleared: 'reports the obstruction cleared', people_clear: 'reports people clear of the path' }[what];
    this.agents.wake(task.incidentId, `${worker.name} ${news}.`);
  }

  private assigned(taskId: string, workerId: string): { task: Task; worker: Worker } {
    const task = this.world.state.tasks.find((t) => t.id === taskId);
    if (!task) throw new ActionError('No such task.');
    if (task.worker !== workerId) throw new ActionError('This task is not yours.');
    return { task, worker: this.worker(workerId) };
  }

  private worker(id: string): Worker {
    const worker = this.world.state.workers.find((w) => w.id === id && w.kind === 'person');
    if (!worker) throw new ActionError('No such person.');
    return worker;
  }

  private radio(from: Worker, type: MessageType, text: string, incidentId?: string) {
    return this.world.emit({
      type: 'radio',
      actor: { kind: 'person', id: from.id },
      source_mode: 'human',
      incident_id: incidentId,
      summary: `${from.name} → Firefly ${type}: ${text}`,
      payload: { from: from.name, to: 'Firefly', type, text },
    });
  }

  private taskChanged(task: Task, worker: Worker, summary: string): void {
    this.world.emit({ type: 'task.changed', actor: { kind: 'person', id: worker.id }, source_mode: 'human', incident_id: task.incidentId, summary, payload: { ...task } });
  }

  private setStatus(worker: Worker, status: Worker['status']): void {
    worker.status = status;
    this.world.emit({ type: 'worker.changed', actor: { kind: 'system', id: 'firefly' }, source_mode: 'system', summary: `${worker.name} is ${status}.`, payload: { ...worker } });
  }
}
