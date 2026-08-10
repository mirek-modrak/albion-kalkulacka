/**
 * Tabulka Refiningu.
 *
 * Sloupce se vykreslují ze [seznamu definic](../stav/sloupceRefiningu.ts),
 * ne natvrdo — uživatel si je zapíná a vypíná.
 *
 * Řádek bez ceny **neslévá buňky**: v číselných sloupcích je „—" a hláška
 * o chybějící ceně stojí u názvu. Díky tomu jde i u takového řádku rovnou
 * přepsat prodejní cenu — a právě tam to člověk potřebuje nejvíc.
 * (Stejné rozhodnutí jako v Dílně.)
 */

import { Fragment, useState } from "react";
import type { TypCeny } from "@albion/jadro";
import {
  jeAutoProdej, jeAutoRefining, kamSeProdavaRefining, konfigProKlicRefiningu, mestoSBonusem,
  type KonfigRefiningu, type StavRefiningu, type VysledekRefiningu,
} from "../stav/refining";
import type { RezimCeny } from "../stav/sken";
import type { SkladCen } from "../stav/skladCen";
import {
  poKliknutiNaSloupec, tierZKlice, type NastaveniFiltru, type Razeni,
} from "../stav/filtrDilny";
import type { DefiniceSloupce } from "../stav/sloupceDilny";
import type { SloupecRefiningu } from "../stav/sloupceRefiningu";
import { barvaHodnoty, barvaStari, cislo, procenta, seZnamenkem, stari } from "./format";
import { OdznakLikvidity, ZnackaFantomu } from "./OdznakLikvidity";
import { PoleCeny } from "./PoleCeny";
import { NastaveniPolozkyRefiningu, popisMesta } from "./TabRefining";

interface Props {
  vysledky: VysledekRefiningu[];
  stav: StavRefiningu;
  davka: number;
  sloupce: readonly DefiniceSloupce<SloupecRefiningu>[];
  filtr: NastaveniFiltru;
  setFiltr: (f: NastaveniFiltru) => void;
  sklad: SkladCen;
  rezimProdeje: RezimCeny;
  poZmeneCeny: () => void;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  odebrat: (klic: string) => void;
  setOverride: (klic: string, konfig: KonfigRefiningu | null) => void;
  /** Ruční prodejní cena zafixuje město — jinak by políčko „uteklo" jinam. */
  zafixujProdej: (klic: string, mesto: string) => void;
  otevritDetail: (klic: string) => void;
}

export function TabulkaRefiningu(p: Props) {
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
            const efektivni = konfigProKlicRefiningu(p.stav, v.klic);
            const override = p.stav.override[v.klic];
            const jeRozbaleny = rozbaleny === v.klic;

            return (
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
                           poZmeneCeny={p.poZmeneCeny}
                           zafixujProdej={() => p.zafixujProdej(v.klic, v.prodej)} />
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
                      <Rozklik vysledek={v} efektivni={efektivni} globalni={p.stav.konfig}
                               override={override} davka={p.davka}
                               nazevPolozky={p.nazevPolozky}
                               setOverride={(k) => p.setOverride(v.klic, k)} />
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
 * Kliknutí na tentýž sloupec obrátí směr, na jiný začne od výchozího.
 * Sloupce bez řazení (města, editovatelná cena) se nechovají jako tlačítko,
 * ať to nemate.
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
                 prepniRozbaleni, sklad, rezimProdeje, poZmeneCeny, zafixujProdej }: {
  sloupec: DefiniceSloupce<SloupecRefiningu>;
  vysledek: VysledekRefiningu;
  davka: number;
  efektivni: KonfigRefiningu;
  override: KonfigRefiningu | undefined;
  rozbaleny: boolean;
  prepniRozbaleni: () => void;
  sklad: SkladCen;
  rezimProdeje: RezimCeny;
  poZmeneCeny: () => void;
  zafixujProdej: () => void;
}) {
  const v = vysledek.radek?.vysledek ?? null;
  const trida = `px-3 py-2 ${sloupec.vpravo ? "text-right" : ""}`;
  const prazdno = <td className={trida}>—</td>;

  switch (sloupec.id) {
    case "kdeKoupit":
      return (
        <td className={trida}>
          <button onClick={prepniRozbaleni}
                  title="Změnit nastavení jen pro tuhle položku"
                  className={`text-xs ${override
                    ? "font-semibold text-amber-600 dark:text-amber-400"
                    : "text-slate-500"}`}>
            🔧 {popisMesta(vysledek.nakup)} {rozbaleny ? "▾" : "▸"}
          </button>
        </td>
      );

    case "kdeRefinovat": {
      // Město bez bonusu na TUHLE surovinu je nejčastější tichá chyba
      // refiningu: všechno se počítá správně, jen se vyrábí o třetinu míň.
      const spravne = mestoSBonusem(vysledek.radek?.polozka?.kategorie);
      const maBonus = spravne !== undefined && spravne === vysledek.refining;
      return (
        <td className={trida}>
          <span className="text-xs">
            {vysledek.refining}
            {maBonus
              ? <span title="Tohle město má bonus na tuhle surovinu"> ⭐</span>
              : spravne && (
                <span title={`Bez bonusu na tuhle surovinu — ten má ${spravne}`}
                      className="text-amber-600 dark:text-amber-400"> ⚠</span>
              )}
          </span>
          {vysledek.tesnyVitez && (
            <div className="text-[11px] text-slate-500"
                 title="Rozdíl je v šumu — druhé město je prakticky stejné">
              ≈ {vysledek.tesnyVitez.refining}
            </div>
          )}
        </td>
      );
    }

    case "kdeProdat":
      return <td className={trida}><span className="text-xs">{vysledek.prodej}</span></td>;

    case "vraceni":
      return v
        ? (
          <td className={trida} title={v.bonus.slozky.map(
                (s) => `${s.popis}: ${cislo(s.hodnota, 0)}`).join(" + ")}>
            {procenta(v.bonus.returnRate)}
          </td>
        )
        : prazdno;

    case "prodej": {
      // Zapisuje se PŘESNĚ tam, odkud výpočet čte — jinak by uživatel zadal
      // číslo a zisk by se nezměnil.
      const kam = kamSeProdavaRefining(vysledek, rezimProdeje);
      const [zaklad, e] = vysledek.klic.split("#");
      return (
        <td className="px-3 py-2">
          <PoleCeny mesto={kam.mesto} zaklad={zaklad ?? ""} enchant={Number(e ?? 0)}
                    typ={kam.typ as TypCeny} sklad={sklad}
                    poZmene={() => { zafixujProdej(); poZmeneCeny(); }} />
        </td>
      );
    }

    case "zisk":
      return v
        ? <td className={`${trida} font-semibold ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.zisk)}</td>
        : prazdno;

    case "marze":
      return v ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{procenta(v.marze)}</td> : prazdno;

    case "ziskNaKus":
      return v ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.ziskNaKus)}</td> : prazdno;

    // Zisk na kg a na focus u některých položek neexistuje. Prázdno, ne nula —
    // nula by tvrdila, že to spočítané je a vyšlo nic.
    case "ziskNaKg":
      return v?.ziskNaKg != null
        ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.ziskNaKg)}</td>
        : prazdno;

    case "ziskNaFocus":
      return v?.ziskNaFocus != null
        ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.ziskNaFocus)}</td>
        : prazdno;

    case "naklad":
      return v ? <td className={trida}>{cislo(v.nakladyCelkem / Math.max(1, davka), 0)}</td> : prazdno;

    case "trzba":
      return v ? <td className={trida}>{cislo(v.trzbaHruba / Math.max(1, davka), 0)}</td> : prazdno;

    case "nizsiTier": {
      const r = vysledek.nizsiTier;
      if (!r || r.usporaVyrobou === null) return prazdno;
      const vyrobit = r.zpusob === "vyrobit";
      return (
        <td className={trida}>
          <span className={`text-xs ${vyrobit ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}
                title={`Na trhu ${cislo(r.cenaNaTrhu ?? 0)}, vlastní výrobou ${cislo(r.nakladVyrobou ?? 0)}`}>
            {vyrobit ? `vyrobit −${procenta(r.usporaVyrobou, 0)}` : "koupit"}
          </span>
        </td>
      );
    }

    case "jizdy":
      return v
        ? (
          <td className={trida}>
            <span className="text-xs text-slate-500">
              {cislo(v.vahaNakupu, 0)} kg
              {vysledek.jizdDoRefiningu !== null && ` · ${vysledek.jizdDoRefiningu}× do dílny`}
              {vysledek.jizdDoProdeje !== null && ` · ${vysledek.jizdDoProdeje}× na trh`}
            </span>
          </td>
        )
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

    case "tier": {
      const t = tierZKlice(vysledek.klic);
      return <td className={trida}>{t === null ? "—" : `T${t}`}</td>;
    }

    default:
      return prazdno;
  }
}

/**
 * Rozklik řádku: nastavení jen pro tuhle položku + nákupní seznam.
 *
 * Nákupní seznam je tu proto, že „vyplatí se to" a „co mám nakoupit"
 * jsou dvě různé otázky a druhá se u tržnice řeší mnohem častěji.
 */
function Rozklik({ vysledek, efektivni, globalni, override, davka, nazevPolozky, setOverride }: {
  vysledek: VysledekRefiningu;
  efektivni: KonfigRefiningu;
  globalni: KonfigRefiningu;
  override: KonfigRefiningu | undefined;
  davka: number;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  setOverride: (k: KonfigRefiningu | null) => void;
}) {
  const bonus = vysledek.radek?.vysledek?.bonus;

  return (
    <div className="space-y-2">
      <NastaveniPolozkyRefiningu efektivni={efektivni} globalni={globalni}
                                 override={override} setOverride={setOverride} />

      {vysledek.vstupy.length > 0 && (
        <div className="text-xs text-slate-600 dark:text-slate-400">
          <b>Na {cislo(davka)} ks kup:</b>{" "}
          {vysledek.vstupy.map((vs) => (
            <span key={`${vs.zaklad}#${vs.enchant}`} className="mr-3 whitespace-nowrap">
              {cislo(vs.kusu)}× {nazevPolozky(vs.zaklad, vs.enchant)}
              <span className="text-slate-400"> ({vs.mesto}
                {vs.cena !== null && `, ${cislo(vs.cena)}`})</span>
            </span>
          ))}
        </div>
      )}

      {bonus && !bonus.rucni && (
        <div className="text-xs text-slate-500">
          <b>Vrácení {procenta(bonus.returnRate)}</b> ={" "}
          {bonus.slozky.map((s) => `${s.popis} ${cislo(s.hodnota, 0)}`).join(" + ")}
          {bonus.slozky.length > 1 && ` = ${cislo(bonus.bonusCelkem, 0)}`}
          {" — z každé dávky se ti vrátí tenhle podíl surovin."}
        </div>
      )}

      {vysledek.tesnyVitez && jeAutoRefining(efektivni) && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {vysledek.tesnyVitez.refining} je prakticky stejně dobrý
          ({seZnamenkem(vysledek.tesnyVitez.zisk)}) — rozdíl je v šumu cen,
          ne v tom, kde se vyplatí vyrábět.
        </p>
      )}

      {jeAutoProdej(efektivni) && (
        <p className="text-xs text-slate-500">
          Město prodeje vybírá aplikace. Když do prodejní ceny zapíšeš vlastní
          hodnotu, město se zafixuje — jinak by ti políčko uteklo jinam.
        </p>
      )}

      {vysledek.radek?.stav === "podezrele" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">podezřelá marže</p>
      )}
    </div>
  );
}
