/**
 * Dílna — nastavitelné výrobní pracoviště.
 *
 * Kurátorský seznam itemů. Nahoře si nastavíš, kde vyrábíš a kam prodáváš
 * (globálně), u každé karty se to dá přepsat, a hned vidíš, co je nejefektivnější.
 * Vedle je panel cen surovin pro hromadnou ruční editaci.
 *
 * Výpočet i detail se přebírají ze skenu; tady je jen výběr, konfigurace a karty.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { TypCeny } from "@albion/jadro";
import { MESTA } from "../data/hra";
import type { SkladCen } from "../stav/skladCen";
import {
  AUTO_MESTO, DILNA_MESTO, klicDilny, konfigProKlic,
  type KonfigDilny, type PolozkaKatalogu, type StavDilny, type VysledekDilny,
  type ZdrojCen,
} from "../stav/dilna";
import { barvaHodnoty, barvaStari, cislo, procenta, seZnamenkem, stari } from "./format";
import { OdznakLikvidity, ZnackaFantomu } from "./OdznakLikvidity";
import { PanelSurovin } from "./PanelSurovin";
import { PresetyDilny } from "./PresetyDilny";
import { skupinaProKategorii } from "../data/kategorie";
import {
  dostupneEnchanty, dostupneTiery, filtrujARad, nactiFiltr, nactiPohled, ulozFiltr, ulozPohled,
  type NastaveniFiltru, type Pohled,
} from "../stav/filtrDilny";
import { FiltrDilny } from "./FiltrDilny";
import { TabulkaDilny } from "./TabulkaDilny";

interface Props {
  vysledky: VysledekDilny[];
  stav: StavDilny;
  katalog: PolozkaKatalogu[];
  sklad: SkladCen;
  davka: number;
  /** Sloupec order booku pro nákup surovin — podle „Nákup surovin" v panelu. */
  typNakup: TypCeny;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  uprav: (stav: StavDilny) => void;
  poZmeneCeny: () => void;
  otevritDetail: (klic: string) => void;
}

/** Popisek „kde → kam" z konfigurace. */
export function popisKonfigu(k: KonfigDilny): string {
  const kde = k.mesto === AUTO_MESTO ? "nejlevnější" : k.mesto;
  const kam = k.naBM ? "Black Market" : "místní trh";
  return `${kde} → ${kam}`;
}

export function TabDilna(p: Props) {
  const [filtr, setFiltr] = useState(nactiFiltr);
  const [pohled, setPohled] = useState(nactiPohled);

  const zmenFiltr = (f: NastaveniFiltru) => { setFiltr(f); ulozFiltr(f); };
  const zmenPohled = (x: Pohled) => { setPohled(x); ulozPohled(x); };

  const { zobrazene, skryto } = useMemo(
    () => filtrujARad(p.vysledky, filtr, {
      nazev: (v) => v.radek?.nazev
        ?? p.nazevPolozky(v.klic.split("#")[0] ?? "", Number(v.klic.split("#")[1] ?? 0)),
      skupina: (v) => skupinaProKategorii(v.radek?.polozka?.kategorie),
    }),
    [p.vysledky, filtr, p.nazevPolozky],
  );

  const pridat = (klic: string) => {
    if (!p.stav.klice.includes(klic)) {
      p.uprav({ ...p.stav, klice: [...p.stav.klice, klic] });
    }
  };
  const odebrat = (klic: string) => {
    const override = { ...p.stav.override };
    delete override[klic];
    p.uprav({ ...p.stav, klice: p.stav.klice.filter((k) => k !== klic), override });
  };
  const nastavKonfig = (konfig: KonfigDilny) => p.uprav({ ...p.stav, konfig });
  const nastavZdroj = (zdrojCen: ZdrojCen) => p.uprav({ ...p.stav, zdrojCen });
  const nastavOverride = (klic: string, konfig: KonfigDilny | null) => {
    const override = { ...p.stav.override };
    if (konfig === null) delete override[klic];
    else override[klic] = konfig;
    p.uprav({ ...p.stav, override });
  };

  return (
    <div className="space-y-3">
      <GlobalniNastaveni konfig={p.stav.konfig} setKonfig={nastavKonfig}
                         zdroj={p.stav.zdrojCen} setZdroj={nastavZdroj}
                         presety={<PresetyDilny stav={p.stav} uprav={p.uprav} />} />

      <Vyhledavac katalog={p.katalog} klice={p.stav.klice}
                  nazevPolozky={p.nazevPolozky} pridat={pridat} />

      {p.stav.klice.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center
                        text-sm text-slate-500 dark:border-slate-700">
          Zatím prázdno. Vyhledej nahoře item a přidej ho tlačítkem enchantu.
        </div>
      ) : (
        <>
          <PanelSurovin stav={p.stav} sklad={p.sklad} typNakup={p.typNakup}
                        nazevPolozky={p.nazevPolozky} poZmeneCeny={p.poZmeneCeny} />

          <FiltrDilny filtr={filtr} setFiltr={zmenFiltr}
                      tiery={dostupneTiery(p.vysledky)}
                      enchanty={dostupneEnchanty(p.vysledky)}
                      skryto={skryto} zobrazeno={zobrazene.length} />

          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Pohled</span>
            {([["karty", "Karty"], ["tabulka", "Tabulka"]] as const).map(([id, popisek]) => (
              <button key={id} onClick={() => zmenPohled(id)}
                      className={`rounded-md px-2 py-1 text-xs ${pohled === id
                        ? "bg-blue-600 font-semibold text-white"
                        : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400"}`}>
                {popisek}
              </button>
            ))}
          </div>

          {zobrazene.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center
                            text-sm text-slate-500 dark:border-slate-700">
              Filtru neodpovídá žádná položka.
            </div>
          ) : pohled === "tabulka" ? (
            <TabulkaDilny vysledky={zobrazene} stav={p.stav} davka={p.davka}
                          filtr={filtr} setFiltr={zmenFiltr}
                          nazevPolozky={p.nazevPolozky}
                          odebrat={odebrat} setOverride={nastavOverride}
                          otevritDetail={p.otevritDetail} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {zobrazene.map((v) => (
                <Karta key={v.klic} vysledek={v}
                       globalni={p.stav.konfig}
                       override={p.stav.override[v.klic]}
                       efektivni={konfigProKlic(p.stav, v.klic)}
                       davka={p.davka} nazevPolozky={p.nazevPolozky}
                       odebrat={() => odebrat(v.klic)}
                       setOverride={(k) => nastavOverride(v.klic, k)}
                       otevritDetail={() => p.otevritDetail(v.klic)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Globální nastavení pracoviště ──────────────────────────────

function GlobalniNastaveni({ konfig, setKonfig, zdroj, setZdroj, presety }: {
  konfig: KonfigDilny;
  setKonfig: (k: KonfigDilny) => void;
  zdroj: ZdrojCen;
  setZdroj: (z: ZdrojCen) => void;
  presety: React.ReactNode;
}) {
  const prevoz = konfig.naBM && konfig.mesto !== DILNA_MESTO && konfig.mesto !== AUTO_MESTO;
  return (
    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
      <div className="flex flex-wrap items-end gap-3">
        <VyberMesta label="Vyrábím v" hodnota={konfig.mesto}
                    onZmena={(m) => setKonfig({ ...konfig, mesto: m })} sAuto />
        <VyberProdeje naBM={konfig.naBM}
                      onZmena={(naBM) => setKonfig({ ...konfig, naBM })} />
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
        {prevoz && (
          <div>
            <div className="mb-0.5 text-xs text-slate-500">
              Riziko převozu <b>{cislo(konfig.ztrata * 100, 0)} %</b>
            </div>
            <input type="range" min={0} max={50} step={1} className="w-32"
                   value={Math.round(konfig.ztrata * 100)}
                   onChange={(e) => setKonfig({ ...konfig, ztrata: Number(e.target.value) / 100 })} />
          </div>
        )}
        <div className="ml-auto">{presety}</div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Platí pro všechny itemy; u karty se dá přepsat.
        {konfig.mesto === AUTO_MESTO
          && " Nejlevnější projede všechna města a vybere to s nejvyšším ziskem."}
        {zdroj === "historie"
          && " Počítá se z 30denního mediánu skutečných obchodů (stabilnější než poslední order), ruční ceny pořád platí."}
      </p>
    </div>
  );
}

function VyberMesta({ label, hodnota, onZmena, sAuto }: {
  label: string; hodnota: string; onZmena: (m: string) => void; sAuto?: boolean;
}) {
  return (
    <label className="text-xs text-slate-500">
      <div className="mb-0.5">{label}</div>
      <select value={hodnota} onChange={(e) => onZmena(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
                         text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        {sAuto && <option value={AUTO_MESTO}>nejlevnější</option>}
        {MESTA.map((m) => <option key={m.nazev} value={m.nazev}>{m.nazev}</option>)}
      </select>
    </label>
  );
}

function VyberProdeje({ naBM, onZmena }: { naBM: boolean; onZmena: (b: boolean) => void }) {
  return (
    <label className="text-xs text-slate-500">
      <div className="mb-0.5">Prodávám na</div>
      <select value={naBM ? "bm" : "mesto"} onChange={(e) => onZmena(e.target.value === "bm")}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
                         text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <option value="bm">Black Market</option>
        <option value="mesto">místní trh</option>
      </select>
    </label>
  );
}

// ── Vyhledávač ─────────────────────────────────────────────────

function Vyhledavac({ katalog, klice, nazevPolozky, pridat }: {
  katalog: PolozkaKatalogu[];
  klice: string[];
  nazevPolozky: (zaklad: string, enchant: number) => string;
  pridat: (klic: string) => void;
}) {
  const [dotaz, setDotaz] = useState("");
  // Seznam výsledků jde zavřít třemi způsoby: křížkem, Escape a klikem mimo.
  // Bez toho by šel schovat jen smazáním celého textu.
  const obal = useRef<HTMLDivElement>(null);
  const [zavreno, setZavreno] = useState(false);
  useEffect(() => {
    if (zavreno) return;
    const mimo = (e: MouseEvent) => {
      if (!obal.current?.contains(e.target as Node)) setZavreno(true);
    };
    // `click` (ne `mousedown`) — jinak by se seznam zavřel dřív,
    // než se stihne zpracovat kliknutí na tlačítko enchantu.
    document.addEventListener("click", mimo);
    return () => document.removeEventListener("click", mimo);
  }, [zavreno]);

  const nalezene = useMemo(() => {
    const q = dotaz.trim().toLowerCase();
    if (q.length < 2) return [];
    return katalog
      .filter((k) => nazevPolozky(k.polozka.zaklad, 0).toLowerCase().includes(q)
        || k.polozka.zaklad.toLowerCase().includes(q))
      .slice(0, 12);
  }, [dotaz, katalog, nazevPolozky]);
  const uz = new Set(klice);

  return (
    <div ref={obal}>
      <div className="relative">
        <input
          value={dotaz}
          onChange={(e) => { setDotaz(e.target.value); setZavreno(false); }}
          onFocus={() => setZavreno(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setZavreno(true); }}
          placeholder="Hledej item — např. cloth boty, sword… (anglicky)"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-9 text-sm
                     dark:border-slate-700 dark:bg-slate-950"
        />
        {dotaz !== "" && (
          <button type="button" onClick={() => { setDotaz(""); setZavreno(false); }}
                  title="Vymazat hledání"
                  className="absolute inset-y-0 right-0 px-3 text-slate-400
                             hover:text-slate-700 dark:hover:text-slate-200">
            ✕
          </button>
        )}
      </div>
      {dotaz.trim().length >= 2 && !zavreno && (
        <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-800">
          {nalezene.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">Nic nenalezeno.</p>
          ) : nalezene.map((k) => (
            <div key={k.polozka.zaklad}
                 className="flex items-center justify-between gap-2 border-b border-slate-100
                            px-3 py-2 text-sm last:border-0 dark:border-slate-800/60">
              <span className="truncate">{nazevPolozky(k.polozka.zaklad, 0)}</span>
              <span className="flex shrink-0 gap-1">
                {k.enchanty.map((e) => {
                  const klic = klicDilny(k.polozka.zaklad, e);
                  const pridano = uz.has(klic);
                  return (
                    <button key={e} disabled={pridano} onClick={() => pridat(klic)}
                            title={pridano ? "už v seznamu" : `přidat .${e}`}
                            className={`rounded px-1.5 py-0.5 text-xs ${pridano
                              ? "bg-slate-200 text-slate-400 dark:bg-slate-800"
                              : "border border-blue-500 text-blue-600 dark:text-blue-400"}`}>
                      .{e}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Nastavení jen pro jednu položku.
 *
 * Vytažené z karty ven, aby ho mohl použít i tabulkový pohled — jinak by
 * tabulka uměla míň než karty a porovnání obou pohledů by bylo nefér.
 */
export function NastaveniPolozky({ efektivni, globalni, override, setOverride }: {
  efektivni: KonfigDilny;
  globalni: KonfigDilny;
  override: KonfigDilny | undefined;
  setOverride: (k: KonfigDilny | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <VyberMesta label="Vyrábím v" hodnota={efektivni.mesto} sAuto
                  onZmena={(m) => setOverride({ ...efektivni, mesto: m })} />
      <VyberProdeje naBM={efektivni.naBM}
                    onZmena={(naBM) => setOverride({ ...efektivni, naBM })} />
      {override && (
        <button onClick={() => setOverride(null)}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500
                           dark:border-slate-700"
                title="Používat globální nastavení">
          zpět na globální ({popisKonfigu(globalni)})
        </button>
      )}
    </div>
  );
}

// ── Karta položky ──────────────────────────────────────────────

function Karta({ vysledek, globalni, override, efektivni, davka, nazevPolozky,
                 odebrat, setOverride, otevritDetail }: {
  vysledek: VysledekDilny;
  globalni: KonfigDilny;
  override: KonfigDilny | undefined;
  efektivni: KonfigDilny;
  davka: number;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  odebrat: () => void;
  setOverride: (k: KonfigDilny | null) => void;
  otevritDetail: () => void;
}) {
  const [rozbaleno, setRozbaleno] = useState(false);
  const [zaklad, e] = vysledek.klic.split("#");
  const nazev = vysledek.radek?.nazev ?? nazevPolozky(zaklad ?? "", Number(e ?? 0));
  const v = vysledek.radek?.vysledek ?? null;
  // U „nejlevnější" ukázat vybrané město; jinak nastavenou konfiguraci.
  const kdeKam = efektivni.mesto === AUTO_MESTO
    ? `${vysledek.mesto} → ${efektivni.naBM ? "BM" : "místní"} · nejlevnější`
    : popisKonfigu(efektivni);

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-1 flex items-start justify-between gap-2">
        <button onClick={otevritDetail}
                className="text-left font-medium hover:underline">{nazev}</button>
        <button onClick={odebrat} title="Odebrat ze seznamu"
                className="shrink-0 rounded px-1.5 text-slate-400 hover:bg-slate-100
                           dark:hover:bg-slate-800">✕</button>
      </div>

      <button onClick={() => setRozbaleno((x) => !x)}
              className={`mb-2 text-xs ${override
                ? "font-semibold text-amber-600 dark:text-amber-400"
                : "text-slate-500"}`}
              title="Změnit nastavení jen pro tuhle položku">
        🔧 {kdeKam} {rozbaleno ? "▾" : "▸"}{override && " · vlastní"}
      </button>

      {rozbaleno && (
        <div className="mb-2 rounded-md bg-slate-50 p-2 dark:bg-slate-950/60">
          <NastaveniPolozky efektivni={efektivni} globalni={globalni}
                            override={override} setOverride={setOverride} />
        </div>
      )}

      {v ? (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs text-slate-500">Zisk / {cislo(davka)} ks</span>
            <span className={`text-lg font-bold ${barvaHodnoty(v.zisk)}`}>{seZnamenkem(v.zisk)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <RadekU popis="Marže" hodnota={procenta(v.marze)} kladne={v.zisk >= 0} />
            <RadekU popis="Náklad / ks" hodnota={cislo(v.nakladyCelkem / Math.max(1, davka), 0)} />
            <RadekU popis={efektivni.naBM ? "Výkup BM / ks" : "Tržba / ks"}
                    hodnota={cislo(v.trzbaHruba / Math.max(1, davka), 0)} />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-slate-500">Likvidita</span>
              <OdznakLikvidity likvidita={vysledek.radek?.likvidita ?? null} davka={davka} />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <ZnackaFantomu likvidita={vysledek.radek?.likvidita ?? null} />
            {vysledek.radek?.stav === "podezrele" && (
              <span className="text-amber-600 dark:text-amber-400">podezřelá marže</span>
            )}
            {vysledek.radek?.stariHodin != null && (
              <span className={`ml-auto ${barvaStari(vysledek.radek.stariHodin)}`}>
                {stari(vysledek.radek.stariHodin)}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          {vysledek.radek?.chybejici?.length
            ? <>Chybí cena: {vysledek.radek.chybejici.join(", ")}. Stáhni ceny nebo doplň níž.</>
            : <>Zatím bez ceny — klikni na „Stáhnout ceny" nebo doplň v panelu surovin.</>}
        </p>
      )}
    </div>
  );
}

function RadekU({ popis, hodnota, kladne }: {
  popis: string; hodnota: string; kladne?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500">{popis}</span>
      <span className={`font-semibold ${kladne === undefined ? ""
        : kladne ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
        {hodnota}
      </span>
    </div>
  );
}
