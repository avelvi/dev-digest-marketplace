import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { copyText } from '../lib/clipboard';

interface CopyApi {
  label: (key: string, idle: string) => string;
  copy: (key: string, text: string) => void;
}

const CopyContext = createContext<CopyApi | null>(null);

export function CopyProvider({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [live, setLive] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((key: string, text: string) => {
    void copyText(text).then((ok) => {
      setCopied(ok ? key : null);
      setLive(ok ? 'Copied' : 'Copy failed. Select the text and copy it manually.');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(null);
        setLive('');
      }, 2000);
    });
  }, []);

  const api = useMemo<CopyApi>(() => ({ copy, label: (key, idle) => (copied === key ? 'Copied' : idle) }), [copy, copied]);

  return (
    <CopyContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="sr-only">
        {live}
      </div>
    </CopyContext.Provider>
  );
}

export function useCopy(): CopyApi {
  const ctx = useContext(CopyContext);
  if (!ctx) throw new Error('useCopy must be used inside CopyProvider');
  return ctx;
}

interface CopyButtonProps {
  copyKey: string;
  text: string;
  idle: string;
  ariaLabel: string;
  className?: string;
}

export function CopyButton({ copyKey, text, idle, ariaLabel, className = 'btn-small' }: CopyButtonProps) {
  const { copy, label } = useCopy();
  return (
    <button type="button" className={className} aria-label={ariaLabel} onClick={() => copy(copyKey, text)}>
      {label(copyKey, idle)}
    </button>
  );
}
