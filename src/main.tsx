import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DisplayLive } from "./features/DisplayLive";
import "./index.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode>{window.location.pathname === "/display/live" ? <DisplayLive /> : <App />}</React.StrictMode>);
