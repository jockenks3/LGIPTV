import "./polyfills"; // MUST be first (core-js, regenerator-runtime, whatwg-fetch)
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
