import { useEffect } from "react";
import type { TypCeny } from "@albion/jadro";
import type { Server } from "../data/aodp";
import type { Lokace } from "@albion/jadro";
import type { RadekSkenu, NastaveniSkenu } from "../stav/sken";
import { typProNakup, typProProdej } from "../stav/sken";
import type { SkladCen } from "../stav/skladCen";
import { barvaHodnoty, barvaStari, cislo, procenta, seZnamenkem, stari } from "./format";
import { SekceHistorie } from "./SekceHistorie";
import { SekceRetezec } from "./SekceRetezec";

interface Props {
  radek: RadekSkenu;
  nastaveni: NastaveniSkenu;
  sklad: SkladCen;
  /** Volá se po změně ceny — přepočítá celý sken, ne jen tenhle detail. */
  poZmeneCeny: () => void;
  zavrit: () => void;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  /** Srovnání měst — jen v režimu příležitostí. */
  srovnaniMest?: { mesto: string; radek: RadekSkenu }[];
  /** Server — historie se tahá pro něj. */
  server: Server;
  /** Lokace zobrazovaného města — pro bonusy v řetězu. */
  lokace: Lokace | undefined;
  /** Čítač změn cen — sklad je proměnlivý objekt, jinak se řetěz nepřepočítá. */
  verzeCen: number;
  /** Které město se právě zobrazuje v rozpadu. */
  zobrazeneMesto?: string;
}

const POPIS_TYPU: Record<TypCeny, string> = {
  sell_min: "nejnižší sell order",
  buy_max: "nejvyšší buy order",
};

export function DetailPolozky(p: Props) {
  // Zavření klávesou Escape — samotný křížek nestačí.
  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => { if (e.key === "Escape") p.zavrit(); };
    window.addEventListener("keydown", naKlavesu);
    return () => window.removeEventListener("keydown", naKlavesu);
  }, [p]);

  const { radek, nastaveni, sklad } = p;
  const v = radek.vysledek;
  const typNakup = typProNakup(nastaveni.rezimNakupu);
  const typProdej = typProProdej(nastaveni.rezimProdeje);

  // V režimu příležitostí je zobrazované město to nejlepší, ne to nastavené.
  // Ceny se musí vztahovat k němu, jinak by detail ukazoval ceny odjinud,
  // než ze kterých je spočítaný rozpad.
  const mesto = p.zobrazeneMesto ?? nastaveni.mesto;

  const varianta = radek.polozka.varianty.find(
    (x) => x.enchant === radek.enchant && !x.sFactionTokenem,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                 bg-black/50 p-4 sm:p-8"
      onClick={p.zavrit}                                   // zavření kliknutím mimo
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl
                   dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">{radek.nazev}</h2>
            <p className="text-xs text-slate-500">
              {mesto} · {cislo(nastaveni.pocetVyrobku)} ks ·{" "}
              <code>{radek.polozka.zaklad}</code>
            </p>
          </div>
          <button onClick={p.zavrit}
                  className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100
                             dark:hover:bg-slate-800">
            ✕
          </button>
        </div>

        {p.srovnaniMest && p.srovnaniMest.length > 0 && (
          <Sekce nadpis="Srovnání měst">
            <p className="mb-2 text-xs text-slate-500">
              Nákup, výroba i prodej ve stejném městě — žádné skryté náklady na cestu.
            </p>
            {p.srovnaniMest.map(({ mesto: m, radek: r }) => {
              const zisk = r.vysledek?.zisk;
              const zobrazene = mesto === m;
              return (
                <div key={m}
                     className={`flex items-baseline justify-between gap-3 border-b
                                 border-slate-100 py-1 text-sm dark:border-slate-800/60
                                 ${zobrazene ? "font-semibold" : ""}`}>
                  <span>{m}{zobrazene && " ←"}</span>
                  <span className="flex gap-3 whitespace-nowrap">
                    {r.vysledek ? (
                      <>
                        <span className="text-xs text-slate-500">
                          {procenta(r.vysledek.bonus.returnRate)}
                        </span>
                        <span className={barvaHodnoty(zisk ?? 0)}>{seZnamenkem(zisk ?? 0)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">chybí cena</span>
                    )}
                  </span>
                </div>
              );
            })}
          </Sekce>
        )}

        {/* Ceny — hlavní důvod, proč detail existuje i u řádků bez výsledku */}
        <Sekce nadpis={`Ceny — ${mesto}`}>
          <p className="mb-2 text-xs text-slate-500">
            Ruční hodnota má přednost a <b>nový sken ji nepřepíše</b>.
            Změna se promítne do všech řádků, které tuhle položku používají.
          </p>

          {varianta?.vstupy.map((vstup) => (
            <RadekCeny
              key={`${vstup.zaklad}#${vstup.enchant}`}
              popis={`Nákup — ${p.nazevPolozky(vstup.zaklad, vstup.enchant)}`}
              mesto={mesto} zaklad={vstup.zaklad} enchant={vstup.enchant}
              typ={typNakup} sklad={sklad} poZmene={p.poZmeneCeny}
            />
          ))}

          <RadekCeny
            popis={`Prodej — ${radek.nazev}`}
            mesto={mesto} zaklad={radek.polozka.zaklad} enchant={radek.enchant}
            typ={typProdej} sklad={sklad} poZmene={p.poZmeneCeny}
          />
        </Sekce>

        {/* Koupit vs. vyrobit — jen u položek, které jdou vyrobit. */}
        {radek.polozka.varianty.length > 0 && (
          <Sekce nadpis="Koupit, nebo vyrobit?">
            <SekceRetezec
              polozka={radek.polozka} enchant={radek.enchant}
              mesto={mesto} lokace={p.lokace} sklad={sklad}
              nastaveni={nastaveni} nazevPolozky={p.nazevPolozky}
              verzeCen={p.verzeCen}
            />
          </Sekce>
        )}

        {/* Historie je MIMO větev „má výsledek".
            Když chybí aktuální cena, je to jediné, co o položce víme —
            a právě tam je nejužitečnější. */}
        <Sekce nadpis="Vývoj za 30 dní">
          <SekceHistorie
            polozka={radek.polozka} enchant={radek.enchant}
            mesto={mesto} server={p.server}
            aktualniCena={sklad.ziskej(mesto, radek.polozka.zaklad, radek.enchant, typProdej)
              ?.hodnota ?? null}
          />
        </Sekce>

        {!v ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800
                        dark:bg-amber-950/40 dark:text-amber-300">
            Výpočet neproběhl — chybí cena pro {radek.chybejici.join(", ")}.
            Doplň ji výše. Počítat s nulou by dalo hezky vypadající nesmysl.
          </p>
        ) : (
          <>
            <Sekce nadpis="Návratnost surovin">
              <Radek popis="Return rate" hodnota={<b>{procenta(v.bonus.returnRate)}</b>} />
              <Radek popis="Z každé koupené suroviny vyrobíš"
                     hodnota={<b>{cislo(v.bonus.nasobek, 3)}×</b>} />
              <p className="py-1 text-xs text-slate-500">
                {v.bonus.rucni
                  ? "zadáno ručně"
                  : v.bonus.slozky.map((s) => `${s.popis} ${cislo(s.hodnota)}`).join(" + ")
                    + ` = ${cislo(v.bonus.bonusCelkem)}`}
              </p>
            </Sekce>

            <Sekce nadpis="Spotřeba surovin">
              {v.vstupy.map((s) => (
                <Radek key={s.zaklad + s.enchant}
                       popis={p.nazevPolozky(s.zaklad, s.enchant)
                              + (s.vratna ? "" : " (nevratná)")}
                       hodnota={<>{cislo(s.nominalne)} → <b>{cislo(s.efektivne, 1)}</b></>} />
              ))}
              <p className="py-1 text-xs text-slate-500">
                Vlevo co recept žádá, vpravo co reálně koupíš
              </p>
            </Sekce>

            <Sekce nadpis="Náklady">
              {v.vstupy.map((s) => (
                <Radek key={s.zaklad + s.enchant}
                       popis={`${p.nazevPolozky(s.zaklad, s.enchant)} × ${cislo(s.cenaZaKus)}`}
                       hodnota={cislo(s.naklad)} />
              ))}
              {v.setupFeeNakup > 0 && (
                <Radek popis="Setup fee buy orderů (2,5 %)" hodnota={cislo(v.setupFeeNakup)} />
              )}
              <Radek popis={`Poplatek stanice (${cislo(v.poplatekStaniceKus, 2)} / kus)`}
                     hodnota={cislo(v.poplatekStaniceCelkem)} />
              <Radek popis={<b>Náklady celkem</b>} hodnota={<b>{cislo(v.nakladyCelkem)}</b>} />
            </Sekce>

            <Sekce nadpis="Výnos">
              <Radek popis="Hrubá tržba" hodnota={cislo(v.trzbaHruba)} />
              <Radek popis={`Daň (${procenta(v.sazbaDane, 0)})`} hodnota={`−${cislo(v.dan)}`} />
              {v.setupFeeProdej > 0 && (
                <Radek popis="Setup fee sell orderu" hodnota={`−${cislo(v.setupFeeProdej)}`} />
              )}
              <Radek popis={<b>Čistá tržba</b>} hodnota={<b>{cislo(v.trzbaCista)}</b>} />
            </Sekce>

            <div className="mt-4 rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
              <div className="flex items-baseline justify-between">
                <span className="font-bold">ČISTÝ ZISK</span>
                <span className={`text-xl font-bold ${barvaHodnoty(v.zisk)}`}>
                  {seZnamenkem(v.zisk)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-4">
                <Dlazdice popis="Marže" hodnota={procenta(v.marze)} kladne={v.zisk >= 0} />
                <Dlazdice popis="Na kus" hodnota={cislo(v.ziskNaKus, 1)} kladne={v.zisk >= 0} />
                <Dlazdice popis="Na kg"
                          hodnota={v.ziskNaKg != null ? cislo(v.ziskNaKg, 1) : "—"}
                          kladne={v.zisk >= 0} />
                <Dlazdice popis="Na focus"
                          hodnota={v.ziskNaFocus != null ? cislo(v.ziskNaFocus, 2) : "—"}
                          kladne={v.zisk >= 0} />
              </div>
            </div>

            <Sekce nadpis="Váha (limit je nosnost mountu)">
              <Radek popis="Vstupní suroviny" hodnota={`${cislo(v.vahaVstupu, 1)} kg`} />
              <Radek popis="Hotový produkt" hodnota={`${cislo(v.vahaVystupu, 1)} kg`} />
              <Radek popis={<span className="text-xs text-slate-500">
                              Refining před cestou váhu snižuje</span>}
                     hodnota={<b>{cislo(v.vahaVstupu / v.vahaVystupu, 1)}×</b>} />
            </Sekce>

            <p className="mt-3 text-xs text-slate-500">
              Focus celkem {cislo(v.focus)}
              {radek.stariHodin !== null && (
                <> · nejstarší použitá cena{" "}
                  <span className={barvaStari(radek.stariHodin)}>{stari(radek.stariHodin)}</span>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Dílčí prvky ─────────────────────────────────────────────

function Sekce({ nadpis, children }: { nadpis: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {nadpis}
      </h3>
      {children}
    </section>
  );
}

function Radek({ popis, hodnota }: { popis: React.ReactNode; hodnota: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1 text-sm
                    dark:border-slate-800/60">
      <span>{popis}</span>
      <span className="whitespace-nowrap text-right">{hodnota}</span>
    </div>
  );
}

function Dlazdice({ popis, hodnota, kladne }:
  { popis: string; hodnota: string; kladne: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{popis}</div>
      <div className={`font-semibold ${kladne
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400"}`}>{hodnota}</div>
    </div>
  );
}

/** Jedno cenové políčko včetně původu hodnoty. */
function RadekCeny(props: {
  popis: string;
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

  return (
    <div className="mb-2">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="text-sm">{props.popis}</span>
        {/* Který sloupec order booku to je — jinak uživatel po přepnutí
            režimu nechápe, proč se jeho hodnota přestala používat. */}
        <span className="text-xs text-slate-400">{POPIS_TYPU[typ]}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" min={0} step={1}
          value={cena?.hodnota ?? ""}
          placeholder="zadej cenu"
          onChange={(e) => {
            const h = Number(e.target.value);
            if (e.target.value === "") sklad.zrusRucne(mesto, zaklad, enchant, typ);
            else sklad.ulozRucne(mesto, zaklad, enchant, typ, h);
            props.poZmene();
          }}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm
                     dark:border-slate-700 dark:bg-slate-950"
        />
        {rucni ? (
          <button
            onClick={() => { sklad.zrusRucne(mesto, zaklad, enchant, typ); props.poZmene(); }}
            title="Zahodit ruční hodnotu a vzít cenu z AODP při dalším skenu"
            className="whitespace-nowrap rounded border border-amber-500 px-2 py-1 text-xs
                       text-amber-600 dark:text-amber-400"
          >
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
    </div>
  );
}

function stariZ(cas: string): number {
  return (Date.now() - new Date(cas.endsWith("Z") ? cas : `${cas}Z`).getTime()) / 3_600_000;
}
