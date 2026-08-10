/**
 * Testy logiky Refiningu.
 *
 * Zaměřeno na to, co selhává tiše: rozhodování o třech městech.
 * Špatně vybrané město vypadá stejně věrohodně jako správné — jen pošle
 * hráče přes půl mapy pro nic.
 */

import { describe, expect, it } from "vitest";
import {
  NAKUP_NEJLEVNEJI, NAKUP_RUZNA_MESTA, PRODEJ_NEJLEPSI,
  REFINING_NEJL_BONUS, REFINING_NEJV_ZISK,
  katalogRefiningu, kombinaceZKlicuRefiningu, konfigProKlicRefiningu,
  linkaProKategorii, mestoSBonusem, ocistiStavRefiningu, poRucniProdejniCene,
  souhrnRefiningu, vyhodnotitRefining,
  type KonfigRefiningu, type StavRefiningu,
} from "../src/stav/refining";
import { SkladCen } from "../src/stav/skladCen";
import type { StavRefiningu as _StavRefiningu } from "../src/stav/refining";
import { HRA } from "../src/data/hra";
import type { NastaveniSkenu } from "../src/stav/sken";
import { SUROVINY_ID } from "../src/data/kategorie";

const NASTAVENI: NastaveniSkenu = {
  mesto: "Thetford", focus: false, denniBonus: 0, premium: true, sazbaStanice: 200,
  pocetVyrobku: 100, rezimNakupu: "instant", rezimProdeje: "instant",
  skupina: SUROVINY_ID, kategorie: [], mistoProdeje: "mesto", ztrataZasilek: 0,
};

const KONFIG: KonfigRefiningu = {
  nakup: "Thetford", refining: "Thetford", prodej: "Thetford",
  jednoNakupniMesto: true, ztrataDoRefiningu: 0, ztrataDoProdeje: 0,
};

const KLIC = "T5_METALBAR#0";
const nazev = (z: string, e: number) => `${z}#${e}`;

function stav(konfig: Partial<KonfigRefiningu> = {}, klice = [KLIC]): StavRefiningu {
  return { klice, konfig: { ...KONFIG, ...konfig }, override: {}, zdrojCen: "orderbook" };
}

/** Ceny ve všech městech; přepsat jde jednotlivě. */
function sklad(uprav?: (s: SkladCen) => void): SkladCen {
  const s = new SkladCen();
  for (const m of HRA.lokace.filter((l) => l.typ === "mesto")) {
    s.ulozRucne(m.nazev, "T5_ORE", 0, "sell_min", 300);
    s.ulozRucne(m.nazev, "T4_METALBAR", 0, "sell_min", 300);
    s.ulozRucne(m.nazev, "T5_METALBAR", 0, "buy_max", 2000);
  }
  uprav?.(s);
  return s;
}

const vyhodnot = (st: StavRefiningu, sk = sklad(), nosnost = 4116, maxStari = 0) =>
  vyhodnotitRefining(st, sk, undefined, HRA.konstanty, NASTAVENI, nazev, nosnost, maxStari);

// ── Katalog a linky ────────────────────────────────────────────

describe("katalog a linky", () => {
  it("každá linka najde své město s bonusem", () => {
    expect(mestoSBonusem("ore")).toBe("Thetford");
    expect(mestoSBonusem("fiber")).toBe("Lymhurst");
    expect(mestoSBonusem("rock")).toBe("Bridgewatch");
    expect(mestoSBonusem("hide")).toBe("Martlock");
    expect(mestoSBonusem("wood")).toBe("Fort Sterling");
  });

  it("kategorie, na kterou bonus nikdo nemá, vrátí undefined", () => {
    expect(mestoSBonusem("sword")).toBeUndefined();
    expect(mestoSBonusem(null)).toBeUndefined();
  });

  it("katalog má všech pět linek a jen existující položky", () => {
    const k = katalogRefiningu();
    expect(k).toHaveLength(5);
    for (const rada of k) {
      expect(rada.polozky.length).toBeGreaterThan(0);
      // Tiery vzestupně, ať mřížka nemá přeházené sloupce.
      const tiery = rada.polozky.map((p) => p.tier);
      expect([...tiery].sort((a, b) => a - b)).toEqual(tiery);
    }
  });

  it("kámen enchanty nemá — negenerují se", () => {
    const kamen = katalogRefiningu().find((r) => r.linka.kategorie === "rock")!;
    expect(kamen.polozky.every((p) => p.enchanty.length === 1)).toBe(true);
    expect(kamen.polozky.every((p) => p.enchanty[0] === 0)).toBe(true);
  });

  it("linkaProKategorii pozná kámen jako 'rock', ne 'stone'", () => {
    expect(linkaProKategorii("rock")?.refined).toBe("STONEBLOCK");
  });
});

describe("kombinaceZKlicuRefiningu — do seznamu patří jen refinovatelné", () => {
  it("refined surovina projde", () => {
    expect(kombinaceZKlicuRefiningu(["T5_METALBAR#0"])).toHaveLength(1);
  });

  it("SYROVÁ surovina neprojde — ruda se kope, nerefinuje", () => {
    expect(kombinaceZKlicuRefiningu(["T5_ORE#0"])).toHaveLength(0);
  });

  it("výbava neprojde — od toho je Dílna", () => {
    expect(kombinaceZKlicuRefiningu(["T5_MAIN_SWORD#0"])).toHaveLength(0);
  });

  it("neexistující klíč ani neexistující enchant nespadne", () => {
    expect(kombinaceZKlicuRefiningu(["NENI#0", "T5_STONEBLOCK#3", "", "bez-mrizky"]))
      .toHaveLength(0);
  });
});

// ── Rozhodování o městech ──────────────────────────────────────

describe("kde refinovat", () => {
  it("'nejlepší bonus' vybere město podle suroviny, ne podle ceny", () => {
    const v = vyhodnot(stav({ refining: REFINING_NEJL_BONUS }))[0]!;
    expect(v.refining).toBe("Thetford");
    expect(v.radek!.vysledek!.bonus.bonusCelkem).toBe(58);
  });

  it("NEGATIVNÍ: konkrétní město bez bonusu opravdu dostane jen 18", () => {
    // Kdyby se bonus bral odjinud než z města refiningu, tenhle test
    // by prošel se špatným číslem a karta by radila refinovat kdekoli.
    const v = vyhodnot(stav({ refining: "Caerleon" }))[0]!;
    expect(v.refining).toBe("Caerleon");
    expect(v.radek!.vysledek!.bonus.bonusCelkem).toBe(18);
  });

  it("město s bonusem vyrobí ze stejné rudy víc — nižší náklad", () => {
    const sBonusem = vyhodnot(stav({ refining: "Thetford" }))[0]!.radek!.vysledek!;
    const bez = vyhodnot(stav({ refining: "Caerleon" }))[0]!.radek!.vysledek!;
    expect(sBonusem.nakladSuroviny).toBeLessThan(bez.nakladSuroviny);
    expect(sBonusem.zisk).toBeGreaterThan(bez.zisk);
  });

  it("'nejvyšší zisk' projede města a vybere podle výsledku", () => {
    // Ruda je všude 300, ingot všude 2000 → vyhrát musí město s bonusem.
    const v = vyhodnot(stav({ refining: REFINING_NEJV_ZISK }))[0]!;
    expect(v.refining).toBe("Thetford");
  });

  it("'nejvyšší zisk' umí přebít bonus, když se tím ušetří cesta", () => {
    // Caerleon platí za ingot 9 000, ostatní 2 000, a cesta stojí 50 %.
    // Refinovat v Caerleonu je sice bez bonusu, ale prodává se na místě:
    //   Thetford  → prodat v Caerleonu: 9 000 × 0,5 = 4 500
    //   Caerleon  → prodat doma:        9 000 × 1,0 = 9 000
    // Tohle je celý smysl volby „nejvyšší zisk" proti „nejlepší bonus".
    const s = sklad((x) => x.ulozRucne("Caerleon", "T5_METALBAR", 0, "buy_max", 9000));
    const konfig = { prodej: PRODEJ_NEJLEPSI, ztrataDoProdeje: 0.5 };

    const podleZisku = vyhodnot(stav({ ...konfig, refining: REFINING_NEJV_ZISK }), s)[0]!;
    expect(podleZisku.refining).toBe("Caerleon");
    expect(podleZisku.prodej).toBe("Caerleon");

    // Volba podle bonusu se drží Thetfordu — a vydělá míň.
    const podleBonusu = vyhodnot(stav({ ...konfig, refining: REFINING_NEJL_BONUS }), s)[0]!;
    expect(podleBonusu.refining).toBe("Thetford");
    expect(podleZisku.radek!.vysledek!.zisk)
      .toBeGreaterThan(podleBonusu.radek!.vysledek!.zisk);
  });
});

describe("kde koupit", () => {
  it("'nejlevněji' najde město s nejnižší cenou surovin", () => {
    const s = sklad((x) => {
      x.ulozRucne("Bridgewatch", "T5_ORE", 0, "sell_min", 50);
      x.ulozRucne("Bridgewatch", "T4_METALBAR", 0, "sell_min", 50);
    });
    const v = vyhodnot(stav({ nakup: NAKUP_NEJLEVNEJI, refining: "Thetford" }), s)[0]!;
    expect(v.nakup).toBe("Bridgewatch");
  });

  it("nákup po vstupech vezme každou surovinu z jiného města", () => {
    // Ruda nejlevněji v Lymhurstu, nižší ingot v Martlocku.
    const s = sklad((x) => {
      x.ulozRucne("Lymhurst", "T5_ORE", 0, "sell_min", 10);
      x.ulozRucne("Martlock", "T4_METALBAR", 0, "sell_min", 10);
    });
    const v = vyhodnot(
      stav({ nakup: NAKUP_NEJLEVNEJI, jednoNakupniMesto: false, refining: "Thetford" }), s,
    )[0]!;

    expect(v.nakup).toBe(NAKUP_RUZNA_MESTA);
    const ruda = v.vstupy.find((x) => x.zaklad === "T5_ORE")!;
    const ingot = v.vstupy.find((x) => x.zaklad === "T4_METALBAR")!;
    expect(ruda.mesto).toBe("Lymhurst");
    expect(ingot.mesto).toBe("Martlock");
  });

  it("nákup po vstupech je levnější než nejlepší jedna zastávka", () => {
    const s = sklad((x) => {
      x.ulozRucne("Lymhurst", "T5_ORE", 0, "sell_min", 10);
      x.ulozRucne("Martlock", "T4_METALBAR", 0, "sell_min", 10);
    });
    const jedno = vyhodnot(stav({ nakup: NAKUP_NEJLEVNEJI, jednoNakupniMesto: true }), s)[0]!;
    const rozne = vyhodnot(stav({ nakup: NAKUP_NEJLEVNEJI, jednoNakupniMesto: false }), s)[0]!;
    expect(rozne.radek!.vysledek!.nakladSuroviny)
      .toBeLessThan(jedno.radek!.vysledek!.nakladSuroviny);
  });

  it("nákupní seznam říká, KOLIK koupit — po return rate, zaokrouhleno nahoru", () => {
    const v = vyhodnot(stav({ refining: "Thetford" }))[0]!;
    const ruda = v.vstupy.find((x) => x.zaklad === "T5_ORE")!;
    // Recept žádá 300 rudy na 100 ingotů, při RRR 36,7 % koupíš ~190.
    expect(ruda.kusu).toBeLessThan(300);
    expect(ruda.kusu).toBeGreaterThan(180);
    expect(Number.isInteger(ruda.kusu)).toBe(true);
  });
});

describe("kde prodat", () => {
  it("'nejlepší cena' najde nejdražší tržnici", () => {
    const s = sklad((x) => x.ulozRucne("Fort Sterling", "T5_METALBAR", 0, "buy_max", 9000));
    const v = vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI, refining: "Thetford" }), s)[0]!;
    expect(v.prodej).toBe("Fort Sterling");
  });

  it("riziko cesty umí drahé vzdálené město přebít", () => {
    // Doma 2000 bez rizika vs. jinde 2100 s 50% ztrátou → vyhrát má domov.
    const s = sklad((x) => x.ulozRucne("Fort Sterling", "T5_METALBAR", 0, "buy_max", 2100));
    const v = vyhodnot(
      stav({ prodej: PRODEJ_NEJLEPSI, refining: "Thetford", ztrataDoProdeje: 0.5 }), s,
    )[0]!;
    expect(v.prodej).toBe("Thetford");
  });

  it("Black Market se mezi města prodeje NEDOSTANE", () => {
    // Refined suroviny na BM nikdo neobchoduje. Kdyby se tam cena vzala,
    // karta by radila prodávat tam, kde se nic neprodá.
    const s = sklad((x) => x.ulozRucne("Black Market", "T5_METALBAR", 0, "buy_max", 99_999));
    const v = vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), s)[0]!;
    expect(v.prodej).not.toBe("Black Market");
    expect(v.radek!.vysledek!.trzbaHruba).toBe(2000 * 100);
  });
});

describe("vyloučená města", () => {
  const KRALOVSKA = ["Thetford", "Lymhurst", "Bridgewatch", "Martlock", "Fort Sterling"];

  /** Caerleon platí za ingot nejvíc — přesně situace, kterou Mirek popsal. */
  const sCaerleonem = () =>
    sklad((x) => x.ulozRucne("Caerleon", "T5_METALBAR", 0, "buy_max", 9000));

  const vyhodnotS = (st: StavRefiningu, sk: SkladCen, mesta: string[]) =>
    vyhodnotitRefining(st, sk, undefined, HRA.konstanty, NASTAVENI, nazev, 4116, 0, mesta);

  it("bez omezení vyhraje Caerleon", () => {
    const v = vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), sCaerleonem())[0]!;
    expect(v.prodej).toBe("Caerleon");
  });

  it("po vyřazení ho automatický výběr NENAVRHNE", () => {
    const v = vyhodnotS(stav({ prodej: PRODEJ_NEJLEPSI }), sCaerleonem(), KRALOVSKA)[0]!;
    expect(v.prodej).not.toBe("Caerleon");
    expect(KRALOVSKA).toContain(v.prodej);
  });

  it("vyřazení se týká i refiningu a nákupu, nejen prodeje", () => {
    const s = sklad((x) => {
      x.ulozRucne("Caerleon", "T5_ORE", 0, "sell_min", 1);
      x.ulozRucne("Caerleon", "T4_METALBAR", 0, "sell_min", 1);
    });
    const v = vyhodnotS(
      stav({ nakup: NAKUP_NEJLEVNEJI, refining: REFINING_NEJV_ZISK }), s, KRALOVSKA,
    )[0]!;
    expect(v.nakup).not.toBe("Caerleon");
    expect(v.refining).not.toBe("Caerleon");
  });

  it("nákup po vstupech taky respektuje vyřazení", () => {
    // Jinak by „nejlevněji po vstupech" poslalo hráče nakoupit tam,
    // kam si zrovna zakázal jezdit.
    const s = sklad((x) => {
      x.ulozRucne("Caerleon", "T5_ORE", 0, "sell_min", 1);
      x.ulozRucne("Caerleon", "T4_METALBAR", 0, "sell_min", 1);
    });
    const v = vyhodnotS(
      stav({ nakup: NAKUP_NEJLEVNEJI, jednoNakupniMesto: false }), s, KRALOVSKA,
    )[0]!;
    expect(v.vstupy.every((x) => x.mesto !== "Caerleon")).toBe(true);
  });

  it("RUČNÍ volba vyřazeného města platí dál", () => {
    // Vyřazení znamená „nenabízej mi to sám", ne „zakaž to". Kdyby to
    // přebilo i ruční volbu, uživatel by nastavil město a nic by se nestalo.
    const v = vyhodnotS(
      stav({ refining: "Caerleon", prodej: "Caerleon" }), sCaerleonem(), KRALOVSKA,
    )[0]!;
    expect(v.refining).toBe("Caerleon");
    expect(v.prodej).toBe("Caerleon");
  });

  it("řekne, o kolik tě vyřazení připravilo", () => {
    const v = vyhodnotS(stav({ prodej: PRODEJ_NEJLEPSI }), sCaerleonem(), KRALOVSKA)[0]!;
    expect(v.usloTi).not.toBeNull();
    expect(v.usloTi!.mesto).toBe("Caerleon");
    expect(v.usloTi!.zisk).toBeGreaterThan(v.radek!.vysledek!.zisk);
    expect(v.usloTi!.oKolik).toBeGreaterThan(0);
  });

  it("když vyřazené město NEBYLO lepší, nic se nehlásí", () => {
    // Jinak by karta otravovala u každého řádku bez ohledu na to,
    // jestli se tam vůbec vyplatí jet.
    const v = vyhodnotS(stav({ prodej: PRODEJ_NEJLEPSI }), sklad(), KRALOVSKA)[0]!;
    expect(v.usloTi).toBeNull();
  });

  it("bez vyřazení se druhý průchod nedělá a nic se nehlásí", () => {
    const v = vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), sCaerleonem())[0]!;
    expect(v.usloTi).toBeNull();
  });

  it("prázdný seznam měst nespadne, jen nic nespočítá", () => {
    // Uživatel může odškrtnout všechno. Karta na to upozorní,
    // ale nesmí spadnout ani tiše použít vyřazené město.
    const v = vyhodnotS(stav({ prodej: PRODEJ_NEJLEPSI }), sCaerleonem(), [])[0]!;
    expect(v.radek?.vysledek ?? null).toBeNull();
  });

  it("vyřazení města s bonusem nepošle refining tam, kam nesmí", () => {
    // Thetford má bonus na rudu. Když ho vyřadím, „nejlepší bonus"
    // ho nesmí použít potají.
    const bezThetfordu = KRALOVSKA.filter((m) => m !== "Thetford");
    const v = vyhodnotS(
      stav({ refining: REFINING_NEJL_BONUS }), sklad(), bezThetfordu,
    )[0]!;
    expect(v.refining).not.toBe("Thetford");
    expect(bezThetfordu).toContain(v.refining);
  });
});

describe("těsný vítěz", () => {
  it("rozdíl pod 5 % se ohlásí jako těsný", () => {
    // Dvě města skoro nastejno: Thetford s bonusem, Lymhurst s levnou rudou.
    const s = sklad((x) => {
      x.ulozRucne("Lymhurst", "T5_ORE", 0, "sell_min", 232);
      x.ulozRucne("Lymhurst", "T4_METALBAR", 0, "sell_min", 232);
    });
    const v = vyhodnot(stav({ refining: REFINING_NEJV_ZISK, nakup: NAKUP_NEJLEVNEJI }), s)[0]!;
    if (v.tesnyVitez) {
      expect(v.tesnyVitez.refining).not.toBe(v.refining);
    }
    // Test nesmí být závislý na tom, kdo vyhraje — jen na tom,
    // že se hlásí JINÉ město, ne totéž.
    expect(v.tesnyVitez?.refining).not.toBe(v.refining);
  });

  it("jasný vítěz se jako těsný NEhlásí", () => {
    // Ruda všude stejně → bonus Thetfordu je jasný rozdíl, ne šum.
    const v = vyhodnot(stav({ refining: REFINING_NEJV_ZISK }))[0]!;
    expect(v.refining).toBe("Thetford");
    expect(v.tesnyVitez).toBeNull();
  });

  it("při jednom kandidátovi není s čím srovnávat", () => {
    expect(vyhodnot(stav({ refining: "Thetford" }))[0]!.tesnyVitez).toBeNull();
  });
});

describe("stáří cen řídí auto-výběr", () => {
  /** AODP posílá čas v UTC BEZ značky — `stariHodin` si 'Z' doplňuje sám. */
  const predHodinami = (h: number) =>
    new Date(Date.now() - h * 3_600_000).toISOString().replace("Z", "");

  /** Fort Sterling nabízí nejvíc, ale cena je stará. */
  const seStarouNabidkou = (h: number) => sklad((x) => x.uloz(
    { hodnota: 9000, zdroj: "aodp", cas: predHodinami(h), mesto: "Fort Sterling", typ: "buy_max" },
    "T5_METALBAR", 0,
  ));

  it("cena starší než limit se do výběru nedostane", () => {
    const v = vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), seStarouNabidkou(100), 4116, 48)[0]!;
    expect(v.prodej).not.toBe("Fort Sterling");
  });

  it("cena v limitu se použít smí", () => {
    const v = vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), seStarouNabidkou(2), 4116, 48)[0]!;
    expect(v.prodej).toBe("Fort Sterling");
  });

  it("bez limitu (0) se stáří neřeší", () => {
    expect(vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), seStarouNabidkou(100), 4116, 0)[0]!.prodej)
      .toBe("Fort Sterling");
  });

  it("nečitelné datum cenu nezahodí a nespadne", () => {
    // Radši použít cenu s podezřelým datem než tvrdit, že žádná není.
    const s = sklad((x) => x.uloz(
      { hodnota: 9000, zdroj: "aodp", cas: "nesmysl", mesto: "Fort Sterling", typ: "buy_max" },
      "T5_METALBAR", 0,
    ));
    expect(vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), s, 4116, 48)[0]!.prodej)
      .toBe("Fort Sterling");
  });

  it("RUČNÍ cena se nezahazuje ani při přísném limitu", () => {
    // Ruční zadání je vědomý zásah uživatele — nemá čas a nesmí propadnout.
    const s = sklad((x) => x.ulozRucne("Fort Sterling", "T5_METALBAR", 0, "buy_max", 9000));
    expect(vyhodnot(stav({ prodej: PRODEJ_NEJLEPSI }), s, 4116, 1)[0]!.prodej)
      .toBe("Fort Sterling");
  });
});

// ── Logistika ──────────────────────────────────────────────────

describe("jízdy a riziko", () => {
  it("nákup i prodej doma = žádné jízdy", () => {
    const v = vyhodnot(stav({ nakup: "Thetford", refining: "Thetford", prodej: "Thetford" }))[0]!;
    expect(v.jizdDoRefiningu).toBeNull();
    expect(v.jizdDoProdeje).toBeNull();
  });

  it("nákup jinde = jízdy se počítají", () => {
    const v = vyhodnot(stav({ nakup: "Lymhurst", refining: "Thetford", prodej: "Thetford" }))[0]!;
    expect(v.jizdDoRefiningu).toBeGreaterThan(0);
    expect(v.jizdDoProdeje).toBeNull();
  });

  it("malý mount = víc jízd", () => {
    // Dávka 100 ingotů váží na nákupní straně ~176 kg, takže na velký
    // mount se vejde na jednu cestu — rozdíl je vidět až u malého.
    const velky = vyhodnot(stav({ nakup: "Lymhurst" }), sklad(), 4116)[0]!;
    const maly = vyhodnot(stav({ nakup: "Lymhurst" }), sklad(), 50)[0]!;
    expect(velky.jizdDoRefiningu).toBe(1);
    expect(maly.jizdDoRefiningu!).toBeGreaterThan(velky.jizdDoRefiningu!);
  });

  it("jízdy se počítají z NÁKUPU, ne z nominální spotřeby receptu", () => {
    // Vrácené suroviny vznikají u stanice, z tržnice je nevezeš.
    // Kdyby se počítalo z `vahaVstupu`, vyšlo by o polovinu víc jízd.
    const v = vyhodnot(stav({ nakup: "Lymhurst", refining: "Thetford" }), sklad(), 50)[0]!;
    const vysledek = v.radek!.vysledek!;
    expect(vysledek.vahaNakupu).toBeLessThan(vysledek.vahaVstupu);
    expect(v.jizdDoRefiningu).toBe(Math.ceil(vysledek.vahaNakupu / 50));
  });

  it("NEGATIVNÍ: riziko vstupů zdražuje NÁKLAD, ne tržbu", () => {
    const bez = vyhodnot(stav({ nakup: "Lymhurst", ztrataDoRefiningu: 0 }))[0]!.radek!.vysledek!;
    const s = vyhodnot(stav({ nakup: "Lymhurst", ztrataDoRefiningu: 0.2 }))[0]!.radek!.vysledek!;
    expect(s.trzbaHruba).toBe(bez.trzbaHruba);
    expect(s.nakladSuroviny).toBeCloseTo(bez.nakladSuroviny / 0.8, 6);
  });

  it("NEGATIVNÍ: riziko prodeje snižuje TRŽBU, ne náklad", () => {
    const bez = vyhodnot(stav({ prodej: "Lymhurst", ztrataDoProdeje: 0 }))[0]!.radek!.vysledek!;
    const s = vyhodnot(stav({ prodej: "Lymhurst", ztrataDoProdeje: 0.2 }))[0]!.radek!.vysledek!;
    expect(s.nakladSuroviny).toBe(bez.nakladSuroviny);
    expect(s.trzbaHruba).toBeCloseTo(bez.trzbaHruba * 0.8, 6);
  });

  it("riziko se neuplatní, když se nikam nejede", () => {
    const bezRizika = vyhodnot(stav({
      nakup: "Thetford", refining: "Thetford", prodej: "Thetford",
      ztrataDoRefiningu: 0, ztrataDoProdeje: 0,
    }))[0]!.radek!.vysledek!;
    const sRizikem = vyhodnot(stav({
      nakup: "Thetford", refining: "Thetford", prodej: "Thetford",
      ztrataDoRefiningu: 0.5, ztrataDoProdeje: 0.5,
    }))[0]!.radek!.vysledek!;
    expect(sRizikem.zisk).toBe(bezRizika.zisk);
  });
});

// ── Nižší tier ─────────────────────────────────────────────────

describe("koupit, nebo vyrobit nižší tier", () => {
  it("řetězec se počítá pro nižší tier téže linky", () => {
    const v = vyhodnot(stav())[0]!;
    expect(v.nizsiTier?.zaklad).toBe("T4_METALBAR");
  });

  it("při drahém nižším tieru doporučí vyrobit", () => {
    const s = sklad((x) => {
      for (const m of HRA.lokace.filter((l) => l.typ === "mesto")) {
        x.ulozRucne(m.nazev, "T4_METALBAR", 0, "sell_min", 100_000);
        x.ulozRucne(m.nazev, "T4_ORE", 0, "sell_min", 10);
        x.ulozRucne(m.nazev, "T3_METALBAR", 0, "sell_min", 10);
      }
    });
    const v = vyhodnot(stav({ refining: "Thetford", nakup: "Thetford" }), s)[0]!;
    expect(v.nizsiTier?.zpusob).toBe("vyrobit");
    expect(v.nizsiTier?.usporaVyrobou).toBeGreaterThan(0);
  });

  it("při levném nižším tieru doporučí koupit", () => {
    const s = sklad((x) => {
      for (const m of HRA.lokace.filter((l) => l.typ === "mesto")) {
        x.ulozRucne(m.nazev, "T4_METALBAR", 0, "sell_min", 1);
        x.ulozRucne(m.nazev, "T4_ORE", 0, "sell_min", 100_000);
      }
    });
    const v = vyhodnot(stav({ refining: "Thetford", nakup: "Thetford" }), s)[0]!;
    expect(v.nizsiTier?.zpusob).toBe("koupit");
  });

  it("T2 nižší tier nemá — vrátí null, nespadne", () => {
    const v = vyhodnot(stav({}, ["T2_METALBAR#0"]))[0]!;
    expect(v.nizsiTier).toBeNull();
  });
});

// ── Ruční cena a fixace města ──────────────────────────────────

describe("ruční prodejní cena zafixuje město", () => {
  it("při auto-výběru se město uloží jako override", () => {
    const s = stav({ prodej: PRODEJ_NEJLEPSI });
    const novy = poRucniProdejniCene(s, KLIC, "Martlock");
    expect(konfigProKlicRefiningu(novy, KLIC).prodej).toBe("Martlock");
  });

  it("u konkrétního města se nic nemění — není co fixovat", () => {
    const s = stav({ prodej: "Thetford" });
    expect(poRucniProdejniCene(s, KLIC, "Martlock")).toBe(s);
  });

  it("fixace se týká JEN té jedné položky", () => {
    const s = stav({ prodej: PRODEJ_NEJLEPSI }, [KLIC, "T6_METALBAR#0"]);
    const novy = poRucniProdejniCene(s, KLIC, "Martlock");
    expect(konfigProKlicRefiningu(novy, "T6_METALBAR#0").prodej).toBe(PRODEJ_NEJLEPSI);
  });
});

// ── Odolnost uložených dat ─────────────────────────────────────

describe("očištění uloženého stavu", () => {
  it("prázdný nebo nesmyslný vstup dá platný stav", () => {
    for (const x of [null, undefined, 42, "text", [], {}]) {
      const s = ocistiStavRefiningu(x);
      expect(s.klice).toEqual([]);
      expect(s.konfig.nakup).toBe(NAKUP_NEJLEVNEJI);
      expect(s.zdrojCen).toBe("orderbook");
    }
  });

  it("podíly mimo rozsah se ořežou do 0–1", () => {
    const s = ocistiStavRefiningu({ konfig: { ztrataDoRefiningu: 5, ztrataDoProdeje: -3 } });
    expect(s.konfig.ztrataDoRefiningu).toBe(1);
    expect(s.konfig.ztrataDoProdeje).toBe(0);
  });

  it("prázdné město spadne na výchozí, ne na neexistující tržnici", () => {
    const s = ocistiStavRefiningu({ konfig: { nakup: "", refining: "", prodej: "" } });
    expect(s.konfig.nakup).toBe(NAKUP_NEJLEVNEJI);
    expect(s.konfig.refining).toBe(REFINING_NEJL_BONUS);
    expect(s.konfig.prodej).toBe(PRODEJ_NEJLEPSI);
  });

  it("z klíčů se zahodí, co není řetězec", () => {
    expect(ocistiStavRefiningu({ klice: ["T5_METALBAR#0", 5, null] }).klice)
      .toEqual(["T5_METALBAR#0"]);
  });
});

// ── Souhrn ─────────────────────────────────────────────────────

describe("souhrn", () => {
  it("počítá spočítané, ziskové i chybějící", () => {
    const s = sklad();
    // Druhá položka bez ceny → musí být vidět jako chybějící, ne zmizet.
    const v = vyhodnotitRefining(
      stav({}, [KLIC, "T7_PLANKS#0"]), s, undefined, HRA.konstanty,
      NASTAVENI, nazev, 4116, 0,
    );
    const souhrn = souhrnRefiningu(v);
    expect(souhrn.celkem).toBe(2);
    expect(souhrn.spocitano).toBe(1);
    expect(souhrn.chybiCena).toBe(1);
  });

  it("položka bez ceny zůstane v seznamu, jen bez výsledku", () => {
    const v = vyhodnot(stav({}, ["T7_PLANKS#0"]))[0]!;
    expect(v.klic).toBe("T7_PLANKS#0");
    expect(v.radek?.vysledek ?? null).toBeNull();
  });
});
