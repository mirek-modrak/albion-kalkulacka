import { useCallback, useEffect, useRef, useState } from "react";
import type { TypCeny } from "@albion/jadro";
import type { Server } from "../data/aodp";
import type { Lokace } from "@albion/jadro";
import type { RadekSkenu, NastaveniSkenu } from "../stav/sken";
import { typProNakup, typProdejeProMisto } from "../stav/sken";
import type { SkladCen } from "../stav/skladCen";
import { barvaHodnoty, barvaStari, cislo, procenta, seZnamenkem, stari } from "./format";
import { SekceHistorie } from "./SekceHistorie";
import { SekceRetezec } from "./SekceRetezec";
import { OdchylkaOdMedianu } from "./OdznakLikvidity";
import { stariDnu } from "../stav/skladHistorie";
import { VYCHOZI_MOUNT, mount } from "../data/mounty";

interface Props {
  radek: RadekSkenu;
  nastaveni: NastaveniSkenu;
  sklad: SkladCen;
  /** Volá se po změně ceny — přepočítá celý sken, ne jen tenhle detail. */
  poZmeneCeny: () => void;
  zavrit: () => void;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  /** Srovnání míst — jen v režimu příležitostí. */
  srovnaniMest?: { mesto: string; nazevMista: string; radek: RadekSkenu }[];
  /** Které místo je právě rozepsané — „Martlock" nebo „Caerleon → BM". */
  zobrazeneMisto?: string;
  /**
   * Kde se PRODÁVÁ, když se to liší od města výroby (Black Market).
   * Vstupy se pořád kupují v `zobrazeneMesto` — na BM se nenakupuje.
   */
  mistoProdeje?: string;
  /** Na kolik jízd mountu se dávka veze. Undefined = neveze se nikam. */
  jizd?: number;
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
  /**
   * Zavřít, ale nejdřív doručit rozepsanou cenu.
   *
   * Cenové pole zapisuje do skladu až při `blur` (během psaní ne — přepočet
   * by pole přebil). Kliknutí na ✕ nebo mimo okno pole opustí samo, takže
   * `blur` proběhne. Escape ale kurzor v poli NECHÁVÁ — a spoléhat na to,
   * že cenu doručí až úklid při odpojení komponenty, je křehké: `blur`
   * z odpojení a samotné odpojení se perou o pořadí. Proto se aktivní pole
   * opustí explicitně; `blur()` je synchronní a stihne cenu uložit dřív,
   * než okno zmizí.
   */
  const oknoRef = useRef<HTMLDivElement>(null);
  const zavrit = useCallback(() => {
    // Opustit VŠECHNA cenová pole, ne jen to zrovna zaostřené. Escape
    // kurzor v poli nechává, ale spoléhat na to, které pole je „aktivní",
    // je křehké. Projít je všechna je spolehlivé bez ohledu na fokus.
    //
    // `focusout` (ne jen `blur()`): React doručuje onBlur přes delegovaný
    // `focusout` na kořeni, a holé `el.blur()` ho v některých jádrech
    // nevyvolá. Tím se rozepsaná cena uloží dřív, než okno zmizí.
    oknoRef.current?.querySelectorAll("input").forEach((el) => {
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    p.zavrit();
  }, [p]);

  // Zavření klávesou Escape — samotný křížek nestačí.
  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => { if (e.key === "Escape") zavrit(); };
    window.addEventListener("keydown", naKlavesu);
    return () => window.removeEventListener("keydown", naKlavesu);
  }, [zavrit]);

  /**
   * Začalo kliknutí na pozadí?
   *
   * VADA, kterou to řeší: `click` se posílá SPOLEČNÉMU RODIČI stisku
   * a puštění tlačítka. Kdo označí cenu v poli tažením myši a pustí
   * tlačítko mimo okno, vyrobí `click` mířený na pozadí — a okno se
   * zavřelo uprostřed přepisování ceny. Kontrola `e.target === currentTarget`
   * sama nestačí, protože v tom případě pozadí SKUTEČNĚ je cílem.
   *
   * Týká se to jakéhokoli tažení uvnitř okna, nejen políček s cenou —
   * i označení čísla, které si chceš zkopírovat.
   */
  const zacatekNaPozadi = useRef(false);

  const { radek, nastaveni, sklad } = p;
  const v = radek.vysledek;
  const typNakup = typProNakup(nastaveni.rezimNakupu);
  // Na Black Marketu je `buy_max` konečná cena výkupu, ne jedna z voleb —
  // proto se typ počítá z místa prodeje, ne jen z nastavení.
  const typProdej = typProdejeProMisto(nastaveni.rezimProdeje, p.mistoProdeje !== undefined);

  // V režimu příležitostí je zobrazované město to nejlepší, ne to nastavené.
  // Ceny se musí vztahovat k němu, jinak by detail ukazoval ceny odjinud,
  // než ze kterých je spočítaný rozpad.
  const mesto = p.zobrazeneMesto ?? nastaveni.mesto;

  // Black Market je tržnice v Caerleonu, ale funguje JEDNOSMĚRNĚ — systém
  // věci jen vykupuje, hráči si z něj nic nekoupí. Proto se rozchází místo
  // nákupu (vždy město) a místo prodeje. Nakupovat na BM nesmí nikde nic:
  // vstupy, řetěz „koupit vs. vyrobit" i bonusy zůstávají na `mesto`.
  const mistoProdeje = p.mistoProdeje ?? mesto;
  const prodejJinde = mistoProdeje !== mesto;

  const varianta = radek.polozka.varianty.find(
    (x) => x.enchant === radek.enchant && !x.sFactionTokenem,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                 bg-black/50 p-4 sm:p-8"
      // Zavře se jen tehdy, když kliknutí na pozadí i ZAČALO na pozadí.
      onPointerDown={(e) => { zacatekNaPozadi.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && zacatekNaPozadi.current) zavrit();
      }}
    >
      <div
        ref={oknoRef}
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
          <button onClick={zavrit}
                  className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100
                             dark:hover:bg-slate-800">
            ✕
          </button>
        </div>

        {p.srovnaniMest && p.srovnaniMest.length > 0 && (
          <Sekce nadpis="Srovnání míst">
            {/* Text MUSÍ odpovídat režimu. Tatáž tabulka tu má dva významy
                a splést si je znamená splést si úplně jiná čísla. */}
            <p className="mb-2 text-xs text-slate-500">
              {nastaveni.mistoProdeje === "bm-s-prevozem" ? (
                <>
                  Nákup i výroba ve městě, prodej vždy na <b>Black Market</b>.
                  U všech měst kromě Caerleonu je v čísle{" "}
                  <b>započtená ztráta {procenta(nastaveni.ztrataZasilek, 0)}</b> —
                  Caerleon riziko nemá, protože se z něj nikam nejede.
                </>
              ) : (
                <>
                  Nákup i výroba vždy ve stejném městě — žádné skryté náklady na cestu.
                  U <b>→ BM</b> se výsledek prodává na Black Market, který je
                  v Caerleonu taky, takže se ani tam nikam necestuje.
                </>
              )}
            </p>
            {p.srovnaniMest.map(({ mesto: m, radek: r, nazevMista }) => {
              const zisk = r.vysledek?.zisk;
              const zobrazene = nazevMista === p.zobrazeneMisto;
              return (
                <div key={nazevMista}
                     className={`flex items-baseline justify-between gap-3 border-b
                                 border-slate-100 py-1 text-sm dark:border-slate-800/60
                                 ${zobrazene ? "font-semibold" : ""}`}>
                  <span>{nazevMista}{zobrazene && " ←"}</span>
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
        <Sekce nadpis={prodejJinde ? `Ceny — ${mesto} → ${mistoProdeje}` : `Ceny — ${mesto}`}>
          <p className="mb-2 text-xs text-slate-500">
            Ruční hodnota má přednost a <b>nový sken ji nepřepíše</b>.
            Změna se promítne do všech řádků, které tuhle položku používají.
          </p>
          {prodejJinde && (
            <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800
                          dark:bg-amber-950/30 dark:text-amber-300">
              Suroviny se kupují v <b>{mesto}</b>, výsledek se prodává na{" "}
              <b>{mistoProdeje}</b>. Black Market věci jen vykupuje — nakoupit
              se na něm nedá, proto vstupy zůstávají ve městě. Cena je{" "}
              <b>konečná částka, kterou systém vyplácí</b>, takže se neklade
              order ani neplatí setup fee. Daň z prodeje platí dál.
            </p>
          )}

          {varianta?.vstupy.map((vstup) => (
            <RadekCeny
              key={`${vstup.zaklad}#${vstup.enchant}`}
              popis={`Nákup — ${p.nazevPolozky(vstup.zaklad, vstup.enchant)}`}
              mesto={mesto} zaklad={vstup.zaklad} enchant={vstup.enchant}
              typ={typNakup} sklad={sklad} poZmene={p.poZmeneCeny}
            />
          ))}

          <RadekCeny
            popis={`Prodej — ${radek.nazev}${prodejJinde ? ` (${mistoProdeje})` : ""}`}
            mesto={mistoProdeje} zaklad={radek.polozka.zaklad} enchant={radek.enchant}
            typ={typProdej} sklad={sklad} poZmene={p.poZmeneCeny}
          />
        </Sekce>

        {/* Skutečné obchody — protiváha k order booku výš.
            Order book říká za kolik někdo NABÍZÍ, tohle co se PRODALO. */}
        <SekceObchodu radek={radek} davka={nastaveni.pocetVyrobku} />

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
        {/* Graf se vztahuje k místu PRODEJE — u Black Marketu je běžná
            caerleonská tržnice úplně jiná řada než ta, na které vyděláš. */}
        <Sekce nadpis={`Vývoj za 30 dní — ${mistoProdeje}`}>
          <SekceHistorie
            polozka={radek.polozka} enchant={radek.enchant}
            mesto={mistoProdeje} server={p.server}
            // Tentýž medián, jaký ukazuje sekce „Skutečné obchody" —
            // dvě čísla pro totéž v jednom okně by mátla.
            medianTyden={radek.likvidita?.souhrn.medianTyden ?? null}
            aktualniCena={sklad.ziskej(
              mistoProdeje, radek.polozka.zaklad, radek.enchant, typProdej,
            )?.hodnota ?? null}
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
              {/* Počet jízd dává smysl jen když se opravdu někam veze.
                  U výroby na místě by to byl údaj bez obsahu. */}
              {p.jizd !== undefined && (
                <Radek popis={`Jízd na ${VYCHOZI_MOUNT}`}
                       hodnota={<b>{cislo(p.jizd)}×</b>} />
              )}
            </Sekce>

            {/* Kolik připravilo riziko. Bez tohohle čísla nejde poznat,
                jestli je rozdíl mezi městy dílem výroby, nebo odhadu ztrát. */}
            {v.ziskBezRizika !== v.zisk && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800
                            dark:bg-amber-950/40 dark:text-amber-300">
                Bez ztrát na cestě by to bylo <b>{seZnamenkem(v.ziskBezRizika)}</b> —
                riziko ubírá {cislo(v.ziskBezRizika - v.zisk)}.
              </p>
            )}

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

/**
 * Skutečné obchody za posledních 30 dní.
 *
 * Existuje proto, že order book neumí odpovědět na otázku „koupí to ode mě
 * někdo?". Naměřeno 2026-07-23: T6 Main Sword má v Caerleonu nabídku 89 999
 * a za 30 dní tam neproběhl jediný obchod — a opačně, T5 Cape má na Black
 * Marketu buy_max 4 108 proti mediánu skutečných obchodů 8 753.
 */
function SekceObchodu({ radek, davka }: { radek: RadekSkenu; davka: number }) {
  const l = radek.likvidita;

  if (!l) {
    return (
      <Sekce nadpis="Skutečné obchody">
        <p className="text-xs text-slate-500">
          Historie se ještě nestahovala. Spusť sken — přijde spolu s cenami.
        </p>
      </Sekce>
    );
  }

  const s = l.souhrn;
  const stariPosledniho = stariDnu(s.posledniDen);

  if (l.stav === "bez-dat") {
    return (
      <Sekce nadpis="Skutečné obchody">
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800
                      dark:bg-red-950/40 dark:text-red-300">
          <b>Za 30 dní tu AODP nezaznamenalo jediný obchod.</b> Cena z order booku
          nemusí znamenat, že za ni někdo koupí — může to být nabídka, na kterou
          nikdo nereaguje.
          <br />
          <span className="text-xs opacity-80">
            Pozor: AODP je crowdsourcované. Nula může znamenat i to, že tohle
            město prostě nikdo neskenoval.
          </span>
        </p>
      </Sekce>
    );
  }

  return (
    <Sekce nadpis="Skutečné obchody">
      <Radek popis="Medián ceny za poslední týden"
             hodnota={s.medianTyden !== null
               ? <b>{cislo(s.medianTyden)}</b>
               : <span className="text-slate-400">—</span>} />
      <Radek popis="Odchylka počítané ceny od mediánu"
             hodnota={<OdchylkaOdMedianu likvidita={l} />} />
      <Radek popis="Rozsah skutečných cen za 30 dní"
             hodnota={s.minOkno !== null
               ? <>{cislo(s.minOkno)} – {cislo(s.maxOkno ?? 0)}</>
               : <span className="text-slate-400">—</span>} />
      {/* Denní objem je to, co se poměřuje s dávkou — proto je první a tučně. */}
      <Radek popis="Prodá se za den"
             hodnota={s.objemDen !== null
               ? <b className={l.stav === "tenky" ? "text-amber-600 dark:text-amber-400" : ""}>
                   {cislo(s.objemDen)} ks
                 </b>
               : <span className="text-slate-400">bez dat</span>} />
      <Radek popis="Prodáno za týden"
             hodnota={s.objemTyden !== null
               ? `${cislo(s.objemTyden)} ks`
               : <span className="text-slate-400">bez dat</span>} />
      <Radek popis="Prodáno za 30 dní" hodnota={`${cislo(s.objemOkno ?? 0)} ks`} />
      {/* Pokrytí je to, co odlišuje „mrtvý trh" od „nikdo neskenoval".
          Bez něj by uživatel nevěděl, jestli medián stojí na 7 dnech, nebo na jednom. */}
      <Radek popis="Dní s daty"
             hodnota={<span className={s.dniTydne === 0 ? "text-amber-600 dark:text-amber-400" : ""}>
               {s.dniTydne}/7 týden · {s.dniOkna}/30 okno
             </span>} />
      <Radek popis="Poslední zaznamenaný obchod"
             hodnota={stariPosledniho !== null
               ? `před ${stariPosledniho} dny`
               : <span className="text-slate-400">—</span>} />

      {l.stav === "tenky" && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800
                      dark:bg-amber-950/40 dark:text-amber-300">
          Chceš vyrobit {cislo(davka)} ks, ale denně se jich prodá{" "}
          {cislo(s.objemDen ?? 0)}. Tolik kusů trh naráz nemusí vzít — a prodej
          pod cenu marži umaže. Rozložit prodej na víc dní pomůže.
        </p>
      )}
      {l.stav === "zastarala" && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800
                      dark:bg-amber-950/40 dark:text-amber-300">
          Za poslední týden tu nejsou data, ale za 30 dní se prodalo{" "}
          {cislo(s.objemOkno ?? 0)} kusů. Trh existuje — jen ho poslední dny
          nikdo neskenoval.
        </p>
      )}
      {l.fantomovyListing && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800
                      dark:bg-amber-950/40 dark:text-amber-300">
          Cena, se kterou se počítá tržba, je přes dvojnásobek nejvyšší denní
          ceny skutečných obchodů. Nejspíš je to nabídka, kterou nikdo nepřijme.
        </p>
      )}
    </Sekce>
  );
}

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

  // Rozepsaná hodnota žije v políčku, dokud v něm uživatel edituje.
  // Null = needituje se a bere se ta uložená ze skladu.
  //
  // Do skladu se zapíše AŽ při opuštění pole, ne během psaní. Zápis totiž
  // spouští přepočet celé tabulky (naměřeno 4,7 s u 3 240 řádků), a ten
  // přepočet i re-ranking příležitostí by uprostřed psaní přebil pole
  // hodnotou zpět. Reprodukováno 2026-07-23: napsat „14900" s jednou
  // pauzou uprostřed skončilo v poli jako „3388" — odklad uložil půlku
  // čísla, přepočet přebil pole a další znaky se lepily na cizí hodnotu.
  const [rozepsane, setRozepsane] = useState<string | null>(null);
  // Co ještě není ve skladu — pro doručení při zavření okna i pro čtení
  // aktuální hodnoty bez závislosti na re-renderu.
  const cekajiciRef = useRef<string | null>(null);

  function dorucit() {
    const text = cekajiciRef.current;
    cekajiciRef.current = null;
    setRozepsane(null);
    if (text === null) return;               // nic se needitovalo
    if (text === "") sklad.zrusRucne(mesto, zaklad, enchant, typ);
    else sklad.ulozRucne(mesto, zaklad, enchant, typ, Number(text));
    props.poZmene();
  }

  // Zavření okna (odpojení komponenty) nesmí sníst rozepsanou cenu — ruční
  // cena je vědomá práce uživatele. Cleanup ji doručí, i když uživatel
  // zavřel okno bez opuštění pole.
  useEffect(() => () => {
    const text = cekajiciRef.current;
    if (text === null) return;
    if (text === "") sklad.zrusRucne(mesto, zaklad, enchant, typ);
    else sklad.ulozRucne(mesto, zaklad, enchant, typ, Number(text));
    props.poZmene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          value={rozepsane ?? (cena?.hodnota ?? "")}
          placeholder="zadej cenu"
          onChange={(e) => {
            // Jen do políčka a do čekající hodnoty. Sklad se netkne,
            // dokud uživatel z pole neodejde — jinak přepočet přebije psaní.
            setRozepsane(e.target.value);
            cekajiciRef.current = e.target.value;
          }}
          onBlur={dorucit}
          // Enter je jasný signál „dopsal jsem".
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
