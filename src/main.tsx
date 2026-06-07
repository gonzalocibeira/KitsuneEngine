import React from "react";
import { createRoot } from "react-dom/client";
import { BrandedHomeScreen } from "@kitsune/ui";
import "./styles.css";

const TamamoApp = React.lazy(() => import("../apps/tamamo/src/main"));
const KuzunohaApp = React.lazy(() => import("../apps/kuzunoha/src/main"));

type Route = "/" | "/tamamo" | "/kuzunoha" | "not-found";

function routeForPath(pathname: string): Route {
  if (pathname === "/" || pathname === "/tamamo" || pathname === "/kuzunoha") return pathname;
  return "not-found";
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function App() {
  const [route, setRoute] = React.useState<Route>(() => routeForPath(window.location.pathname));

  React.useEffect(() => {
    function syncRoute() {
      setRoute(routeForPath(window.location.pathname));
    }

    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  React.useEffect(() => {
    document.title = route === "/" ? "Kitsune" : route === "not-found" ? "Not Found | Kitsune" : `${route.slice(1)[0].toUpperCase()}${route.slice(2)} | Kitsune`;
  }, [route]);

  function handleNavigation(event: React.MouseEvent) {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[data-route]");
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(anchor.pathname);
  }

  return (
    <div onClick={handleNavigation}>
      <React.Suspense fallback={<LoadingScreen />}>
        {route === "/" && <Launcher />}
        {route === "/tamamo" && <TamamoApp />}
        {route === "/kuzunoha" && <KuzunohaApp />}
        {route === "not-found" && <NotFound />}
      </React.Suspense>
    </div>
  );
}

function Launcher() {
  return (
    <BrandedHomeScreen
      title="Kitsune"
      tagline="Build learning worlds, then step inside them."
      panelEyebrow="Choose an application"
      panelTitle="Where do you want to go?"
      panelDescription="Open the maker to shape a quest or launch the player to experience one."
    >
      <nav className="branded-home-actions" aria-label="Kitsune applications">
        <a className="branded-home-button primary" href="/tamamo" data-route>
          <strong>Go to Tamamo</strong>
          <span>Design maps, encounters, knowledge, and progression.</span>
        </a>
        <a className="branded-home-button" href="/kuzunoha" data-route>
          <strong>Go to Kuzunoha</strong>
          <span>Load and play a finished learning quest.</span>
        </a>
      </nav>
    </BrandedHomeScreen>
  );
}

function NotFound() {
  return (
    <BrandedHomeScreen
      title="Kitsune"
      tagline="The path you followed does not lead to an application."
      panelEyebrow="Not found"
      panelTitle="Return to the launcher"
      panelDescription="Choose a known Kitsune application from the launcher."
    >
      <div className="branded-home-actions">
        <a className="branded-home-button primary" href="/" data-route>Open launcher</a>
      </div>
    </BrandedHomeScreen>
  );
}

function LoadingScreen() {
  return (
    <BrandedHomeScreen
      title="Kitsune"
      tagline="Preparing your workspace."
      panelEyebrow="Loading"
      panelTitle="Opening application"
      panelDescription="The selected Kitsune application is loading."
    >
      <p className="branded-home-note" role="status">Please wait.</p>
    </BrandedHomeScreen>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
