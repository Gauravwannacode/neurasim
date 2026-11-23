import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import App from "./App";
import { prefersReducedMotion } from "./lib/motion";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MotionConfig reducedMotion={prefersReducedMotion() ? "always" : "never"}>
        <App />
      </MotionConfig>
    </BrowserRouter>
  </React.StrictMode>,
);
