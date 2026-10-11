import { useState } from 'react';
import { DeviceMobile } from '@phosphor-icons/react';
import { Button } from '../ui/Button.tsx';

export function WorkerLauncher() {
  const [blocked, setBlocked] = useState(false);
  function openPhone() {
    const phone = window.open('/worker.html', 'firefly-worker', 'popup,width=390,height=844,resizable=yes,scrollbars=yes');
    setBlocked(!phone);
    phone?.focus();
  }
  return <div className="r5-worker-launcher">
    <Button variant="glass" onClick={openPhone}><DeviceMobile size={16} />Worker phone</Button>
    {blocked && <p role="status" className="r5-message">The browser blocked the window. <a href="/worker.html">Open the worker page</a>.</p>}
  </div>;
}
