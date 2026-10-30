import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth";
import RouterApp from "./site/RouterApp";
import { ToastProvider } from "./site/ui";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RouterApp />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>
);
