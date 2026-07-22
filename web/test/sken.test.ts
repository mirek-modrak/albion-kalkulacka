/**
 * Testy logiky skenu.
 *
 * Zaměřeno na dvě věci, které selhávají tiše:
 *  - dělení dotazů podle délky URL (přetečení = HTTP 414, ne chyba v datech)
 *  - řazení podle metriky (špatné pořadí vypadá stejně věrohodně jako správné)
 */

import { describe, expect, it } from "vitest";
import { rozdelDoDavek } from "../src/data/aodp";
import { hodnotaMetriky, potrebnaIds, seradit, souhrn, type RadekSkenu } from "../src/stav/sken";
import type { HerniPolozka, VysledekVypoctu } from "@albion/jadro";

describe("rozdelDoDavek — dělení podle DÉLKY, ne podle počtu", () => {
  it("krátká ID se vejdou do jedné dávky", () => {
    const davky = rozdelDoDavek(["T4_ORE", "T5_ORE", "T6_ORE"], 100);
    expect(davky).toHaveLength(1);
  });

  it("žádná dávka nepřeteče limit URL", () => {
    // Nejdelší reálná ID: enchantované suroviny s @n
    const ids = Array.from({ length: 500 }, (_, i) => `T8_LONGITEM_NAME_${i}_LEVEL4@4`);
    const rezerva = 200;
    for (const davka of rozdelDoDavek(ids, rezerva)) {
      const delka = davka.join(",").length;
      expect(delka + rezerva).toBeLessThanOrEqual(3600);
    }
  });

  it("nic se neztratí ani nezduplikuje", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `T${(i % 7) + 2}_POLOZKA_${i}`);
    const ploche = rozdelDoDavek(ids, 100).flat();
    expect(ploche).toHaveLength(ids.length);
    expect(new Set(ploche).size).toBe(ids.length);
    expect(ploche).toEqual(ids);
  });

  it("jediné velmi dlouhé ID vytvoří vlastní dávku, nespadne", () => {
    const dlouhe = "T8_" + "X".repeat(3000);
    const davky = rozdelDoDavek([dlouhe, "T4_ORE"], 100);
    expect(davky.length).toBeGreaterThanOrEqual(1);
    expect(davky.flat()).toContain("T4_ORE");
  });

  it("prázdný vstup dá prázdný výstup", () => {
    expect(rozdelDoDavek([], 100)).toEqual([]);
  });
});

describe("potrebnaIds", () => {
  const ids = potrebnaIds();

  it("obsahuje výstupy i jejich vstupy", () => {
    expect(ids).toContain("T5_METALBAR");
    expect(ids).toContain("T5_ORE");
    expect(ids).toContain("T4_METALBAR");
  });

  it("neobsahuje duplicity — vstupy a výstupy se překrývají", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nenabízí enchantovaný kámen, ten neexistuje", () => {
    expect(ids.some((i) => i.startsWith("T5_STONEBLOCK_LEVEL"))).toBe(false);
    expect(ids).toContain("T5_STONEBLOCK");
  });

  it("obsahuje enchant až do .4 u linek, které ho mají", () => {
    expect(ids).toContain("T5_METALBAR_LEVEL4@4");
  });

  it("vejde se do rozumného počtu dotazů", () => {
    const davky = rozdelDoDavek(ids, 200);
    expect(davky.length).toBeLessThanOrEqual(4);
  });
});

// ── Pomocné pro testy řazení ────────────────────────────────
const prazdnaPolozka = (zaklad: string): HerniPolozka => ({
  zaklad, druh: "surovina", tier: 5, vaha: 1, itemValue: 32,
  kategorie: "ore", maxEnchant: 0, varianty: [], vylepseni: [],
});

const radek = (zaklad: string, v: Partial<VysledekVypoctu> | null): RadekSkenu => ({
  polozka: prazdnaPolozka(zaklad),
  enchant: 0, nazev: zaklad,
  stav: v ? "ok" : "chybi-cena",
  vysledek: v ? ({ zisk: 0, marze: 0, ziskNaKg: 0, ziskNaFocus: 0, ziskNaKus: 0, ...v } as VysledekVypoctu) : null,
  chybejici: [], stariHodin: 1,
});

describe("řazení podle metriky", () => {
  const radky = [
    radek("MALY_DRAHY", { zisk: 100, marze: 2.0, ziskNaKg: 5 }),
    radek("VELKY_LEVNY", { zisk: 10_000, marze: 0.05, ziskNaKg: 50 }),
    radek("BEZ_CENY", null),
  ];

  it("podle marže vyhraje malý s vysokou marží", () => {
    expect(seradit(radky, "marze")[0]!.nazev).toBe("MALY_DRAHY");
  });

  it("podle absolutního zisku vyhraje velký — proto to není výchozí metrika", () => {
    expect(seradit(radky, "zisk")[0]!.nazev).toBe("VELKY_LEVNY");
  });

  it("podle zisku na kg vyhraje ten s lepší hustotou hodnoty", () => {
    expect(seradit(radky, "ziskNaKg")[0]!.nazev).toBe("VELKY_LEVNY");
  });

  it("řádky bez ceny jdou VŽDY na konec, nikdy nahoru", () => {
    for (const m of ["marze", "zisk", "ziskNaKg", "ziskNaFocus", "ziskNaKus"] as const) {
      expect(seradit(radky, m).at(-1)!.nazev).toBe("BEZ_CENY");
      expect(hodnotaMetriky(radek("X", null), m)).toBe(-Infinity);
    }
  });
});

describe("souhrn — neúplnost se nesmí schovat", () => {
  it("počítá spočítané, ziskové i chybějící zvlášť", () => {
    const s = souhrn([
      radek("A", { zisk: 100, marze: 0.1 }),
      radek("B", { zisk: -50, marze: -0.1 }),
      radek("C", null),
      radek("D", null),
    ]);
    expect(s.celkem).toBe(4);
    expect(s.spocitano).toBe(2);
    expect(s.ziskove).toBe(1);
    expect(s.chybiCena).toBe(2);
  });
});
