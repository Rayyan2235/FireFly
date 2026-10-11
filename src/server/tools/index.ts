import { getCommandStatus, requestDestination } from './commands.ts';
import { getJob, listCompatibleDoors, reserveDoor } from './doors.ts';
import { escalate, getSiteProcedure, inspectIncident, verifyOutcome } from './incident.ts';
import { listEligibleWorkers, offerTask, requestAuthorization, requestResume, saveCorrection, withdrawOffer } from './people.ts';
import { BadInput, fail } from './types.ts';
import type { Tool, ToolContext, ToolInput, ToolResult } from './types.ts';

export type { Tool, ToolContext, ToolInput, ToolResult } from './types.ts';

/** Every tool an agent may call. If it isn't here, the model can't do it. */
export const TOOLS: Tool[] = [
  inspectIncident,
  getJob,
  getSiteProcedure,
  listCompatibleDoors,
  reserveDoor,
  requestDestination,
  getCommandStatus,
  listEligibleWorkers,
  offerTask,
  withdrawOffer,
  saveCorrection,
  requestAuthorization,
  requestResume,
  verifyOutcome,
  escalate,
];

/** Runs one tool. Bad or unknown input comes back as a failed result, never as a crash. */
export async function runTool(ctx: ToolContext, name: string, input: ToolInput): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return fail('unknown_tool', `There is no tool called ${name}.`);
  try {
    return await tool.run(ctx, input);
  } catch (err) {
    if (err instanceof BadInput) return fail('bad_input', err.message);
    throw err;
  }
}
