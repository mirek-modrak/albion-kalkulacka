/**
 * Přihlášení v hlavičce.
 *
 * Zatím jen přihlásí a odhlásí — data se ještě nesynchronizují (krok 4 a 5
 * plánu F9b). Proto je u přihlášeného uživatele vidět poznámka, aby to
 * nevypadalo, že se něco ukládá.
 *
 * Bez přihlášení musí aplikace fungovat úplně stejně jako dřív. Když se
 * Firebase nepodaří načíst (offline, blokované skripty), zobrazí se chyba
 * a nic dalšího se neděje.
 */

import { useEffect, useState } from "react";
import { ChybaPrihlaseni, bylPrihlasen, odhlas, prihlas, sledujPrihlaseni, type Uzivatel } from "../stav/sync";

export function Prihlaseni() {
  const [uzivatel, setUzivatel] = useState<Uzivatel | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  // Obnovení přihlášení po návratu na stránku. Firebase se načte JEN když
  // tu uživatel přihlášený už byl — ostatní si ho nemusí stahovat.
  useEffect(() => {
    if (!bylPrihlasen()) return;
    let ukonci: (() => void) | undefined;
    let zrusen = false;
    sledujPrihlaseni((u) => setUzivatel(u))
      .then((f) => { if (zrusen) f(); else ukonci = f; })
      .catch(() => setChyba("Přihlašovací službu se nepodařilo načíst."));
    return () => { zrusen = true; ukonci?.(); };
  }, []);

  async function klikPrihlasit() {
    setPracuje(true);
    setChyba(null);
    try {
      setUzivatel(await prihlas());
      // Až teď má smysl sledovat změny (např. odhlášení v jiné záložce).
      sledujPrihlaseni((u) => setUzivatel(u)).catch(() => {});
    } catch (e) {
      setChyba(e instanceof ChybaPrihlaseni ? e.message : "Přihlášení se nepovedlo.");
    } finally {
      setPracuje(false);
    }
  }

  async function klikOdhlasit() {
    setPracuje(true);
    try {
      await odhlas();
      setUzivatel(null);
    } catch {
      setChyba("Odhlášení se nepovedlo.");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <div className="text-right text-sm">
      {uzivatel ? (
        <>
          <span className="text-slate-600 dark:text-slate-400">{uzivatel.email}</span>
          <button onClick={klikOdhlasit} disabled={pracuje}
                  className="ml-2 rounded-md border border-slate-300 px-2 py-1
                             text-slate-600 disabled:opacity-50
                             dark:border-slate-700 dark:text-slate-400">
            Odhlásit
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Synchronizace dat zatím není hotová — nastavení se drží jen v tomhle prohlížeči.
          </p>
        </>
      ) : (
        <button onClick={klikPrihlasit} disabled={pracuje}
                className="rounded-md border border-slate-300 px-3 py-1.5
                           text-slate-700 disabled:opacity-50
                           dark:border-slate-700 dark:text-slate-300">
          {pracuje ? "Přihlašuji…" : "Přihlásit přes Google"}
        </button>
      )}
      {chyba && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{chyba}</p>}
    </div>
  );
}
