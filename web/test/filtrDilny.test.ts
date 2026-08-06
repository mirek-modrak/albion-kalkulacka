/**
 * Filtrování a řazení Dílny.
 *
 * Nejcennější jsou tu dvě věci: že **prázdný výběr neschová všechno**
 * a že **položky bez ceny nevyskočí nahoru** při řazení podle peněz.
 * Obojí by se v prohlížeči poznalo pozdě a vypadalo by to jako ztráta dat.
 */

import { describe, expect, it, vi } from "vitest";

class FalesneUloziste {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
vi.stubGlobal("localStorage", new FalesneUloziste());

const {
  VYCHOZI_FILTR, dostupneEnchanty, dostupneTiery, enchantZKlice, filtrujARad, moznostiRazeni, poKliknutiNaSloupec,
  jeFiltrPrazdny, nactiFiltr, tierZKlice, ulozFiltr,
} = await import("../src/stav/filtrDilny");

type Vysledek = import("../src/stav/dilna").VysledekDilny;

/**
 * Názvy zvlášť: v aplikaci je název známý i u položky bez ceny (bere se
 * z herních dat, ne z výsledku výpočtu). Test to musí dělat stejně,
 * jinak by ověřoval něco jiného než realitu.
 */
const nazvy = new Map<string, string>();

/** Minimální položka — jen to, co filtr a řazení čtou. */
function polozka(klic: string, zisk: number | null, nazev = klic): Vysledek {
  nazvy.set(klic, nazev);
  return {
    klic,
    mesto: "Caerleon",
    mistoProdeje: "bm",
    auto: false,
    radek: zisk === null ? null : {
      nazev,
      stav: "ok",
      vysledek: {
        zisk, marze: zisk / 1000, ziskNaKg: zisk / 10, ziskNaFocus: zisk / 100,
        nakladyCelkem: 1000, pocetVyrobku: 1,
      },
    },
  } as unknown as Vysledek;
}

const doplnky = {
  nazev: (v: Vysledek) => nazvy.get(v.klic) ?? v.klic,
  skupina: (v: Vysledek) => (v.klic.includes("SWORD") ? "zbrane" : "brneni"),
};

const filtr = (zmeny: Partial<typeof VYCHOZI_FILTR> = {}) => ({ ...VYCHOZI_FILTR, ...zmeny });

describe("prázdný výběr znamená VŠE, ne nic", () => {
  const data = [polozka("T4_SWORD#0", 100), polozka("T5_ARMOR#1", 200)];

  it("výchozí filtr neschová nic", () => {
    const v = filtrujARad(data, VYCHOZI_FILTR, doplnky);
    expect(v.zobrazene).toHaveLength(2);
    expect(v.skryto).toBe(0);
  });

  it("prázdný seznam tierů neschová položky bez tieru ani s tierem", () => {
    expect(filtrujARad(data, filtr({ tiery: [] }), doplnky).zobrazene).toHaveLength(2);
  });
});

describe("filtry schovávají to, co mají", () => {
  const data = [
    polozka("T4_SWORD#0", 100, "T4 Sword"),
    polozka("T5_ARMOR#1", -50, "T5 Armor"),
    polozka("T6_SWORD#2", null, "T6 Sword"),
  ];

  it("jen ziskové schová ztrátové, ale NE položky bez ceny", () => {
    // Bez ceny není ztrátové, jen neznámé. Kdyby zmizelo, uživatel by
    // nevěděl, že mu chybí data.
    const v = filtrujARad(data, filtr({ jenZiskove: true }), doplnky);
    expect(v.zobrazene.map((x) => x.klic)).toEqual(["T4_SWORD#0", "T6_SWORD#2"]);
    expect(v.skryto).toBe(1);
  });

  it("skrýt bez ceny schová jen ty bez ceny", () => {
    const v = filtrujARad(data, filtr({ skrytBezCeny: true }), doplnky);
    expect(v.zobrazene.map((x) => x.klic)).toEqual(["T4_SWORD#0", "T5_ARMOR#1"]);
  });

  it("hledání funguje podle názvu i podle klíče a nerozlišuje velikost písmen", () => {
    expect(filtrujARad(data, filtr({ hledani: "sword" }), doplnky).zobrazene).toHaveLength(2);
    expect(filtrujARad(data, filtr({ hledani: "ARMOR" }), doplnky).zobrazene).toHaveLength(1);
  });

  it("tier a enchant", () => {
    expect(filtrujARad(data, filtr({ tiery: [4, 6] }), doplnky).zobrazene).toHaveLength(2);
    expect(filtrujARad(data, filtr({ enchanty: [1] }), doplnky).zobrazene).toHaveLength(1);
  });

  it("skupina kategorií", () => {
    expect(filtrujARad(data, filtr({ skupiny: ["zbrane"] }), doplnky).zobrazene).toHaveLength(2);
  });

  it("filtry se sčítají", () => {
    const v = filtrujARad(data, filtr({ tiery: [4, 5], jenZiskove: true }), doplnky);
    expect(v.zobrazene.map((x) => x.klic)).toEqual(["T4_SWORD#0"]);
  });

  it("počítadlo skrytých sedí — jinak by položka vypadala jako ztracená", () => {
    expect(filtrujARad(data, filtr({ hledani: "nic takového" }), doplnky).skryto).toBe(3);
  });
});

describe("řazení", () => {
  const data = [
    polozka("T4_SWORD#0", 100, "Bbb"),
    polozka("T6_ARMOR#0", null, "Aaa"),
    polozka("T5_ARMOR#0", 900, "Ccc"),
  ];

  it("ruční pořadí nechá seznam být", () => {
    expect(filtrujARad(data, filtr({ razeni: "rucni" }), doplnky).zobrazene.map((x) => x.klic))
      .toEqual(["T4_SWORD#0", "T6_ARMOR#0", "T5_ARMOR#0"]);
  });

  it("podle zisku — nejvíc nahoře a BEZ CENY až úplně dole", () => {
    expect(filtrujARad(data, filtr({ razeni: "zisk" }), doplnky).zobrazene.map((x) => x.klic))
      .toEqual(["T5_ARMOR#0", "T4_SWORD#0", "T6_ARMOR#0"]);
  });

  it("i ztrátová položka je výš než položka bez ceny", () => {
    const seZtratou = [polozka("A#0", null, "A"), polozka("B#0", -500, "B")];
    expect(filtrujARad(seZtratou, filtr({ razeni: "zisk" }), doplnky).zobrazene.map((x) => x.klic))
      .toEqual(["B#0", "A#0"]);
  });

  it("podle názvu se položka bez ceny řadí normálně", () => {
    expect(filtrujARad(data, filtr({ razeni: "nazev", smer: "vzestupne" }), doplnky).zobrazene.map((x) => x.klic))
      .toEqual(["T6_ARMOR#0", "T4_SWORD#0", "T5_ARMOR#0"]);
  });

  it("podle tieru, při shodě podle enchantu", () => {
    const d = [polozka("T5_A#2", 1), polozka("T4_B#0", 1), polozka("T5_A#0", 1)];
    expect(filtrujARad(d, filtr({ razeni: "tier", smer: "vzestupne" }), doplnky).zobrazene.map((x) => x.klic))
      .toEqual(["T4_B#0", "T5_A#0", "T5_A#2"]);
  });
});

describe("kliknutí na sloupec v tabulce", () => {
  it("jiný sloupec začne od výchozího směru — u peněz shora", () => {
    const f = poKliknutiNaSloupec(VYCHOZI_FILTR, "marze");
    expect(f.razeni).toBe("marze");
    expect(f.smer).toBe("sestupne");
  });

  it("u názvu a stáří se začíná odspodu", () => {
    expect(poKliknutiNaSloupec(VYCHOZI_FILTR, "nazev").smer).toBe("vzestupne");
    expect(poKliknutiNaSloupec(VYCHOZI_FILTR, "stari").smer).toBe("vzestupne");
  });

  it("tentýž sloupec podruhé obrátí směr, potřetí zase zpátky", () => {
    const prvni = poKliknutiNaSloupec(VYCHOZI_FILTR, "zisk");
    const druhy = poKliknutiNaSloupec(prvni, "zisk");
    const treti = poKliknutiNaSloupec(druhy, "zisk");
    expect([prvni.smer, druhy.smer, treti.smer])
      .toEqual(["sestupne", "vzestupne", "sestupne"]);
  });

  it("přepnutí na jiný sloupec nezdědí obrácený směr", () => {
    const obraceny = poKliknutiNaSloupec(poKliknutiNaSloupec(VYCHOZI_FILTR, "zisk"), "zisk");
    expect(poKliknutiNaSloupec(obraceny, "marze").smer).toBe("sestupne");
  });

  it("filtry zůstanou zachované — kliknutí na sloupec je jen řazení", () => {
    const sFiltrem = { ...VYCHOZI_FILTR, tiery: [5], hledani: "sword" };
    const po = poKliknutiNaSloupec(sFiltrem, "zisk");
    expect(po.tiery).toEqual([5]);
    expect(po.hledani).toBe("sword");
  });
});

describe("obrácené řazení", () => {
  const data = [
    polozka("A#0", 100, "Aaa"),
    polozka("B#0", 900, "Bbb"),
    polozka("C#0", null, "Ccc"),
  ];

  it("vzestupně dá nejmenší zisk nahoru", () => {
    const v = filtrujARad(data, filtr({ razeni: "zisk", smer: "vzestupne" }), doplnky);
    expect(v.zobrazene.map((x) => x.klic)).toEqual(["A#0", "B#0", "C#0"]);
  });

  it("položka bez ceny zůstává dole i při obráceném směru", () => {
    // Tohle je ta past: obrácení směru by ji jinak vyhodilo nahoru
    // a uživatel by nahoře viděl to, o čem se neví nic.
    for (const smer of ["sestupne", "vzestupne"] as const) {
      const v = filtrujARad(data, filtr({ razeni: "zisk", smer }), doplnky);
      expect(v.zobrazene[v.zobrazene.length - 1]!.klic).toBe("C#0");
    }
  });

  it("název vzestupně i sestupně", () => {
    const vzhuru = filtrujARad(data, filtr({ razeni: "nazev", smer: "vzestupne" }), doplnky);
    const dolu = filtrujARad(data, filtr({ razeni: "nazev", smer: "sestupne" }), doplnky);
    expect(vzhuru.zobrazene.map((x) => x.klic)).toEqual(["A#0", "B#0", "C#0"]);
    expect(dolu.zobrazene.map((x) => x.klic)).toEqual(["C#0", "B#0", "A#0"]);
  });
});

describe("seznam Seřadit nabízí jen to, co není na sloupcích", () => {
  const pokryte = ["nazev", "zisk", "marze", "naklad", "trzba", "likvidita", "stari"] as const;

  it("zdvojené volby se nenabízejí", () => {
    const ids = moznostiRazeni([...pokryte]).map((r) => r.id);
    expect(ids).not.toContain("zisk");
    expect(ids).not.toContain("marze");
    expect(ids).not.toContain("nazev");
  });

  it("ruční pořadí zůstává vždycky — jinak by nešlo vrátit vlastní pořadí", () => {
    expect(moznostiRazeni([...pokryte]).map((r) => r.id)).toContain("rucni");
    // I v nesmyslném případě, kdy by ho sloupec „pokrýval".
    expect(moznostiRazeni(["rucni"]).map((r) => r.id)).toContain("rucni");
  });

  it("co na sloupcích není, v seznamu zůstává", () => {
    const ids = moznostiRazeni([...pokryte]).map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining(["rucni", "ziskNaKus", "ziskNaKg", "ziskNaFocus", "tier"]),
    );
  });

  it("vypnutí sloupce vrátí jeho řazení do seznamu", () => {
    // Bez tohohle by po vypnutí sloupce nešlo podle něj řadit vůbec:
    // hlavička je pryč a seznam ho nenabízel.
    const bezStari = pokryte.filter((x) => x !== "stari");
    expect(moznostiRazeni([...bezStari]).map((r) => r.id)).toContain("stari");
  });
});

describe("rozbor klíče", () => {
  it("tier a enchant", () => {
    expect(tierZKlice("T5_MAIN_RAPIER#1")).toBe(5);
    expect(enchantZKlice("T5_MAIN_RAPIER#1")).toBe(1);
    expect(enchantZKlice("T5_MAIN_RAPIER")).toBe(0);
  });

  it("položka bez tieru vrátí null, ne nulu", () => {
    expect(tierZKlice("NEJAKA_VEC#0")).toBeNull();
  });

  it("nabídka tierů a enchantů se bere z toho, co v seznamu opravdu je", () => {
    const d = [polozka("T4_A#0", 1), polozka("T7_B#3", 1), polozka("T4_C#3", 1)];
    expect(dostupneTiery(d)).toEqual([4, 7]);
    expect(dostupneEnchanty(d)).toEqual([0, 3]);
  });
});

describe("uložení filtru", () => {
  it("co se uloží, to se načte", () => {
    ulozFiltr(filtr({ hledani: "sword", tiery: [5], razeni: "zisk" }));
    const n = nactiFiltr();
    expect(n.hledani).toBe("sword");
    expect(n.tiery).toEqual([5]);
    expect(n.razeni).toBe("zisk");
  });

  it("poškozený obsah nezpůsobí pád a vrátí výchozí filtr", () => {
    localStorage.setItem("albion:filtr-dilny:v1", "{tohle není JSON");
    expect(() => nactiFiltr()).not.toThrow();
    expect(jeFiltrPrazdny(nactiFiltr())).toBe(true);
  });

  it("nesmyslné hodnoty v polích se zahodí, ne aby shodily vykreslení", () => {
    localStorage.setItem("albion:filtr-dilny:v1", JSON.stringify({
      tiery: "není pole", enchanty: [1, "x"], skupiny: null, razeni: "vymyšlené",
    }));
    const n = nactiFiltr();
    expect(n.tiery).toEqual([]);
    expect(n.enchanty).toEqual([1]);
    expect(n.skupiny).toEqual([]);
    expect(n.razeni).toBe("rucni");
  });
});
