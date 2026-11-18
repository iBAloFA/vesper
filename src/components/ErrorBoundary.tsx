import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Vesper hit an unexpected error.", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="page">
          <div className="surface empty">
            <p className="kicker">The house went dark</p>
            <h1>Something slipped out of the walls.</h1>
            <p className="lede">
              Your archive is still in this browser. Reload the room, or return to the entrance.
            </p>
            <div className="button-row">
              <button className="btn btn--primary" type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
              <a className="btn btn--ghost" href="#/">
                Return home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
