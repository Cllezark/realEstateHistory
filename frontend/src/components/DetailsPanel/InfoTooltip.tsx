import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './TractDetails.module.css';

interface Props {
  label: string;
  children: ReactNode;
}

/** ⓘ hint whose popup is portaled to document.body so overflow/stacking cannot clip it. */
export function InfoTooltip({ label, children }: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top, left: rect.left + rect.width / 2 });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => hide();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={styles.tooltipTrigger}
        tabIndex={0}
        role="button"
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        i
      </span>
      {open && createPortal(
        <span
          className={styles.tooltipFloating}
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  );
}
