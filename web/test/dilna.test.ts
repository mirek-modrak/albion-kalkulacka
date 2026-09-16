/**
 * Dílna — katalog, konfigurace a vyhodnocení.
 *
 * Kritické: klíč a konfigurace jsou cizí vstup (přežijí uložení v prohlížeči
 * napříč verzemi). Nevyrobitelná položka se musí zahodit, ne spadnout.
 * A „nejlevnější" musí opravdu vybrat nejvýhodnější město.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

class FalesneUloziste {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
}
const falesne = new FalesneUloziste();
vi.stubGlobal("localStorage", falesne);

const {
  katalogDilny, klicDilny, kombinaceZKlicu, konfigProKlic, mistoProdejeZKonfigu,
  vyhodnotitDilnu, nactiDilnu, surovinyDilny, runyDilny, ziskDilny, AUTO_MESTO, VYCHOZI_KONFIG,
} = await import("../src/stav/dilna");
const { SkladCen } = await import("../src/stav/skladCen");
const { SkladHistorie } = await import("../src/stav/skladHistorie");
const { HRA, lokace } = await import("../src/data/hra");

const nazev = (z: string, e: number) => `${z}#${e}`;

beforeEach(() => falesne.clear());

describe("katalog dílny", () => {
  const katalog = katalogDilny();
  it("obsahuje jen vyrobitelnou výbavu, ne suroviny", () => {
    expect(katalog.every((k) => k.polozka.druh === "vybava")).toBe(true);
    expect(katalog.some((k) => k.polozka.zaklad === "T5_METALBAR")).toBe(false);
  });
  it("meč tam je i s enchanty", () => {
    const mec = katalog.find((k) => k.polozka.zaklad === "T5_MAIN_SWORD");
    expect(mec!.enchanty).toContain(0);
    expect(mec!.enchanty).toContain(4);
  });
});

describe("kombinaceZKlicu — cizí vstup se musí ustát", () => {
  it("zahodí neznámou, surovinu i neexistující enchant", () => {
    expect(kombinaceZKlicu(["NEEXISTUJE#0"])).toEqual([]);
    expect(kombinaceZKlicu([klicDilny("T5_METALBAR", 0)])).toEqual([]);
    expect(kombinaceZKlicu([klicDilny("T5_MAIN_SWORD", 9)])).toEqual([]);
  });
  it("zachová pořadí a přeskočí jen vadné", () => {
    const k = kombinaceZKlicu([
      klicDilny("T5_MAIN_SWORD", 0), "SMETI#3", klicDilny("T6_MAIN_SWORD", 1),
    ]);
    expect(k.map((x) => x.polozka.zaklad)).toEqual(["T5_MAIN_SWORD", "T6_MAIN_SWORD"]);
  });
});

describe("konfigurace", () => {
  it("override položky přebíjí globální, jinak se vezme globální", () => {
    const glob = { mesto: "Caerleon", naBM: true, ztrata: 0.05 };
    const stav = {
      klice: ["A", "B"], konfig: glob,
      override: { A: { mesto: "Lymhurst", naBM: false, ztrata: 0 } },
    };
    expect(konfigProKlic(stav, "A").mesto).toBe("Lymhurst");
    expect(konfigProKlic(stav, "B").mesto).toBe("Caerleon");
  });

  it("místo prodeje se odvodí správně", () => {
    expect(mistoProdejeZKonfigu("Caerleon", true)).toBe("bm");        // BM bez cesty
    expect(mistoProdejeZKonfigu("Lymhurst", true)).toBe("bm-s-prevozem"); // BM s cestou
    expect(mistoProdejeZKonfigu("Lymhurst", false)).toBe("mesto");   // místní trh
  });
});

describe("vyhodnotitDilnu", () => {
  // Sklad, kde stejný meč vynáší na BM různě podle města výroby přes cenu vstupů.
  function sklad(cenyVstupu: Record<string, number>, vykupBM: number) {
    const s = new SkladCen();
    const komb = kombinaceZKlicu([klicDilny("T5_MAIN_SWORD", 0)])[0]!;
    const varianta = komb.polozka.varianty.find((v) => v.enchant === 0 && !v.sFactionTokenem);
    for (const [mesto, cena] of Object.entries(cenyVstupu)) {
      for (const vstup of varianta?.vstupy ?? []) {
        s.ulozRucne(mesto, vstup.zaklad, vstup.enchant, "sell_min", cena);
      }
    }
    s.ulozRucne("Black Market", "T5_MAIN_SWORD", 0, "buy_max", vykupBM);
    return s;
  }

  const nast = {
    mesto: "Caerleon", focus: false, denniBonus: 0, premium: true, sazbaStanice: 0,
    pocetVyrobku: 100, rezimNakupu: "instant" as const, rezimProdeje: "instant" as const,
    skupina: "zbrane", kategorie: [], mistoProdeje: "bm" as const, ztrataZasilek: 0,
  };

  it("konkrétní město počítá právě tam", () => {
    const s = sklad({ Caerleon: 500, Lymhurst: 300 }, 100_000);
    const v = vyhodnotitDilnu(
      { klice: [klicDilny("T5_MAIN_SWORD", 0)], konfig: { mesto: "Lymhurst", naBM: true, ztrata: 0 }, override: {} },
      s, undefined, HRA.konstanty, nast, nazev,
    );
    expect(v[0]!.mesto).toBe("Lymhurst");
    expect(v[0]!.radek?.vysledek).toBeTruthy();
  });

  it("nejlevnější vybere město s NEJVYŠŠÍM ziskem", () => {
    // Lymhurst má levnější vstupy → vyšší zisk. Auto ho musí vybrat.
    const s = sklad({ Caerleon: 800, Lymhurst: 300, Martlock: 900 }, 100_000);
    const v = vyhodnotitDilnu(
      { klice: [klicDilny("T5_MAIN_SWORD", 0)], konfig: { mesto: AUTO_MESTO, naBM: true, ztrata: 0 }, override: {} },
      s, undefined, HRA.konstanty, nast, nazev,
    );
    expect(v[0]!.auto).toBe(true);
    expect(v[0]!.mesto).toBe("Lymhurst");
  });

  it("bez ceny kdekoli vrátí řádek s chybí-cena, nespadne", () => {
    const s = new SkladCen();
    const v = vyhodnotitDilnu(
      { klice: [klicDilny("T5_MAIN_SWORD", 0)], konfig: { mesto: AUTO_MESTO, naBM: true, ztrata: 0 }, override: {} },
      s, undefined, HRA.konstanty, nast, nazev,
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.radek?.vysledek ?? null).toBeNull();
  });
});

describe("suroviny dílny", () => {
  it("sjednotí vstupy napříč položkami", () => {
    const s = surovinyDilny({
      klice: [klicDilny("T5_MAIN_SWORD", 0)], konfig: VYCHOZI_KONFIG, override: {},
    });
    expect(s.some((x) => x.zaklad === "T5_METALBAR")).toBe(true);
  });
});

describe("uložení a migrace", () => {
  it("kolečko tam a zpět zachová konfiguraci i override", () => {
    const stav = {
      klice: [klicDilny("T5_MAIN_SWORD", 2)],
      konfig: { mesto: "Lymhurst", naBM: false, ztrata: 0.1 },
      override: { [klicDilny("T5_MAIN_SWORD", 2)]: { mesto: AUTO_MESTO, naBM: true, ztrata: 0.05 } },
    };
    localStorage.setItem("albion:dilna:v2", JSON.stringify(stav));
    const nactene = nactiDilnu();
    expect(nactene.konfig.mesto).toBe("Lymhurst");
    expect(nactene.konfig.naBM).toBe(false);
    expect(nactene.override[klicDilny("T5_MAIN_SWORD", 2)]!.mesto).toBe(AUTO_MESTO);
  });

  it("migruje starý formát (jen seznam klíčů) na výchozí konfiguraci", () => {
    localStorage.setItem("albion:dilna:v1", JSON.stringify(["T5_MAIN_SWORD#0"]));
    const nactene = nactiDilnu();
    expect(nactene.klice).toEqual(["T5_MAIN_SWORD#0"]);
    expect(nactene.konfig).toEqual(VYCHOZI_KONFIG);
  });

  it("poškozený obsah → prázdná dílna, nespadne", () => {
    localStorage.setItem("albion:dilna:v2", "{tohle není JSON");
    expect(() => nactiDilnu()).not.toThrow();
    expect(nactiDilnu().klice).toEqual([]);
  });
});

describe("zdroj ceny — 30denní medián", () => {
  const nast = {
    mesto: "Caerleon", focus: false, denniBonus: 0, premium: true, sazbaStanice: 0,
    pocetVyrobku: 100, rezimNakupu: "instant" as const, rezimProdeje: "instant" as const,
    skupina: "zbrane", kategorie: [], mistoProdeje: "bm" as const, ztrataZasilek: 0,
  };

  /** Historie s median30 pro meč a jeho vstupy v Caerleonu + výkup na BM. */
  function historie() {
    const h = new SkladHistorie();
    const den = (d, cena) => ({ avg_price: cena, item_count: 10, timestamp: `2026-07-${d}T00:00:00` });
    h.naplnZAodp([
      { location: "Caerleon", item_id: "T5_METALBAR", quality: 1, data: [den("20", 700), den("21", 700), den("22", 700)] },
      { location: "Caerleon", item_id: "T5_LEATHER", quality: 1, data: [den("20", 400), den("21", 400), den("22", 400)] },
      { location: "Black Market", item_id: "T5_MAIN_SWORD", quality: 1, data: [den("20", 50000), den("21", 50000), den("22", 50000)] },
    ], (id) => ({ zaklad: id, enchant: 0 }));
    return h;
  }

  const stav = (zdrojCen) => ({
    klice: [klicDilny("T5_MAIN_SWORD", 0)],
    konfig: { mesto: "Caerleon", naBM: true, ztrata: 0 },
    override: {}, zdrojCen,
  });

  it("s order bookem počítá z reálného skladu, historii ignoruje", () => {
    const sklad = new SkladCen();
    // order book: jiné ceny než historie
    for (const vstup of ["T5_METALBAR", "T5_LEATHER"]) sklad.ulozRucne("Caerleon", vstup, 0, "sell_min", 100);
    sklad.ulozRucne("Black Market", "T5_MAIN_SWORD", 0, "buy_max", 99999);
    const v = vyhodnotitDilnu(stav("orderbook"), sklad, historie(), HRA.konstanty, nast, nazev);
    expect(v[0]!.radek!.vysledek!.trzbaHruba).toBe(99999 * 100);   // z order booku
  });

  it("s historií počítá z median30, ne z order booku", () => {
    const sklad = new SkladCen();   // prázdný order book
    const v = vyhodnotitDilnu(stav("historie"), sklad, historie(), HRA.konstanty, nast, nazev);
    // tržba z median30 výkupu 50 000, ne chybí-cena
    expect(v[0]!.radek!.vysledek).toBeTruthy();
    expect(v[0]!.radek!.vysledek!.trzbaHruba).toBe(50000 * 100);
  });

  it("ruční cena přebíjí median30 i v režimu historie", () => {
    const sklad = new SkladCen();
    sklad.ulozRucne("Black Market", "T5_MAIN_SWORD", 0, "buy_max", 12345);
    const v = vyhodnotitDilnu(stav("historie"), sklad, historie(), HRA.konstanty, nast, nazev);
    expect(v[0]!.radek!.vysledek!.trzbaHruba).toBe(12345 * 100);   // ruční vyhrála
  });
});

/**
 * F12 — tři cesty v Dílně.
 *
 * Detailní matematika je v jádru (`cesty.test.ts`). Tady se hlídá napojení:
 * že Dílna bere ceny ze správného města a typu, že „nejlevnější město"
 * vybírá podle vítězné cesty a že panel i medián znají runy.
 */
describe("F12 — koupit / vyrobit / enchantovat", () => {
  const nast = {
    mesto: "Caerleon", focus: false, denniBonus: 0, premium: true, sazbaStanice: 0,
    pocetVyrobku: 10, rezimNakupu: "instant" as const, rezimProdeje: "instant" as const,
    skupina: "zbrane", kategorie: [], mistoProdeje: "bm" as const, ztrataZasilek: 0,
  };
  const klic = klicDilny("T4_MAIN_AXE", 1);
  const stavV = (mesto: string) => ({
    klice: [klic], konfig: { mesto, naBM: true, ztrata: 0 }, override: {},
  });

  /** Levné suroviny .0 a runy v daném městě, drahé suroviny .1. */
  function naplnMesto(s: InstanceType<typeof SkladCen>, mesto: string, runa: number) {
    s.ulozRucne(mesto, "T4_PLANKS", 0, "sell_min", 100);
    s.ulozRucne(mesto, "T4_METALBAR", 0, "sell_min", 100);
    s.ulozRucne(mesto, "T4_PLANKS", 1, "sell_min", 5000);
    s.ulozRucne(mesto, "T4_METALBAR", 1, "sell_min", 5000);
    s.ulozRucne(mesto, "T4_RUNE", 0, "sell_min", runa);
  }

  it("zisk v Dílně je z nejlevnější cesty, ne z výroby", () => {
    const s = new SkladCen();
    naplnMesto(s, "Caerleon", 10);
    s.ulozRucne("Black Market", "T4_MAIN_AXE", 1, "buy_max", 100_000);
    const [v] = vyhodnotitDilnu(stavV("Caerleon"), s, undefined, HRA.konstanty, nast, nazev);

    expect(v!.cesty!.vitez).toBe("enchantovat");
    // Řádek skenu dál nese výrobu — a ta je ztrátovější než enchant.
    expect(v!.radek!.vysledek!.zisk).toBeLessThan(ziskDilny(v!)!);
  });

  it("nejlevnější město vybírá podle zisku vítězné cesty", () => {
    // Lymhurst: suroviny .1 levné → nejlepší výroba. Martlock: runy skoro
    // zadarmo → enchant tam vyjde ještě líp. Vybrat se musí Martlock.
    const s = new SkladCen();
    naplnMesto(s, "Lymhurst", 1_000_000);
    s.ulozRucne("Lymhurst", "T4_PLANKS", 1, "sell_min", 300);
    s.ulozRucne("Lymhurst", "T4_METALBAR", 1, "sell_min", 300);
    naplnMesto(s, "Martlock", 1);
    s.ulozRucne("Black Market", "T4_MAIN_AXE", 1, "buy_max", 100_000);

    const [v] = vyhodnotitDilnu(stavV(AUTO_MESTO), s, undefined, HRA.konstanty, nast, nazev);
    expect(v!.mesto).toBe("Martlock");
    expect(v!.cesty!.vitez).toBe("enchantovat");
  });

  it("runy se kupují ve městě výroby, ne jinde", () => {
    const s = new SkladCen();
    naplnMesto(s, "Caerleon", 10);
    s.ulozRucne("Black Market", "T4_MAIN_AXE", 1, "buy_max", 100_000);
    // V Lymhurstu jsou suroviny .0, ale runy ne → enchant tam nesmí
    // vzniknout z caerleonské ceny run.
    s.ulozRucne("Lymhurst", "T4_PLANKS", 0, "sell_min", 100);
    s.ulozRucne("Lymhurst", "T4_METALBAR", 0, "sell_min", 100);
    const [v] = vyhodnotitDilnu(stavV("Lymhurst"), s, undefined, HRA.konstanty, nast, nazev);
    expect(v!.cesty!.enchantovat).toEqual({
      ok: false, duvod: "chybi-cena", chybejici: [{ zaklad: "T4_RUNE", enchant: 0 }],
    });
  });

  it("panel surovin nabídne suroviny .0 a zvlášť runy", () => {
    const stav = { klice: [klicDilny("T4_MAIN_AXE", 2)], konfig: VYCHOZI_KONFIG, override: {} };
    const suroviny = surovinyDilny(stav).map((x) => `${x.zaklad}#${x.enchant}`);
    expect(suroviny).toContain("T4_PLANKS#2");
    expect(suroviny).toContain("T4_PLANKS#0");
    expect(suroviny.some((x) => x.includes("RUNE"))).toBe(false);
    expect(runyDilny(stav).map((x) => x.zaklad).sort()).toEqual(["T4_RUNE", "T4_SOUL"]);
  });

  it(".0 položka runy ani suroviny .0 navíc nepotřebuje", () => {
    const stav = { klice: [klicDilny("T4_MAIN_AXE", 0)], konfig: VYCHOZI_KONFIG, override: {} };
    expect(runyDilny(stav)).toEqual([]);
  });

  it("30denní medián zná i runy a suroviny .0", () => {
    const h = new SkladHistorie();
    const den = (d: string, cena: number) =>
      ({ avg_price: cena, item_count: 10, timestamp: `2026-07-${d}T00:00:00` });
    const radek = (item_id: string, cena: number, location = "Caerleon") =>
      ({ location, item_id, quality: 1, data: [den("20", cena), den("21", cena), den("22", cena)] });
    h.naplnZAodp([
      radek("T4_PLANKS#0", 100), radek("T4_METALBAR#0", 100), radek("T4_RUNE#0", 10),
      radek("T4_MAIN_AXE#1", 100_000, "Black Market"),
    ], (id) => ({ zaklad: id.split("#")[0]!, enchant: Number(id.split("#")[1]) }));

    const [v] = vyhodnotitDilnu(
      { ...stavV("Caerleon"), zdrojCen: "historie" as const },
      new SkladCen(), h, HRA.konstanty, nast, nazev,
    );
    expect(v!.cesty!.enchantovat.ok).toBe(true);
    expect(v!.cesty!.vitez).toBe("enchantovat");
  });
});

/**
 * Ochrana dat (Mirek, 2026-09-15: „extrémně důležité").
 *
 * Snímek úložiště v DNEŠNÍM formátu — ruční ceny a dílna — se musí po F12
 * načíst beze ztráty a ruční cena run se musí použít ve výpočtu.
 * Kdyby někdo zvedl verzi formátu nebo změnil tvar uložených dat,
 * tenhle test spadne dřív, než se to dostane k uživateli.
 */
describe("F12 — uložená ruční data přežijí", () => {
  it("ruční ceny a dílna ze starého uložení se načtou a použijí", async () => {
    const { nacti } = await import("../src/stav/uloziste");
    localStorage.setItem("albion:v1:europe", JSON.stringify({
      verze: 1, ulozeno: "2026-09-01T00:00:00.000Z", nastaveni: {},
      ceny: [
        { mesto: "Caerleon", zaklad: "T4_RUNE", enchant: 0, typ: "sell_min", hodnota: 10, zdroj: "rucne", cas: "2026-01-01T00:00:00" },
        { mesto: "Caerleon", zaklad: "T4_PLANKS", enchant: 0, typ: "sell_min", hodnota: 100, zdroj: "rucne", cas: "2026-01-01T00:00:00" },
        { mesto: "Caerleon", zaklad: "T4_METALBAR", enchant: 0, typ: "sell_min", hodnota: 100, zdroj: "rucne", cas: "2026-01-01T00:00:00" },
        { mesto: "Black Market", zaklad: "T4_MAIN_AXE", enchant: 1, typ: "buy_max", hodnota: 100000, zdroj: "rucne", cas: "2026-01-01T00:00:00" },
      ],
    }));
    localStorage.setItem("albion:dilna:v2", JSON.stringify({
      klice: ["T4_MAIN_AXE#1"], konfig: { mesto: "Caerleon", naBM: true, ztrata: 0 },
      override: {}, zdrojCen: "orderbook",
    }));

    const ulozene = nacti("europe");
    // Ruční ceny nestárnou — i půl roku staré musí zůstat všechny čtyři.
    expect(ulozene.ceny).toHaveLength(4);

    const sklad = new SkladCen();
    sklad.obnov(ulozene.ceny);
    const stav = nactiDilnu();
    expect(stav.klice).toEqual(["T4_MAIN_AXE#1"]);

    const [v] = vyhodnotitDilnu(stav, sklad, undefined, HRA.konstanty, {
      mesto: "Caerleon", focus: false, denniBonus: 0, premium: true, sazbaStanice: 0,
      pocetVyrobku: 1, rezimNakupu: "instant", rezimProdeje: "instant",
      skupina: "zbrane", kategorie: [], mistoProdeje: "bm", ztrataZasilek: 0,
    }, nazev);
    // 24 surovin × 100 × (1 − RRR) + 288 × 10 za runy — ruční ceny se použily.
    expect(v!.cesty!.enchantovat.ok).toBe(true);
    expect(v!.cesty!.metriky).not.toBeNull();
  });
});
