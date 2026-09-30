import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { RotulosProvider } from "./auth/Rotulos";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
      <AuthProvider>
        <RotulosProvider>
          <App />
        </RotulosProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
