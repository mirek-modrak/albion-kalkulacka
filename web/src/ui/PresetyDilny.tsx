/**
 * Presety dílny — uložená nastavení pro časté použití.
 *
 * Uloží celý stav dílny (seznam položek, globální konfiguraci i přepisy)
 * pod jménem. Kdo často přepíná mezi „vyrábím v Caerleonu" a „vozím
 * z Lymhurstu", si to uloží a přepne jedním kliknutím.
 */

import { useState } from "react";
import {
  nactiPresety, ulozPresety, type Preset, type StavDilny,
} from "../stav/dilna";

export function PresetyDilny({ stav, uprav }: {
  stav: StavDilny;
  uprav: (s: StavDilny) => void;
}) {
  const [presety, setPresety] = useState<Preset[]>(() => nactiPresety());
  const [vybrany, setVybrany] = useState("");

  const zapis = (nove: Preset[]) => { setPresety(nove); ulozPresety(nove); };

  const ulozit = () => {
    const nazev = window.prompt("Název presetu:", vybrany || "")?.trim();
    if (!nazev) return;
    const snapshot: Preset = { nazev, stav };
    zapis([...presety.filter((p) => p.nazev !== nazev), snapshot]);
    setVybrany(nazev);
  };

  const nacist = (nazev: string) => {
    setVybrany(nazev);
    const p = presety.find((x) => x.nazev === nazev);
    if (p) uprav(p.stav);
  };

  const smazat = () => {
    if (!vybrany) return;
    zapis(presety.filter((p) => p.nazev !== vybrany));
    setVybrany("");
  };

  return (
    <div className="flex items-center gap-1 text-xs">
      <select value={vybrany} onChange={(e) => nacist(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1
                         dark:border-slate-700 dark:bg-slate-900">
        <option value="">— preset —</option>
        {presety.map((p) => <option key={p.nazev} value={p.nazev}>{p.nazev}</option>)}
      </select>
      <button onClick={ulozit}
              className="rounded border border-blue-500 px-2 py-1 text-blue-600 dark:text-blue-400"
              title="Uložit aktuální nastavení jako preset">
        uložit
      </button>
      {vybrany && (
        <button onClick={smazat} title="Smazat vybraný preset"
                className="rounded border border-slate-300 px-2 py-1 text-slate-500
                           dark:border-slate-700">
          ✕
        </button>
      )}
    </div>
  );
}
