/** Display aliases only: stable worker IDs and the server work record stay intact. */
const names: Record<string, string> = { sam: 'Nate', noor: 'Morgan' };
export function displayWorkerNames(text: string): string {
  return text.replace(/\b(sam|noor)\b/gi, name => names[name.toLowerCase()]!);
}
/** The existing agent knows the contract IDs and original names. */
export function serverWorkerNames(text: string): string {
  return text.replace(/\b(Morgan|Nate)\b/gi, name => name.toLowerCase() === 'morgan' ? 'Noor' : 'Sam');
}
