/**
 * Karta Refining — tři města, ne jedno.
 *
 * Nahoře se nastaví, **kde kupuju, kde refinuju a kde prodávám** (globálně,
 * u položky přepsatelné), pod tím se přidávají suroviny mřížkou linka × tier
 * nebo hledáním, a dole je tabulka.
 *
 * Proč mřížka a ne jen vyhledávač jako v Dílně: refined surovin je ~115,
 * takže se dá naklikat celá řada najednou. Výbavy je 3 240 a tam by mřížka
 * byla nepoužitelná stěna.
 */

import { useMemo, useState } from "react";
import type { TypCeny } from "@albion/jadro";
import { MESTA } from "../data/hra";
import type { SkladCen } from "../stav/skladCen";
import type { RezimCeny } from "../stav/sken";
import type { ZdrojCen } from "../stav/dilna";
import {
  NAKUP_NEJLEVNEJI, NAKUP_RUZNA_MESTA, PRODEJ_NEJLEPSI,
  REFINING_NEJL_BONUS, REFINING_NEJV_ZISK,
  jeAutoNakup, jeAutoProdej, jeAutoRefining, katalogRefiningu, klicRefiningu, mestoSBonusem,
  type KonfigRefiningu, type StavRefiningu, type VysledekRefiningu,
} from "../stav/refining";
import {
  KLIC_FILTRU_REFININGU,
  dostupneEnchanty, dostupneTiery, filtrujARad, nactiFiltr, ulozFiltr, vychoziSmer,
  type NastaveniFiltru,
} from "../stav/filtrDilny";
import {
  SLOUPCE_REFININGU, nactiSkryteRefiningu, prepniSloupecRefiningu, skryvameRazeniRefiningu,
  ulozSkryteRefiningu, viditelneRefiningu, type SloupecRefiningu,
} from "../stav/sloupceRefiningu";
import { FILTR_MESTO_PRODEJE, FILTR_MESTO_REFININGU, FiltrRefiningu } from "./FiltrRefiningu";
import { PanelSurovinRefiningu } from "./PanelSurovinRefiningu";
import { PresetyRefiningu } from "./PresetyRefiningu";
import { TabulkaRefiningu } from "./TabulkaRefiningu";
import { VolbaSloupcu } from "./VolbaSloupcu";
import { cislo } from "./format";

interface Props {
  vysledky: VysledekRefiningu[];
  stav: StavRefiningu;
  sklad: SkladCen;
  davka: number;
  typNakup: TypCeny;
  rezimProdeje: RezimCeny;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  uprav: (stav: StavRefiningu) => void;
  zafixujProdej: (klic: string, mesto: string) => void;
  poZmeneCeny: () => void;
  otevritDetail: (klic: string) => void;
}

/** Lidský popis města, včetně sentinelů. Jedno místo pravdy pro celou kartu. */
export function popisMesta(mesto: string): string {
  switch (mesto) {
    case NAKUP_NEJLEVNEJI: return "nejlevněji";
    case NAKUP_RUZNA_MESTA: return "různá města";
    case REFINING_NEJL_BONUS: return "nejlepší bonus";
    case REFINING_NEJV_ZISK: return "nejvyšší zisk";
    case PRODEJ_NEJLEPSI: return "nejlepší cena";
    default: return mesto;
  }
}

export function TabRefining(p: Props) {
  const [filtr, setFiltr] = useState(
    () => nactiFiltr(KLIC_FILTRU_REFININGU, SLOUPCE_REFININGU),
  );
  const zmenFiltr = (f: NastaveniFiltru) => {
    setFiltr(f);
    ulozFiltr(f, KLIC_FILTRU_REFININGU);
  };

  const [skryteSloupce, setSkryteSloupce] = useState(nactiSkryteRefiningu);
  const sloupce = useMemo(() => viditelneRefiningu(skryteSloupce), [skryteSloupce]);

  const prepniSloupecUI = (id: SloupecRefiningu) => {
    const nove = prepniSloupecRefiningu(skryteSloupce, id);

    // Vypnutí sloupce, podle kterého se zrovna řadí, by tabulku seřadilo
    // podle něčeho neviditelného. Přepneme na první zapnutý sloupec, který
    // řadit umí — a když žádný nezbyde, aspoň na název (ten je natvrdo).
    if (!skryteSloupce.includes(id) && skryvameRazeniRefiningu(id, filtr.razeni)) {
      const nahrada = viditelneRefiningu(nove).find((s) => s.razeni)?.razeni ?? "nazev";
      zmenFiltr({ ...filtr, razeni: nahrada, smer: vychoziSmer(nahrada) });
    }

    setSkryteSloupce(nove);
    ulozSkryteRefiningu(nove);
  };

  const { zobrazene, skryto } = useMemo(
    () => filtrujARad(p.vysledky, filtr, {
      nazev: (v) => v.radek?.nazev
        ?? p.nazevPolozky(v.klic.split("#")[0] ?? "", Number(v.klic.split("#")[1] ?? 0)),
      // „Skupina" je tu linka: ruda, kůže, vlákno, dřevo, kámen.
      skupina: (v) => v.radek?.polozka?.kategorie ?? null,
      extra: (v, klic) => klic === FILTR_MESTO_REFININGU ? v.refining
        : klic === FILTR_MESTO_PRODEJE ? v.prodej
          : null,
      // Úspora vlastní výrobou nižšího tieru nesedí na `RadekSkenu`,
      // takže ji sdílený filtr sám spočítat nemůže.
      hodnota: (v, r) => r === "usporaVyrobou"
        ? v.nizsiTier?.usporaVyrobou ?? -1
        : undefined,
    }),
    [p.vysledky, filtr, p.nazevPolozky],
  );

  // Nabízet jen města, která se v seznamu opravdu vyskytují.
  const mestaRefiningu = useMemo(
    () => [...new Set(p.vysledky.map((v) => v.refining))].sort(),
    [p.vysledky],
  );
  const mestaProdeje = useMemo(
    () => [...new Set(p.vysledky.map((v) => v.prodej))].sort(),
    [p.vysledky],
  );

  const prepnout = (klic: string) => {
    if (p.stav.klice.includes(klic)) {
      const override = { ...p.stav.override };
      delete override[klic];
      p.uprav({ ...p.stav, klice: p.stav.klice.filter((k) => k !== klic), override });
    } else {
      p.uprav({ ...p.stav, klice: [...p.stav.klice, klic] });
    }
  };

  const odebrat = (klic: string) => {
    const override = { ...p.stav.override };
    delete override[klic];
    p.uprav({ ...p.stav, klice: p.stav.klice.filter((k) => k !== klic), override });
  };

  const nastavOverride = (klic: string, konfig: KonfigRefiningu | null) => {
    const override = { ...p.stav.override };
    if (konfig === null) delete override[klic];
    else override[klic] = konfig;
    p.uprav({ ...p.stav, override });
  };

  return (
    <div className="space-y-3">
      <GlobalniNastaveni
        konfig={p.stav.konfig}
        setKonfig={(konfig) => p.uprav({ ...p.stav, konfig })}
        zdroj={p.stav.zdrojCen}
        setZdroj={(zdrojCen: ZdrojCen) => p.uprav({ ...p.stav, zdrojCen })}
        presety={<PresetyRefiningu stav={p.stav} uprav={p.uprav} />}
      />

      <Mrizka klice={p.stav.klice} prepnout={prepnout} />

      {p.stav.klice.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center
                        text-sm text-slate-500 dark:border-slate-700">
          Zatím prázdno. Klikni nahoře do mřížky na tier, který refinuješ.
        </div>
      ) : (
        <>
          <PanelSurovinRefiningu stav={p.stav} sklad={p.sklad} typNakup={p.typNakup}
                                 nazevPolozky={p.nazevPolozky} poZmeneCeny={p.poZmeneCeny} />

          <FiltrRefiningu filtr={filtr} setFiltr={zmenFiltr}
                          tiery={dostupneTiery(p.vysledky)}
                          enchanty={dostupneEnchanty(p.vysledky)}
                          mestaRefiningu={mestaRefiningu} mestaProdeje={mestaProdeje}
                          skryto={skryto} zobrazeno={zobrazene.length} />

          <VolbaSloupcu sloupce={SLOUPCE_REFININGU} skryte={skryteSloupce}
                        prepni={prepniSloupecUI} />

          {zobrazene.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center
                            text-sm text-slate-500 dark:border-slate-700">
              Filtru neodpovídá žádná položka.
            </div>
          ) : (
            <TabulkaRefiningu vysledky={zobrazene} stav={p.stav} davka={p.davka}
                              sloupce={sloupce}
                              filtr={filtr} setFiltr={zmenFiltr}
                              sklad={p.sklad} rezimProdeje={p.rezimProdeje}
                              poZmeneCeny={p.poZmeneCeny}
                              nazevPolozky={p.nazevPolozky}
                              odebrat={odebrat} setOverride={nastavOverride}
                              zafixujProdej={p.zafixujProdej}
                              otevritDetail={p.otevritDetail} />
          )}
        </>
      )}
    </div>
  );
}

// ── Globální nastavení ─────────────────────────────────────────

function GlobalniNastaveni({ konfig, setKonfig, zdroj, setZdroj, presety }: {
  konfig: KonfigRefiningu;
  setKonfig: (k: KonfigRefiningu) => void;
  zdroj: ZdrojCen;
  setZdroj: (z: ZdrojCen) => void;
  presety: React.ReactNode;
}) {
  // Posuvníky rizika se ukazují, jen když se vůbec MŮŽE jet. U dvou pevně
  // nastavených shodných měst by to byl ovladač, který nic nedělá.
  // Při automatickém výběru se ukázat musí — teprve výsledek rozhodne,
  // jestli se pojede, a to je právě věc, kterou riziko ovlivňuje.
  const vezeDoRefiningu = jeAutoNakup(konfig) || jeAutoRefining(konfig)
    || konfig.nakup !== konfig.refining;
  const vezeNaTrh = jeAutoProdej(konfig) || jeAutoRefining(konfig)
    || konfig.refining !== konfig.prodej;

  return (
    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
      <div className="flex flex-wrap items-end gap-3">
        <VyberMesta label="Kupuju v" hodnota={konfig.nakup}
                    onZmena={(m) => setKonfig({ ...konfig, nakup: m })}
                    auto={[[NAKUP_NEJLEVNEJI, "nejlevněji"]]} />
        <VyberMesta label="Refinuju v" hodnota={konfig.refining}
                    onZmena={(m) => setKonfig({ ...konfig, refining: m })}
                    auto={[
                      [REFINING_NEJL_BONUS, "nejlepší bonus"],
                      [REFINING_NEJV_ZISK, "nejvyšší zisk"],
                    ]} />
        <VyberMesta label="Prodávám v" hodnota={konfig.prodej}
                    onZmena={(m) => setKonfig({ ...konfig, prodej: m })}
                    auto={[[PRODEJ_NEJLEPSI, "nejlepší cena"]]} />

        <label className="text-xs text-slate-500">
          <div className="mb-0.5">Ceny z</div>
          <select value={zdroj} onChange={(e) => setZdroj(e.target.value as ZdrojCen)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
                             text-slate-900 dark:border-slate-700 dark:bg-slate-900
                             dark:text-slate-100">
            <option value="orderbook">poslední z tržnice</option>
            <option value="historie">30denní medián obchodů</option>
          </select>
        </label>

        <div className="ml-auto">{presety}</div>
      </div>

      {jeAutoNakup(konfig) && (
        <label className="mt-2 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
          <input type="checkbox" checked={konfig.jednoNakupniMesto}
                 onChange={(e) => setKonfig({ ...konfig, jednoNakupniMesto: e.target.checked })} />
          nakupovat všechno v jednom městě
          <span className="text-slate-400">
            (vypnuté = každou surovinu tam, kde je nejlevnější — ušetří silver,
            ale musíš objíždět tržnice)
          </span>
        </label>
      )}

      <div className="mt-2 flex flex-wrap gap-4">
        {vezeDoRefiningu && (
          <Posuvnik popis="Riziko cesty se surovinami" hodnota={konfig.ztrataDoRefiningu}
                    napoveda="Co se cestou ztratí, musíš dokoupit — zdražuje to NÁKLAD."
                    onZmena={(v) => setKonfig({ ...konfig, ztrataDoRefiningu: v })} />
        )}
        {vezeNaTrh && (
          <Posuvnik popis="Riziko cesty s výrobkem" hodnota={konfig.ztrataDoProdeje}
                    napoveda="Co se cestou ztratí, neprodáš — snižuje to TRŽBU."
                    onZmena={(v) => setKonfig({ ...konfig, ztrataDoProdeje: v })} />
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Platí pro všechny suroviny; u položky se dá přepsat.
        {konfig.refining === REFINING_NEJL_BONUS
          && " Bonus na surovinu má vždycky jedno město — ruda Thetford, vlákno Lymhurst, kámen Bridgewatch, kůže Martlock, dřevo Fort Sterling."}
        {konfig.refining === REFINING_NEJV_ZISK
          && " Projede všechna města a vybere podle výsledku — někdy vyhraje horší bonus s levnějšími surovinami nebo bližší trh."}
        {zdroj === "historie"
          && " Počítá se z 30denního mediánu skutečných obchodů (stabilnější než poslední order), ruční ceny pořád platí."}
      </p>
    </div>
  );
}

function VyberMesta({ label, hodnota, onZmena, auto }: {
  label: string;
  hodnota: string;
  onZmena: (m: string) => void;
  /** Dvojice [sentinel, popisek] nabízené nad seznamem měst. */
  auto: [string, string][];
}) {
  return (
    <label className="text-xs text-slate-500">
      <div className="mb-0.5">{label}</div>
      <select value={hodnota} onChange={(e) => onZmena(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
                         text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        {auto.map(([id, popis]) => <option key={id} value={id}>{popis}</option>)}
        {MESTA.map((m) => <option key={m.nazev} value={m.nazev}>{m.nazev}</option>)}
      </select>
    </label>
  );
}

function Posuvnik({ popis, hodnota, napoveda, onZmena }: {
  popis: string; hodnota: number; napoveda: string; onZmena: (v: number) => void;
}) {
  return (
    <div title={napoveda}>
      <div className="mb-0.5 text-xs text-slate-500">
        {popis} <b>{cislo(hodnota * 100, 0)} %</b>
      </div>
      <input type="range" min={0} max={50} step={1} className="w-32"
             value={Math.round(hodnota * 100)}
             onChange={(e) => onZmena(Number(e.target.value) / 100)} />
    </div>
  );
}

// ── Mřížka linka × tier ────────────────────────────────────────

function Mrizka({ klice, prepnout }: {
  klice: string[];
  prepnout: (klic: string) => void;
}) {
  const katalog = useMemo(() => katalogRefiningu(), []);
  const vybrane = new Set(klice);
  // Enchanty se schovávají pod přepínač: většina lidí refinuje .0 a osm
  // sloupců navíc by mřížku proměnilo ve stěnu.
  const [sEnchanty, setSEnchanty] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Klikni na tier, který refinuješ. Znovu klikni = odebrat.
        </span>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={sEnchanty}
                 onChange={(e) => setSEnchanty(e.target.checked)} />
          i enchanty
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm">
          <tbody>
            {katalog.map((rada) => {
              const mesto = mestoSBonusem(rada.linka.kategorie);
              return (
                <tr key={rada.linka.kategorie}>
                  <th className="whitespace-nowrap py-1 pr-3 text-left text-xs font-normal">
                    {rada.linka.nazev}
                    {mesto && (
                      <span className="block text-[11px] text-slate-400">bonus: {mesto}</span>
                    )}
                  </th>
                  {rada.polozky.map((pol) => (
                    <td key={pol.zaklad} className="py-1 pr-1">
                      <div className="flex gap-0.5">
                        {(sEnchanty ? pol.enchanty : pol.enchanty.slice(0, 1)).map((e) => {
                          const klic = klicRefiningu(pol.zaklad, e);
                          const je = vybrane.has(klic);
                          return (
                            <button key={e} onClick={() => prepnout(klic)}
                                    title={je ? "odebrat ze seznamu" : "přidat do seznamu"}
                                    className={`rounded px-1.5 py-0.5 text-xs ${je
                                      ? "bg-blue-600 font-semibold text-white"
                                      : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400"}`}>
                              T{pol.tier}{e > 0 ? `.${e}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Nastavení jedné položky ────────────────────────────────────

export function NastaveniPolozkyRefiningu({ efektivni, globalni, override, setOverride }: {
  efektivni: KonfigRefiningu;
  globalni: KonfigRefiningu;
  override: KonfigRefiningu | undefined;
  setOverride: (k: KonfigRefiningu | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <VyberMesta label="Kupuju v" hodnota={efektivni.nakup}
                  onZmena={(m) => setOverride({ ...efektivni, nakup: m })}
                  auto={[[NAKUP_NEJLEVNEJI, "nejlevněji"]]} />
      <VyberMesta label="Refinuju v" hodnota={efektivni.refining}
                  onZmena={(m) => setOverride({ ...efektivni, refining: m })}
                  auto={[
                    [REFINING_NEJL_BONUS, "nejlepší bonus"],
                    [REFINING_NEJV_ZISK, "nejvyšší zisk"],
                  ]} />
      <VyberMesta label="Prodávám v" hodnota={efektivni.prodej}
                  onZmena={(m) => setOverride({ ...efektivni, prodej: m })}
                  auto={[[PRODEJ_NEJLEPSI, "nejlepší cena"]]} />
      {override && (
        <button onClick={() => setOverride(null)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500
                           dark:border-slate-700"
                title="Používat globální nastavení">
          zpět na globální ({popisMesta(globalni.nakup)} → {popisMesta(globalni.refining)}
          {" → "}{popisMesta(globalni.prodej)})
        </button>
      )}
    </div>
  );
}
