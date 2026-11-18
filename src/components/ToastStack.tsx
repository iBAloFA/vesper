export type ToastKind = "info" | "success" | "error";

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`} role="status">
          <span className="toast__mark" aria-hidden="true" />
          <p>{toast.message}</p>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss message"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
