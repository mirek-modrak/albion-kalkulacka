/**
 * Řetěz „koupit vs. vyrobit".
 *
 * Dvě věci, které musí platit vždycky:
 *  - rekurze SKONČÍ, i kdyby se v datech objevil cyklus
 *  - chybějící cena prostředního článku NEZAHODÍ platný výsledek
 */

import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { shrnRetezec, spocitatRetezec, type KontextRetezce } from "../src/retezec.js";
import type { Enchant, HerniData, HerniPolozka } from "../src/typy.js";

const require = createRequire(import.meta.url);
const data = require("../data/hra.json") as HerniData;

const najdiPolozku = (z: string) => data.polozky.find((p) => p.zaklad === z);

/** Kontext s pevnými cenami — ať jsou testy nezávislé na trhu. */
function kontext(ceny: Record<string, number>, bonus = 58): KontextRetezce {
  return {
    najdiPolozku,
    cena: (z, e) => ceny[`${z}#${e}`] ?? null,
    bonusProPolozku: () => bonus,
    sazbaStanice: 0,          // ať se poplatek neplete do kontrolních čísel
    konstanty: data.konstanty,
  };
}

describe("rekurze skončí", () => {
  it("zastaví u suroviny bez receptu", () => {
    const u = spocitatRetezec("T5_ORE", 0, kontext({ "T5_ORE#0": 500 }));
    expect(u.zpusob).toBe("koupit");
    expect(u.vstupy).toHaveLength(0);
  });

  it("nespadne na cyklu v datech", () => {
    // Umělá položka, která je vstupem sama sobě.
    const zacyklena: HerniPolozka = {
      zaklad: "CYKLUS", nazev: null, druh: "surovina", tier: 5, vaha: 1,
      itemValue: 32, kategorie: null, maxEnchant: 0, vylepseni: [],
      varianty: [{
        enchant: 0, pocetVyrobenych: 1, focus: 10, cas: 0, silver: 0, sFactionTokenem: false,
        vstupy: [{ zaklad: "CYKLUS", enchant: 0, pocet: 2, vratna: true }],
      }],
    };

    const k: KontextRetezce = {
      najdiPolozku: (z) => (z === "CYKLUS" ? zacyklena : undefined),
      cena: () => 100,
      bonusProPolozku: () => 58,
      sazbaStanice: 0,
      konstanty: data.konstanty,
    };

    // Nesmí se zacyklit ani vyčerpat zásobník.
    expect(() => spocitatRetezec("CYKLUS", 0, k)).not.toThrow();
  });

  it("respektuje strop hloubky", () => {
    const u = spocitatRetezec("T8_METALBAR", 0, {
      ...kontext({}), maxHloubka: 2,
    });
    // Hluboko se nezanoří — buď najde cenu, nebo vrátí nedostupné.
    expect(["koupit", "vyrobit", "nedostupne"]).toContain(u.zpusob);
  });
});

describe("koupit vs. vyrobit", () => {
  it("levná ruda → vyplatí se vyrobit", () => {
    // T3 ingot = 2× T3 ruda + 1× T2 ingot. Při RRR 36,7 % je efektivní
    // spotřeba 2 × 0,633 = 1,266 rudy a 0,633 ingotu.
    const u = spocitatRetezec("T3_METALBAR", 0, kontext({
      "T3_METALBAR#0": 1000,   // drahé na trhu
      "T3_ORE#0": 100,
      "T2_METALBAR#0": 100,
    }));

    expect(u.zpusob).toBe("vyrobit");
    // 1,266 × 100 + 0,633 × 100 = 189,9
    expect(u.nakladVyrobou).toBeCloseTo(189.87, 1);
    expect(u.naklad).toBeCloseTo(189.87, 1);
    expect(u.usporaVyrobou).toBeCloseTo(0.81, 2);
  });

  it("drahá ruda → vyplatí se koupit", () => {
    const u = spocitatRetezec("T3_METALBAR", 0, kontext({
      "T3_METALBAR#0": 100,    // levné na trhu
      "T3_ORE#0": 1000,
      "T2_METALBAR#0": 1000,
    }));

    expect(u.zpusob).toBe("koupit");
    expect(u.naklad).toBe(100);
    expect(u.vstupy).toHaveLength(0);   // řetěz se dál nerozvíjí
  });

  it("úspora se SKLÁDÁ přes patra", () => {
    // Když je ruda všude levná, vyplatí se jít co nejhlouběji.
    const levna = spocitatRetezec("T5_METALBAR", 0, kontext({
      "T5_METALBAR#0": 10_000,
      "T5_ORE#0": 100, "T4_ORE#0": 100, "T3_ORE#0": 100, "T2_ORE#0": 100,
    }));

    expect(levna.zpusob).toBe("vyrobit");
    // Musí se zanořit až k rudě, ne se zastavit na T4.
    const t4 = levna.vstupy.find((v) => v.uzel.zaklad === "T4_METALBAR")!;
    expect(t4.uzel.zpusob).toBe("vyrobit");
  });

  it("return rate snižuje spotřebu vstupů", () => {
    const bezBonusu = spocitatRetezec("T3_METALBAR", 0,
      kontext({ "T3_ORE#0": 100, "T2_METALBAR#0": 100 }, 0));
    const sBonusem = spocitatRetezec("T3_METALBAR", 0,
      kontext({ "T3_ORE#0": 100, "T2_METALBAR#0": 100 }, 117));

    expect(sBonusem.nakladVyrobou!).toBeLessThan(bezBonusu.nakladVyrobou!);
  });
});

describe("chybějící ceny", () => {
  it("chybí cena prostředního článku → pořád lze vyrobit", () => {
    // Tohle je jádro vady 3: kdyby chybějící cena T2 ingotu utla řetěz,
    // zahodili bychom platný výsledek.
    const u = spocitatRetezec("T3_METALBAR", 0, kontext({
      "T3_METALBAR#0": 1000,
      "T3_ORE#0": 100,
      "T2_ORE#0": 50,
      // T2_METALBAR cenu NEMÁ — musí se dopočítat výrobou z T2 rudy
    }));

    expect(u.zpusob).toBe("vyrobit");
    expect(u.naklad).not.toBeNull();

    const t2 = u.vstupy.find((v) => v.uzel.zaklad === "T2_METALBAR")!;
    expect(t2.uzel.zpusob).toBe("vyrobit");   // jediná cesta
    expect(t2.uzel.cenaNaTrhu).toBeNull();
  });

  it("jen vyrobit je platný výsledek, ne chyba", () => {
    const u = spocitatRetezec("T3_METALBAR", 0, kontext({
      "T3_ORE#0": 100, "T2_ORE#0": 50,
      // T3_METALBAR se koupit nedá
    }));
    expect(u.zpusob).toBe("vyrobit");
    expect(u.usporaVyrobou).toBeNull();   // není s čím porovnat
  });

  it("nic nejde → nedostupné, ne nula", () => {
    const u = spocitatRetezec("T3_METALBAR", 0, kontext({}));
    expect(u.zpusob).toBe("nedostupne");
    expect(u.naklad).toBeNull();
  });
});

describe("poplatek stanice", () => {
  it("se platí na KAŽDÉM patře, kde se vyrábí", () => {
    const bez = spocitatRetezec("T5_METALBAR", 0, {
      ...kontext({ "T5_ORE#0": 10, "T4_ORE#0": 10, "T3_ORE#0": 10, "T2_ORE#0": 10 }),
      sazbaStanice: 0,
    });
    const s = spocitatRetezec("T5_METALBAR", 0, {
      ...kontext({ "T5_ORE#0": 10, "T4_ORE#0": 10, "T3_ORE#0": 10, "T2_ORE#0": 10 }),
      sazbaStanice: 1000,
    });

    // Rozdíl musí být větší než poplatek za jedno patro — platí se čtyřikrát.
    const jednoPatro = 32 * data.konstanty.nutritionKoeficient * 1000 / 100;
    expect(s.nakladVyrobou! - bez.nakladVyrobou!).toBeGreaterThan(jednoPatro);
  });
});

describe("transmutace surovin", () => {
  // Nález z F8: raw suroviny od T4 výš MAJÍ recept — jde je přeměnit
  // z nižšího tieru za pevný poplatek (T4 ruda → T5 ruda = 781 silver).
  it("T5 ruda jde vyrobit z T4 rudy", () => {
    const p = najdiPolozku("T5_ORE")!;
    const v = p.varianty.find((x) => x.enchant === 0)!;
    expect(v.vstupy).toEqual([
      { zaklad: "T4_ORE", enchant: 0, pocet: 1, vratna: true },
    ]);
  });

  it("transmutace NENÍ zadarmo — stojí pevný silver", () => {
    // Bez tohohle poplatku by řetěz transmutaci chybně doporučoval.
    const v = najdiPolozku("T5_ORE")!.varianty.find((x) => x.enchant === 0)!;
    expect(v.silver).toBe(781);
    expect(v.focus).toBe(0);
  });

  it("běžný refining pevný poplatek nemá", () => {
    const v = najdiPolozku("T5_METALBAR")!.varianty
      .find((x) => x.enchant === 0 && !x.sFactionTokenem)!;
    expect(v.silver).toBe(0);
  });

  it("poplatek za transmutaci se promítne do nákladu", () => {
    // T4 ruda za 1 → T5 ruda: bez poplatku by to bylo skoro zadarmo.
    const u = spocitatRetezec("T5_ORE", 0, kontext({ "T4_ORE#0": 1 }));
    expect(u.zpusob).toBe("vyrobit");
    expect(u.nakladVyrobou!).toBeGreaterThan(700);   // dominuje 781 silver
  });

  it("drahá transmutace → radši koupit", () => {
    const u = spocitatRetezec("T5_ORE", 0, kontext({
      "T5_ORE#0": 200,     // levnější než transmutace za 781
      "T4_ORE#0": 1,
    }));
    expect(u.zpusob).toBe("koupit");
  });
});

describe("souhrn řetězu", () => {
  it("sečte focus a kroky přes všechna patra", () => {
    const u = spocitatRetezec("T5_METALBAR", 0, kontext({
      "T5_METALBAR#0": 999_999,
      "T5_ORE#0": 1, "T4_ORE#0": 1, "T3_ORE#0": 1, "T2_ORE#0": 1,
    }));
    const s = shrnRetezec(u);

    // T5 bar → T4 bar → T3 bar → T2 bar = 4 kroky.
    // Transmutace rudy se při levné rudě nevyplatí, takže se nepočítá.
    expect(s.krokuVyroby).toBeGreaterThanOrEqual(4);
    expect(s.nejhlubsiUroven).toBeGreaterThanOrEqual(3);
    // Focus se platí na každém patře — víc než jen za T5 (94).
    expect(s.focusCelkem).toBeGreaterThan(94);
  });

  it("u koupené položky je nula kroků", () => {
    const u = spocitatRetezec("T5_METALBAR", 0, kontext({ "T5_METALBAR#0": 1 }));
    expect(shrnRetezec(u).krokuVyroby).toBe(0);
  });
});

describe("enchanty", () => {
  it("T4 s enchantem bere NEenchantovaný T3", () => {
    const u = spocitatRetezec("T4_METALBAR", 2 as Enchant, kontext({
      "T4_METALBAR#2": 99_999,
      "T4_ORE#2": 100,
      "T3_METALBAR#0": 100,
    }));
    expect(u.zpusob).toBe("vyrobit");
    const t3 = u.vstupy.find((v) => v.uzel.zaklad === "T3_METALBAR")!;
    expect(t3.uzel.enchant).toBe(0);
  });
});
