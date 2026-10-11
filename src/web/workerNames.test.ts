import { expect, it } from 'vitest';
import { displayWorkerNames, serverWorkerNames } from './workerNames.ts';
it('uses the new names consistently for names, IDs and recorded sentences', () => {
  expect(displayWorkerNames('Noor + F-4; Sam + F-3; offer_task(R-5, noor)')).toBe('Morgan + F-4; Nate + F-3; offer_task(R-5, Morgan)');
  expect(displayWorkerNames('sam')).toBe('Nate');
  expect(displayWorkerNames('the same outcome')).toBe('the same outcome');
});
it('routes supervisor notes about new names to existing worker identities', () => {
  expect(serverWorkerNames('Morgan is available. Nate went home.')).toBe('Noor is available. Sam went home.');
  expect(displayWorkerNames(serverWorkerNames('Ask Morgan or Nate.'))).toBe('Ask Morgan or Nate.');
});
