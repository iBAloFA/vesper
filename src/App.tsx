import { Backdrop } from "./components/Backdrop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Nav } from "./components/Nav";
import { ARCHIVE_URL, SITE } from "./lib/site";
import { useApp } from "./state/AppContext";
import { AppProvider } from "./state/AppContext";
import { CryptView } from "./views/CryptView";
import { LandingView } from "./views/LandingView";
import { LedgerView } from "./views/LedgerView";
import { ReturnView } from "./views/ReturnView";
import { SettingsView } from "./views/SettingsView";
import { VigilView } from "./views/VigilView";

function RouteView() {
  const { route } = useApp();
  switch (route) {
    case "/vigil":
      return <VigilView />;
    case "/crypt":
      return <CryptView />;
    case "/ledger":
      return <LedgerView />;
    case "/settings":
      return <SettingsView />;
    case "/return":
      return <ReturnView />;
    default:
      return <LandingView />;
  }
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <p className="footer__brand">
          <span className="dot dot--ember" /> Vesper · keep a vigil, leave a sigil
        </p>
        <div className="footer__links">
          <a href={`${SITE.repoUrl}`} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={`${SITE.repoUrl}/blob/main/docs/kiro-usage.md`} target="_blank" rel="noreferrer">
            Built with Kiro
          </a>
          <a href={SITE.kiroweenUrl} target="_blank" rel="noreferrer">
            Kiroween 2026
          </a>
          <a href={ARCHIVE_URL}>v0.1 archive</a>
        </div>
        <p className="footer__note">MIT · no accounts · no uploads · v{SITE.version}</p>
      </div>
    </footer>
  );
}

function Shell() {
  const { route, timer, settings } = useApp();
  const inRitual = timer.snapshot !== null;

  return (
    <div className={`app ${inRitual ? "app--ritual" : ""}`}>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <Backdrop reduceMotion={settings.reduceMotion} />
      {!inRitual ? <Nav /> : null}
      <main id="main" tabIndex={-1} className={`main ${inRitual ? "main--ritual" : ""}`}>
        <ErrorBoundary key={route}>
          <RouteView />
        </ErrorBoundary>
      </main>
      {!inRitual ? <Footer /> : null}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
