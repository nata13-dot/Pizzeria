import {useRef, useState} from 'react';

// Synchronous exclusion also covers confirmations before the first network write.
// It does not retry, establish idempotence, or decide whether an operation succeeded.
export function useActionGate() {
  const locked = useRef(false);
  const [busy,setBusy] = useState(false);
  async function run(action:()=>void|Promise<void>) {
    if(locked.current)return;
    locked.current=true;setBusy(true);
    try {await action();} finally {locked.current=false;setBusy(false);}
  }
  return {run,busy};
}
