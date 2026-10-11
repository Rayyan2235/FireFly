import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useStream } from '../useStream.ts';
import { WorkerPage } from './WorkerPage.tsx';
import '../index.css';
function WorkerApp() {
  const stream = useStream();
  const params = new URLSearchParams(location.search);
  return <WorkerPage stream={stream} initialWorker={params.get('worker') === 'sam' ? 'sam' : 'noor'} initialTask={params.get('task')} />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><WorkerApp /></StrictMode>);
