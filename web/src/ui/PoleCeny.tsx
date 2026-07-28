/**
 * Cenové políčko s ruční editací.
 *
 * Rozepsaná hodnota žije v políčku, dokud v něm edituješ; do skladu se
 * zapíše až při opuštění (blur). Zápis spouští přepočet, a ten by uprostřed
 * psaní pole přebil — proto se drží lokálně. Stejný vzor jako v detailu.
 */

import { useEffect, useRef, useState } from "react";
import type { TypCeny } from "@albion/jadro";
import type { SkladCen } from "../stav/skladCen";
import { barvaStari, stari } from "./format";

function stariZ(cas: string): number {
  return (Date.now() - new Date(cas.endsWith("Z") ? cas : `${cas}Z`).getTime()) / 3_600_000;
}

export function PoleCeny(props: {
  mesto: string;
  zaklad: string;
  enchant: number;
  typ: TypCeny;
  sklad: SkladCen;
  poZmene: () => void;
}) {
  const { mesto, zaklad, enchant, typ, sklad } = props;
  const cena = sklad.ziskej(mesto, zaklad, enchant, typ);
  const rucni = sklad.jeRucne(mesto, zaklad, enchant, typ);

  const [rozepsane, setRozepsane] = useState<string | null>(null);
  const cekajiciRef = useRef<string | null>(null);

  function dorucit() {
    const text = cekajiciRef.current;
    cekajiciRef.current = null;
    setRozepsane(null);
    if (text === null) return;
    if (text === "") sklad.zrusRucne(mesto, zaklad, enchant, typ);
    else sklad.ulozRucne(mesto, zaklad, enchant, typ, Number(text));
    props.poZmene();
  }

  // Odpojení nesmí sníst rozepsanou cenu — je to vědomá práce uživatele.
  useEffect(() => () => {
    const text = cekajiciRef.current;
    if (text === null) return;
    if (text === "") sklad.zrusRucne(mesto, zaklad, enchant, typ);
    else sklad.ulozRucne(mesto, zaklad, enchant, typ, Number(text));
    props.poZmene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min={0} step={1}
        value={rozepsane ?? (cena?.hodnota ?? "")}
        placeholder="zadej cenu"
        onChange={(e) => { setRozepsane(e.target.value); cekajiciRef.current = e.target.value; }}
        onBlur={dorucit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
                   dark:border-slate-700 dark:bg-slate-950"
      />
      {rucni ? (
        <button
          onClick={() => {
            cekajiciRef.current = null;
            setRozepsane(null);
            sklad.zrusRucne(mesto, zaklad, enchant, typ);
            props.poZmene();
          }}
          title="Zahodit ruční hodnotu a vzít cenu z AODP při dalším skenu"
          className="whitespace-nowrap rounded border border-amber-500 px-2 py-1 text-xs
                     text-amber-600 dark:text-amber-400">
          ručně ✕
        </button>
      ) : cena?.cas ? (
        <span className={`whitespace-nowrap text-xs ${barvaStari(stariZ(cena.cas))}`}>
          {stari(stariZ(cena.cas))}
        </span>
      ) : (
        <span className="whitespace-nowrap text-xs text-slate-400">—</span>
      )}
    </div>
  );
}
