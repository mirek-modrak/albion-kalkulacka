import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { Brana } from "./ui/Brana";

// Brána pouští dál jen přihlášené a povolené (F9c). Dokud nepustí,
// `App` se vůbec nevykreslí.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Brana>{(uzivatel) => <App uzivatel={uzivatel} />}</Brana>
  </StrictMode>,
);
