/**
 * Přihlašovací zeď (F9c).
 *
 * Dokud brána nepustí, aplikace se **vůbec nevykreslí** — není to jen
 * schování rozhraní. Povolení uděluje Firestore, ne prohlížeč: brána se
 * zkusí přečíst vlastní data a řídí se odpovědí serveru.
 *
 * Kdo tu nikdy přihlášený nebyl, uvidí přihlašovací obrazovku **bez toho,
 * aby se stahoval Firebase** — velký balík se načte až po kliknutí.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  posledniOvereni, prelozChybu, rozhodni, zapisOvereni, type StavBrany,
} from "../stav/brana";
import {
  ChybaDat, ChybaPrihlaseni, bylPrihlasen, nactiZeServeru, odhlas, prihlas,
  sledujPrihlaseni, type Uzivatel,
} from "../stav/sync";

export function Brana({ children }: { children: (u: Uzivatel) => ReactNode }) {
  const [uzivatel, setUzivatel] = useState<Uzivatel | null>(null);
  const [stav, setStav] = useState<StavBrany>(
    bylPrihlasen() ? { druh: "zjistuji" } : { druh: "prihlasSe" },
  );
  const [pracuje, setPracuje] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  // Obnovení přihlášení z minula. Firebase se načítá jen tehdy, když tu
  // někdo přihlášený už byl.
  useEffect(() => {
    if (!bylPrihlasen()) return;
    let ukonci: (() => void) | undefined;
    let zrusen = false;
    sledujPrihlaseni((u) => {
      setUzivatel(u);
      if (!u) setStav({ druh: "prihlasSe" });
    })
      .then((f) => { if (zrusen) f(); else ukonci = f; })
      .catch(() => setStav({ druh: "prihlasSe" }));
    return () => { zrusen = true; ukonci?.(); };
  }, []);

  // Ověření u serveru pokaždé, když se změní přihlášený uživatel.
  const email = uzivatel?.email ?? null;
  useEffect(() => {
    if (!email) return;
    let zrusen = false;
    setStav({ druh: "zjistuji" });
    (async () => {
      let odpoved: "povoleno" | "odepreno" | "nedostupno";
      try {
        await nactiZeServeru(email);
        odpoved = "povoleno";
      } catch (e) {
        odpoved = prelozChybu(e instanceof ChybaDat ? e.kod : undefined);
      }
      if (zrusen) return;
      const ted = Date.now();
      if (odpoved === "povoleno") zapisOvereni(email, ted);
      setStav(rozhodni(odpoved, posledniOvereni(email), ted));
    })();
    return () => { zrusen = true; };
  }, [email]);

  async function klikPrihlasit() {
    setPracuje(true);
    setChyba(null);
    try {
      setUzivatel(await prihlas());
      sledujPrihlaseni((u) => {
        setUzivatel(u);
        if (!u) setStav({ druh: "prihlasSe" });
      }).catch(() => {});
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
    } catch {
      // I když odhlášení selže, zpátky na přihlašovací obrazovku.
    } finally {
      setUzivatel(null);
      setStav({ druh: "prihlasSe" });
      setPracuje(false);
    }
  }

  if (stav.druh === "pusteno" && uzivatel) {
    return (
      <>
        {stav.offline && (
          <p className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-900
                        dark:bg-amber-950 dark:text-amber-300">
            Pracuješ offline — data se zatím neukládají do účtu.
          </p>
        )}
        {children(uzivatel)}
      </>
    );
  }

  return (
    <Obrazovka>
      {stav.druh === "zjistuji" && <p className="text-sm text-slate-500">Ověřuji přístup…</p>}

      {stav.druh === "prihlasSe" && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Kalkulačka je jen pro pozvané. Přihlas se účtem Google, který ti Mirek povolil.
          </p>
          <button onClick={klikPrihlasit} disabled={pracuje}
                  className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold
                             text-white disabled:opacity-50">
            {pracuje ? "Přihlašuji…" : "Přihlásit přes Google"}
          </button>
        </>
      )}

      {stav.druh === "odepreno" && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {stav.duvod === "neniNaSeznamu"
              ? `Účet ${uzivatel?.email ?? ""} nemá přístup. Napiš Mirkovi, ať tě přidá.`
              : "Server je nedostupný a od posledního ověření uplynulo víc než 7 dní. Připoj se k internetu a zkus to znovu."}
          </p>
          <button onClick={klikOdhlasit} disabled={pracuje}
                  className="mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-sm
                             disabled:opacity-50 dark:border-slate-600">
            Odhlásit a zkusit jiný účet
          </button>
          <p className="mt-3 text-xs text-slate-500">
            Data, která máš v tomhle prohlížeči, zůstávají nedotčená.
          </p>
        </>
      )}

      {chyba && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{chyba}</p>}
    </Obrazovka>
  );
}

function Obrazovka({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold">Albion — kde se nejvíc vydělá</h1>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
