import { useApp, type Route } from "../state/AppContext";

const LINKS: ReadonlyArray<{ route: Route; label: string }> = [
  { route: "/vigil", label: "The vigil" },
  { route: "/crypt", label: "The crypt" },
  { route: "/settings", label: "Settings" },
];

export function Nav() {
  const { route, navigate, soundEnabled, soundBusy, toggleSound } = useApp();
  const active: Route = route === "/return" ? "/crypt" : route;

  return (
    <header className="nav">
      <div className="nav__inner">
        <a className="brand" href="#/" aria-label="Vesper home">
          <span className="brand__mark" aria-hidden="true">
            <span className="brand__flame" />
          </span>
          <span className="brand__word">Vesper</span>
        </a>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.route}
              href={`#${link.route}`}
              className={`nav__link ${active === link.route ? "is-active" : ""}`}
              aria-current={active === link.route ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate(link.route);
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <button
          type="button"
          className={`sound ${soundEnabled ? "is-on" : ""}`}
          aria-pressed={soundEnabled}
          onClick={toggleSound}
          disabled={soundBusy}
        >
          <span className="sound__bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {soundBusy ? "Waking…" : soundEnabled ? "Sound on" : "Sound off"}
        </button>
      </div>
    </header>
  );
}
