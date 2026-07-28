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
  vyhodnotitDilnu, nactiDilnu, surovinyDilny, AUTO_MESTO, VYCHOZI_KONFIG,
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
