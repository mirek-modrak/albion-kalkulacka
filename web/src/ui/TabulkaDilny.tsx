/**
 * Tabulkový pohled na Dílnu.
 *
 * Sloupce se vykreslují ze [seznamu definic](../stav/sloupceDilny.ts), ne
 * natvrdo — uživatel si je může zapínat a vypínat.
 *
 * Řádek bez ceny **neslévá buňky** (dřív `colSpan`): v číselných sloupcích
 * je „—" a hláška o chybějící ceně je u názvu. Díky tomu jde i u takového
 * řádku rovnou přepsat prodejní cenu — a právě tam to člověk potřebuje
 * nejvíc.
 */

import { Fragment, useState } from "react";
import type { TypCeny } from "@albion/jadro";
import {
  AUTO_MESTO, kamSeProdava, konfigProKlic,
  type KonfigDilny, type StavDilny, type VysledekDilny,
} from "../stav/dilna";
import type { RezimCeny } from "../stav/sken";
import type { SkladCen } from "../stav/skladCen";
import { poKliknutiNaSloupec, type NastaveniFiltru, type Razeni } from "../stav/filtrDilny";
import type { DefiniceSloupce, SloupecId } from "../stav/sloupceDilny";
import { barvaHodnoty, barvaStari, cislo, procenta, seZnamenkem, stari } from "./format";
import { OdznakLikvidity, ZnackaFantomu } from "./OdznakLikvidity";
import { PoleCeny } from "./PoleCeny";
import { NastaveniPolozky, popisKonfigu } from "./TabDilna";

interface Props {
  vysledky: VysledekDilny[];
  stav: StavDilny;
  davka: number;
  sloupce: DefiniceSloupce[];
  filtr: NastaveniFiltru;
  setFiltr: (f: NastaveniFiltru) => void;
  sklad: SkladCen;
  rezimProdeje: RezimCeny;
  poZmeneCeny: () => void;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  odebrat: (klic: string) => void;
  setOverride: (klic: string, konfig: KonfigDilny | null) => void;
  otevritDetail: (klic: string) => void;
}

export function TabulkaDilny(p: Props) {
  const [rozbaleny, setRozbaleny] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr className="border-b border-slate-200 dark:border-slate-800">
            <Hlavicka sloupec="nazev" filtr={p.filtr} setFiltr={p.setFiltr}>Položka</Hlavicka>
            {p.sloupce.map((s) => (
              <Hlavicka key={s.id} sloupec={s.razeni} vpravo={s.vpravo}
                        filtr={p.filtr} setFiltr={p.setFiltr}>
                {s.id === "zisk" ? `Zisk / ${cislo(p.davka)} ks` : s.nazev}
              </Hlavicka>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {p.vysledky.map((v) => {
            const [zaklad, e] = v.klic.split("#");
            const nazev = v.radek?.nazev ?? p.nazevPolozky(zaklad ?? "", Number(e ?? 0));
            const efektivni = konfigProKlic(p.stav, v.klic);
            const override = p.stav.override[v.klic];
            const jeRozbaleny = rozbaleny === v.klic;

            return (
              // Klíč patří na fragment, ne na vnitřní `tr` — řádek s detailem
              // je druhý potomek téhož prvku seznamu.
              <Fragment key={v.klic}>
                <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50
                               dark:border-slate-800/60 dark:hover:bg-slate-900/40">
                  <td className="px-3 py-2">
                    <button onClick={() => p.otevritDetail(v.klic)}
                            className="text-left font-medium hover:underline">
                      {nazev}
                    </button>
                    {!v.radek?.vysledek && (
                      <p className="text-xs text-slate-500">
                        {v.radek?.chybejici?.length
                          ? `Chybí cena: ${v.radek.chybejici.join(", ")}`
                          : "Zatím bez ceny"}
                      </p>
                    )}
                  </td>

                  {p.sloupce.map((s) => (
                    <Bunka key={s.id} sloupec={s} vysledek={v} davka={p.davka}
                           efektivni={efektivni} override={override}
                           rozbaleny={jeRozbaleny}
                           prepniRozbaleni={() => setRozbaleny(jeRozbaleny ? null : v.klic)}
                           sklad={p.sklad} rezimProdeje={p.rezimProdeje}
                           poZmeneCeny={p.poZmeneCeny} />
                  ))}

                  <td className="px-3 py-2 text-right">
                    <button onClick={() => p.odebrat(v.klic)} title="Odebrat ze seznamu"
                            className="rounded px-1.5 text-slate-400 hover:bg-slate-100
                                       dark:hover:bg-slate-800">✕</button>
                  </td>
                </tr>

                {jeRozbaleny && (
                  <tr className="border-b border-slate-100 dark:border-slate-800/60">
                    <td colSpan={p.sloupce.length + 2}
                        className="bg-slate-50 px-3 py-2 dark:bg-slate-950/60">
                      <NastaveniPolozky
                        efektivni={efektivni} globalni={p.stav.konfig} override={override}
                        setOverride={(k) => p.setOverride(v.klic, k)} />
                      {v.radek?.stav === "podezrele" && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          podezřelá marže
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Klikatelná hlavička sloupce.
 *
 * Kliknutí na tentýž sloupec obrátí směr, na jiný začne od výchozího —
 * u peněz shora, u názvu a stáří odspodu. Sloupce bez řazení (editovatelná
 * cena) se nechovají jako tlačítko, ať to nemate.
 */
function Hlavicka({ sloupec, vpravo, filtr, setFiltr, children }: {
  sloupec: Razeni | undefined;
  vpravo?: boolean;
  filtr: NastaveniFiltru;
  setFiltr: (f: NastaveniFiltru) => void;
  children: React.ReactNode;
}) {
  const trida = `px-3 py-2 ${vpravo ? "text-right" : ""}`;
  if (!sloupec) return <th className={trida}>{children}</th>;

  const aktivni = filtr.razeni === sloupec;
  return (
    <th className={trida}>
      <button onClick={() => setFiltr(poKliknutiNaSloupec(filtr, sloupec))}
              title="Seřadit podle tohoto sloupce"
              className={`uppercase hover:text-slate-900 dark:hover:text-slate-200 ${
                aktivni ? "font-bold text-slate-900 dark:text-slate-200" : ""}`}>
        {children}{aktivni && (filtr.smer === "sestupne" ? " ▼" : " ▲")}
      </button>
    </th>
  );
}

function Bunka({ sloupec, vysledek, davka, efektivni, override, rozbaleny,
                 prepniRozbaleni, sklad, rezimProdeje, poZmeneCeny }: {
  sloupec: DefiniceSloupce;
  vysledek: VysledekDilny;
  davka: number;
  efektivni: KonfigDilny;
  override: KonfigDilny | undefined;
  rozbaleny: boolean;
  prepniRozbaleni: () => void;
  sklad: SkladCen;
  rezimProdeje: RezimCeny;
  poZmeneCeny: () => void;
}) {
  const v = vysledek.radek?.vysledek ?? null;
  const trida = `px-3 py-2 ${sloupec.vpravo ? "text-right" : ""}`;
  const prazdno = <td className={trida}>—</td>;

  switch (sloupec.id as SloupecId) {
    case "kdeKam": {
      const kdeKam = efektivni.mesto === AUTO_MESTO
        ? `${vysledek.mesto} → ${efektivni.naBM ? "BM" : "místní"}`
        : popisKonfigu(efektivni);
      return (
        <td className={trida}>
          <button onClick={prepniRozbaleni}
                  title="Změnit nastavení jen pro tuhle položku"
                  className={`text-xs ${override
                    ? "font-semibold text-amber-600 dark:text-amber-400"
                    : "text-slate-500"}`}>
            🔧 {kdeKam} {rozbaleny ? "▾" : "▸"}
          </button>
        </td>
      );
    }

    case "prodej": {
      // Zapisuje se PŘESNĚ tam, odkud výpočet čte — jinak by uživatel zadal
      // číslo a zisk by se nezměnil.
      const kam = kamSeProdava(vysledek, rezimProdeje);
      const [zaklad, e] = vysledek.klic.split("#");
      return (
        <td className="px-3 py-2">
          <PoleCeny mesto={kam.mesto} zaklad={zaklad ?? ""} enchant={Number(e ?? 0)}
                    typ={kam.typ as TypCeny} sklad={sklad} poZmene={poZmeneCeny} />
        </td>
      );
    }

    case "zisk":
      return v
        ? <td className={`${trida} font-semibold ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.zisk)}</td>
        : prazdno;

    case "marze":
      return v ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{procenta(v.marze)}</td> : prazdno;

    case "naklad":
      return v
        ? <td className={trida}>{cislo(v.nakladyCelkem / Math.max(1, davka), 0)}</td>
        : prazdno;

    case "trzba":
      return v
        ? <td className={trida}>{cislo(v.trzbaHruba / Math.max(1, davka), 0)}</td>
        : prazdno;

    case "likvidita":
      return (
        <td className={trida}>
          <span className="flex items-center gap-1">
            <OdznakLikvidity likvidita={vysledek.radek?.likvidita ?? null} davka={davka} />
            <ZnackaFantomu likvidita={vysledek.radek?.likvidita ?? null} />
          </span>
        </td>
      );

    case "stari":
      return vysledek.radek?.stariHodin != null
        ? (
          <td className={`${trida} text-xs ${barvaStari(vysledek.radek.stariHodin)}`}>
            {stari(vysledek.radek.stariHodin)}
          </td>
        )
        : prazdno;

    default:
      return prazdno;
  }
}
