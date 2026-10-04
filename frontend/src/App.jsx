import { useEffect, useState } from "react";
import Home from "./pages/Home.jsx";
import Room from "./pages/Room.jsx";

// A two-route app does not need a router library.
function readLocation() {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]{8,32})\/?$/);
  return match ? { page: "room", roomId: match[1], key: window.location.hash.slice(1) } : { page: "home" };
}

export function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const update = () => setLocation(readLocation());
    window.addEventListener("popstate", update);
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("hashchange", update);
    };
  }, []);

  if (location.page === "room") {
    return <Room key={`${location.roomId}#${location.key}`} roomId={location.roomId} encodedKey={location.key} />;
  }
  return <Home />;
}
