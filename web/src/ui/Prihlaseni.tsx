/**
 * Kdo je přihlášený a jak je na tom synchronizace — proužek v hlavičce.
 *
 * Přihlašování samotné řeší [Brana](./Brana.tsx); sem se uživatel dostane,
 * jen když už je ověřený. Tahle komponenta tedy jen ukazuje stav a umí
 * odhlásit.
 *
 * Když se server a prohlížeč rozejdou, **nic se nepřepíše samo** — objeví se
 * volba. Ručně zadané ceny jsou práce uživatele a tiše je zahodit nesmíme.
 */

import { useEffect, useState } from "react";
import { popis } from "../stav/balicek";
import { odhlas, type Uzivatel } from "../stav/sync";
import { spustSynchronizaci, type Rizeni, type Stav } from "../stav/synchronizace";

export function Prihlaseni({ uzivatel }: { uzivatel: Uzivatel }) {
  const [pracuje, setPracuje] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [stav, setStav] = useState<Stav | null>(null);
  // Řízení je ve stavu, ne v `ref`. Kdyby bylo v `ref`, dialog vykreslený
  // dřív by si držel odkaz na instanci, která už byla zastavená — tlačítka
  // by nedělala nic a nikde by se to neprojevilo jako chyba.
  const [rizeni, setRizeni] = useState<Rizeni | null>(null);

  const email = uzivatel.email;
  useEffect(() => {
    const r = spustSynchronizaci(email, setStav);
    setRizeni(r);
    return () => { r.zastav(); setRizeni(null); };
  }, [email]);

  async function klikOdhlasit() {
    setPracuje(true);
    try {
      await odhlas();
      // Brána si odhlášení všimne sama a vrátí přihlašovací obrazovku.
    } catch {
      setChyba("Odhlášení se nepovedlo.");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <div className="text-right text-sm">
      <span className="text-slate-600 dark:text-slate-400">{email}</span>
      <button onClick={klikOdhlasit} disabled={pracuje}
              className="ml-2 rounded-md border border-slate-300 px-2 py-1
                         text-slate-600 disabled:opacity-50
                         dark:border-slate-700 dark:text-slate-400">
        Odhlásit
      </button>
      <PopisStavu stav={stav} rizeni={rizeni} />
      {chyba && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{chyba}</p>}
    </div>
  );
}

function PopisStavu({ stav, rizeni }: { stav: Stav | null; rizeni: Rizeni | null }) {
  if (!stav) return null;

  if (stav.druh === "rozhodni") {
    return (
      <div className="mt-2 max-w-sm rounded-lg border border-amber-400 bg-amber-50 p-3
                      text-left dark:border-amber-600/60 dark:bg-amber-950/40">
        <p className="text-sm font-semibold">Data se liší</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Nic jsem nepřepsal — vyber, co platí.
        </p>
        <ul className="mt-2 text-xs">
          <li>Na serveru (z jiného zařízení): {popis(stav.server.data)}</li>
          <li>V tomhle prohlížeči: {popis(stav.mistni)}</li>
        </ul>
        <div className="mt-2 flex gap-2">
          <button onClick={() => rizeni?.vezmiServerova()}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
            Vzít data ze serveru
          </button>
          <button onClick={() => rizeni?.vezmiMistni()}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-600">
            Nahrát moje
          </button>
        </div>
      </div>
    );
  }

  const text =
    stav.druh === "nacitam" ? "Načítám data…"
    : stav.druh === "chyba" ? stav.zprava
    : stav.druh === "jenCteni" ? stav.duvod
    : stav.ukladam ? "Ukládám…"
    : "Data se ukládají i na server.";

  const barva = stav.druh === "chyba" || stav.druh === "jenCteni"
    ? "text-amber-700 dark:text-amber-400"
    : "text-slate-500";

  return <p className={`mt-1 text-xs ${barva}`}>{text}</p>;
}
