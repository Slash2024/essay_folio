import {useEffect, useState} from 'react';
import {CheckCircle2} from 'lucide-react';
import {COMPLETION_FALLBACK, type CompletionMessage} from '../../lib/completion-encouragement';

export default function CompletionEncouragement({result, onClose}: {
  result: Promise<CompletionMessage>;
  onClose: () => void;
}) {
  const [message, setMessage] = useState(COMPLETION_FALLBACK);
  useEffect(() => {
    let active = true;
    // Late responses must not replace a message the user has already read.
    const timer = setTimeout(() => { active = false; }, 2000);
    result.then(value => { if (active) setMessage(value); }).catch(() => {});
    return () => { active = false; clearTimeout(timer); };
  }, [result]);

  return <div className="completion-encouragement">
    <span className="completion-emblem" aria-hidden="true"><CheckCircle2 size={27} strokeWidth={1.5}/></span>
    <div className="completion-words" aria-live="polite" aria-atomic="true">
      <p className="completion-chinese" lang="zh-CN">{message.zh}</p>
      <p className="completion-english english" lang="en">{message.en}</p>
    </div>
    <button className="button primary" onClick={onClose}>收下鼓励</button>
  </div>;
}
