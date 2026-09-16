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
import type { Cesta, StavCesty, TypCeny, VysledekCest } from "@albion/jadro";
import {
  kamSeProdava, konfigProKlic,
  type KonfigDilny, type StavDilny, type VysledekDilny,
} from "../stav/dilna";
import type { RezimCeny } from "../stav/sken";
import type { SkladCen } from "../stav/skladCen";
import {
  poKliknutiNaSloupec, tierZKlice, type NastaveniFiltru, type Razeni,
} from "../stav/filtrDilny";
import type { DefiniceSloupce, SloupecId } from "../stav/sloupceDilny";
import { barvaHodnoty, barvaStari, cislo, procenta, seZnamenkem, stari } from "./format";
import { OdznakLikvidity, ZnackaFantomu } from "./OdznakLikvidity";
import { PoleCeny } from "./PoleCeny";
import { NastaveniPolozky } from "./TabDilna";

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
                  {/* Minimální šířka, ať se název neláme po jednotlivých slovech. */}
                  <td className="min-w-[13rem] px-3 py-2">
                    <button onClick={() => p.otevritDetail(v.klic)}
                            className="text-left font-medium hover:underline">
                      {nazev}
                    </button>
                    {!v.cesty?.metriky && (
                      <p className="text-xs text-slate-500">
                        {popisChybejicich(v, nazev, p.nazevPolozky)}
                      </p>
                    )}
                  </td>

                  {p.sloupce.map((s) => (
                    <Bunka key={s.id} sloupec={s} vysledek={v} davka={p.davka}
                           efektivni={efektivni} override={override}
                           rozbaleny={jeRozbaleny}
                           prepniRozbaleni={() => setRozbaleny(jeRozbaleny ? null : v.klic)}
                           sklad={p.sklad} rezimProdeje={p.rezimProdeje}
                           poZmeneCeny={p.poZmeneCeny} nazevPolozky={p.nazevPolozky} />
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
                      {(v.cesty?.metriky?.marze ?? 0) > PRAH_PODEZRELE_MARZE && (
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
  // Hlavičky se nezalamují — „Koupit / ks" na dvou řádcích jen bere výšku.
  const trida = `whitespace-nowrap px-3 py-2 ${vpravo ? "text-right" : ""}`;
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
                 prepniRozbaleni, sklad, rezimProdeje, poZmeneCeny, nazevPolozky }: {
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
  nazevPolozky: (zaklad: string, enchant: number) => string;
}) {
  // Zisk, marže a spol. z NEJLEVNĚJŠÍ cesty (F12), ne z řádku skenu —
  // ten nese jen výrobu ze surovin.
  const v = vysledek.cesty?.metriky ?? null;
  const cesty = vysledek.cesty;
  // Čísla se nezalamují: „2 434 560" rozdělené na dva řádky se špatně čte.
  const trida = `whitespace-nowrap px-3 py-2 ${sloupec.vpravo ? "text-right" : ""}`;
  const prazdno = <td className={trida}>—</td>;

  switch (sloupec.id as SloupecId) {
    case "kdeKam": {
      // V tabulce zkráceně („BM"), plný popis je v rozbaleném nastavení.
      const kdeKam = `${vysledek.mesto} → ${efektivni.naBM ? "BM" : "místní"}`;
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
      return v && cesty?.vitez
        ? (
          <td className={`${trida} font-semibold ${barvaHodnoty(v.zisk)}`}>
            {seZnamenkem(v.zisk)}
            {/* Z čeho číslo vzniklo — bez toho by nešlo poznat, proč se
                zisk liší od rozpadu výroby v detailu. */}
            <span className="ml-1 text-[10px] font-normal uppercase text-slate-400">
              {POPIS_CESTY[cesty.vitez]}
            </span>
          </td>
        )
        : prazdno;

    case "marze":
      return v ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{procenta(v.marze)}</td> : prazdno;

    case "ziskNaKus":
      return v ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.ziskNaKus)}</td> : prazdno;

    // Zisk na kg a na focus u některých položek neexistuje (nemají váhu,
    // nevyrábí se s focusem). Prázdno, ne nula — nula by tvrdila, že to
    // spočítané je a vyšlo nic.
    case "ziskNaKg":
      return v?.ziskNaKg != null
        ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.ziskNaKg)}</td>
        : prazdno;

    case "ziskNaFocus":
      return v?.ziskNaFocus != null
        ? <td className={`${trida} ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.ziskNaFocus)}</td>
        : prazdno;

    case "tier": {
      const t = tierZKlice(vysledek.klic);
      return <td className={trida}>{t === null ? "—" : `T${t}`}</td>;
    }

    case "koupit":
    case "vyrobit":
    case "enchantovat":
      return cesty
        ? <BunkaCesty cesta={sloupec.id as Cesta} cesty={cesty} trida={trida} nazevPolozky={nazevPolozky} />
        : prazdno;

    case "trzba":
      return cesty?.trzba
        ? <td className={trida}>{cislo(cesty.trzba.trzbaHruba / Math.max(1, davka), 0)}</td>
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

/** Stejný práh jako „podezřelá marže" ve skenu. */
const PRAH_PODEZRELE_MARZE = 3;

const POPIS_CESTY: Record<Cesta, string> = {
  koupit: "koupit", vyrobit: "vyrobit", enchantovat: "enchant",
};

function nazvyChybejicich(
  s: StavCesty, nazevPolozky: (zaklad: string, enchant: number) => string,
): string {
  return s.ok ? "" : s.chybejici.map((c) => nazevPolozky(c.zaklad, c.enchant)).join(", ");
}

/**
 * Náklad na kus jedné cesty.
 *
 * Nejlevnější cesta je zeleně — podle ní se počítá zisk. Nedostupná cesta
 * má „—" a titulek s důvodem: „tahle cesta u položky není" a „chybí cena X"
 * jsou dvě různé věci a uživatel musí vědět, jestli má co doplnit.
 */
function BunkaCesty({ cesta, cesty, trida, nazevPolozky }: {
  cesta: Cesta;
  cesty: VysledekCest;
  trida: string;
  nazevPolozky: (zaklad: string, enchant: number) => string;
}) {
  const s = cesty[cesta];
  if (!s.ok) {
    const titulek = s.duvod === "neexistuje"
      ? "Tahle cesta u položky není"
      : `Chybí cena: ${nazvyChybejicich(s, nazevPolozky)}`;
    return (
      <td className={`${trida} text-slate-400`} title={titulek}>
        {s.duvod === "chybi-cena" ? <span className="cursor-help underline decoration-dotted">?</span> : "—"}
      </td>
    );
  }
  const vitez = cesty.vitez === cesta;
  return (
    <td className={`${trida} ${vitez
      ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`}
        title={vitez ? "Nejlevnější cesta — z ní se počítá zisk" : undefined}>
      {cislo(s.nakladNaKus, 0)}
    </td>
  );
}

/**
 * Proč řádek nemá zisk.
 *
 * Bez prodejní ceny se zisk nespočítá nikdy. S prodejní cenou chybí
 * ceny u všech tří cest — vypíše se, co doplnit, bez duplicit.
 */
function popisChybejicich(
  v: VysledekDilny, nazev: string, nazevPolozky: (zaklad: string, enchant: number) => string,
): string {
  const c = v.cesty;
  if (!c) return "Zatím bez ceny";
  if (!c.trzba) return `Chybí prodejní cena: ${nazev}`;
  const chybi = new Set<string>();
  for (const s of [c.koupit, c.vyrobit, c.enchantovat]) {
    if (s.ok || s.duvod !== "chybi-cena") continue;
    for (const x of s.chybejici) chybi.add(nazevPolozky(x.zaklad, x.enchant));
  }
  return chybi.size > 0 ? `Chybí cena: ${[...chybi].join(", ")}` : "Zatím bez ceny";
}
