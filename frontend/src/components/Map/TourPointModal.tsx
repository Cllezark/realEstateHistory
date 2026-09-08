import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './TourPointModal.module.css';

export interface TourPointNotes {
  title: string;
  description: string;
  folder: string;
}

interface Props {
  point: TourPointNotes;
  onClose: () => void;
}

export function TourPointModal({ point, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const body = point.description.trim();

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-point-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          className={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 id="tour-point-modal-title" className={styles.title}>{point.title}</h2>
        {point.folder && <p className={styles.folder}>{point.folder}</p>}
        <div className={styles.body}>{body || 'No notes for this point.'}</div>
      </div>
    </div>,
    document.body,
  );
}
