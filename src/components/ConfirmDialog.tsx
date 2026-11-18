import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  state: { options: ConfirmOptions; resolve: (value: boolean) => void } | null;
  onResolve: (value: boolean) => void;
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({ state, onResolve }: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onResolve(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>("[data-confirm-primary]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onResolve, state]);

  if (!state) return null;
  const { options } = state;

  return (
    <div className="modal" role="presentation">
      <button
        className="modal__backdrop"
        type="button"
        aria-label="Cancel"
        onClick={() => onResolve(false)}
      />
      <div
        className="modal__panel surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        ref={panelRef}
      >
        <p className="kicker">A small threshold</p>
        <h2 id="confirm-title" className="modal__title">
          {options.title}
        </h2>
        {options.body ? <p className="modal__body">{options.body}</p> : null}
        <div className="modal__actions">
          <button className="btn btn--ghost" type="button" onClick={() => onResolve(false)}>
            {options.cancelLabel ?? "Go back"}
          </button>
          <button
            className={`btn ${options.danger ? "btn--danger" : "btn--primary"}`}
            type="button"
            data-confirm-primary
            onClick={() => onResolve(true)}
          >
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
