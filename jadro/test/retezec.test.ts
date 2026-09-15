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
    sazbaStanice: () => 0,    // ať se poplatek neplete do kontrolních čísel
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
      sazbaStanice: () => 0,
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
      sazbaStanice: () => 0,
    });
    const s = spocitatRetezec("T5_METALBAR", 0, {
      ...kontext({ "T5_ORE#0": 10, "T4_ORE#0": 10, "T3_ORE#0": 10, "T2_ORE#0": 10 }),
      sazbaStanice: () => 1000,
    });

    // Rozdíl musí být větší než poplatek za jedno patro — platí se čtyřikrát.
    const jednoPatro = 32 * data.konstanty.nutritionKoeficient * 1000 / 100;
    expect(s.nakladVyrobou! - bez.nakladVyrobou!).toBeGreaterThan(jednoPatro);
  });

  it("KAŽDÉ PATRO má svou sazbu, ne sazbu vrcholu", () => {
    // Meč se vyrábí ve Warrior's Forge, ale ingoty pod ním v Tavírně.
    // Do F11 tu bylo jedno číslo, takže se sazba kovárny uplatnila
    // i na tavení — a náklad na vlastní výrobu vyšel špatně. Právě podle
    // něj se přitom rozhoduje „koupit, nebo vyrobit".
    const ceny = { "T5_METALBAR#0": 900, "T5_LEATHER#0": 700, "T5_ORE#0": 10, "T4_METALBAR#0": 10 };

    // Drahá jen kovárna (meč), tavírna zdarma.
    const jenVrchol = spocitatRetezec("T5_MAIN_SWORD", 0, {
      ...kontext(ceny),
      sazbaStanice: (p) => (p.kategorie === "sword" ? 1000 : 0),
    });
    // Drahá jen tavírna (ingoty), kovárna zdarma.
    const jenPatra = spocitatRetezec("T5_MAIN_SWORD", 0, {
      ...kontext(ceny),
      sazbaStanice: (p) => (p.kategorie === "ore" ? 1000 : 0),
    });

    // Kdyby se sazba brala z vrcholu pro všechna patra, obě čísla by
    // vyšla stejně. Musí se lišit — a poplatek za tavení musí být vidět.
    expect(jenVrchol.nakladVyrobou).not.toBeCloseTo(jenPatra.nakladVyrobou!, 6);
    expect(jenPatra.nakladVyrobou!).toBeGreaterThan(0);
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

/**
 * Třetí cesta: povýšit hotový kus runou / duší / relikvií.
 *
 * T4 sekera potřebuje 288 run na .1, 288 duší na .2 a 288 relikvií na .3.
 * Kontrolní čísla se počítají ručně, ne z kódu — jinak by test jen opsal
 * to, co kód dělá, včetně případné chyby.
 */
describe("enchantovat runou", () => {
  /** Ceny, u kterých je enchantování jasně nejlevnější. */
  const levneRuny = {
    "T4_MAIN_AXE#1": 100_000,   // na trhu draho
    "T4_MAIN_AXE#0": 10_000,
    "T4_RUNE#0": 10,
  };

  it("levné runy → vyplatí se enchantovat", () => {
    const u = spocitatRetezec("T4_MAIN_AXE", 1 as Enchant, kontext(levneRuny));

    // 10 000 za základní kus + 288 × 10 za runy
    expect(u.zpusob).toBe("enchantovat");
    expect(u.nakladEnchantem).toBeCloseTo(12_880, 6);
    expect(u.naklad).toBeCloseTo(12_880, 6);
    // Výroba z .1 surovin nejde — jejich ceny nejsou.
    expect(u.nakladVyrobou).toBeNull();
    expect(u.uspora).toBeCloseTo(0.8712, 4);
  });

  it("řetěz enchantů se poskládá: .0 → .1 → .2", () => {
    const u = spocitatRetezec("T4_MAIN_AXE", 2 as Enchant, kontext({
      "T4_MAIN_AXE#2": 1_000_000,
      "T4_MAIN_AXE#0": 10_000,
      "T4_RUNE#0": 10,
      "T4_SOUL#0": 20,
      // Cena .1 na trhu ZÁMĚRNĚ chybí — mezistupeň musí vzniknout výpočtem.
    }));

    // .1 = 10 000 + 2 880 = 12 880;  .2 = 12 880 + 288 × 20 = 18 640
    expect(u.zpusob).toBe("enchantovat");
    expect(u.naklad).toBeCloseTo(18_640, 6);

    const nizsi = u.vstupy[0]!.uzel;
    expect(nizsi.enchant).toBe(1);
    expect(nizsi.zpusob).toBe("enchantovat");
    expect(nizsi.naklad).toBeCloseTo(12_880, 6);
  });

  it("return rate se na runy NEUPLATNÍ", () => {
    // Nesmyslně vysoký bonus: kdyby na runy nebo na základní kus spadl
    // return rate, náklad by klesl pod kontrolní číslo.
    const u = spocitatRetezec("T4_MAIN_AXE", 1 as Enchant, kontext(levneRuny, 900));
    expect(u.nakladEnchantem).toBeCloseTo(12_880, 6);
  });

  it("enchant nestojí focus ani se nepočítá jako krok výroby", () => {
    const s = shrnRetezec(spocitatRetezec("T4_MAIN_AXE", 1 as Enchant, kontext(levneRuny)));
    expect(s.krokuEnchantu).toBe(1);
    expect(s.krokuVyroby).toBe(0);
    expect(s.focusCelkem).toBe(0);
  });

  it("drahé runy → radši koupit hotové", () => {
    const u = spocitatRetezec("T4_MAIN_AXE", 1 as Enchant, kontext({
      ...levneRuny,
      "T4_RUNE#0": 10_000,     // 288 × 10 000 = 2,88 M
    }));
    expect(u.zpusob).toBe("koupit");
    expect(u.nakladEnchantem).toBeCloseTo(2_890_000, 6);
    expect(u.vstupy).toHaveLength(0);
  });

  // ── Negativní prostor ────────────────────────────────────────

  it("chybějící cena runy cestu zruší, ale ostatní NEZABIJE", () => {
    const u = spocitatRetezec("T4_MAIN_AXE", 1 as Enchant, kontext({
      "T4_MAIN_AXE#1": 100_000,
      "T4_MAIN_AXE#0": 10_000,
      "T4_PLANKS#1": 100,
      "T4_METALBAR#1": 100,
      // cena runy chybí
    }));

    // Nesmí vzniknout náklad z neúplného součtu.
    expect(u.nakladEnchantem).toBeNull();
    // A výroba i nákup musí dál fungovat: 24 surovin × 100 × (1 − RRR).
    expect(u.zpusob).toBe("vyrobit");
    expect(u.nakladVyrobou).not.toBeNull();
  });

  it("chybějící cena kusu o stupeň níž cestu taky zruší", () => {
    const u = spocitatRetezec("T4_MAIN_AXE", 1 as Enchant, kontext({
      "T4_MAIN_AXE#1": 100_000,
      "T4_RUNE#0": 10,
      // cena .0 chybí a vyrobit se nedá — chybí i suroviny
    }));
    expect(u.nakladEnchantem).toBeNull();
    expect(u.zpusob).toBe("koupit");
  });

  it("na .4 cesta runou neexistuje", () => {
    // Herní data mají vylepšení jen na stupně 1–3. Kdyby se kód spolehl
    // na „enchant − 1", nabídl by tu neexistující postup.
    const u = spocitatRetezec("T4_MAIN_AXE", 4 as Enchant, kontext({
      "T4_MAIN_AXE#4": 100_000,
      "T4_MAIN_AXE#3": 10,
      "T4_RELIC#0": 1,
    }));
    expect(u.nakladEnchantem).toBeNull();
    expect(u.zpusob).toBe("koupit");
  });

  it("suroviny cestu runou nemají vůbec", () => {
    const u = spocitatRetezec("T4_PLANKS", 1 as Enchant, kontext({
      "T4_PLANKS#1": 500,
      "T4_RUNE#0": 1,
    }));
    expect(u.nakladEnchantem).toBeNull();
  });

  it("při SHODĚ nákladů vyhraje nákup", () => {
    // Za stejné peníze je nákup nejmíň práce. Zároveň hlídá, že se
    // nezměnilo pořadí z doby před třetí cestou.
    const u = spocitatRetezec("T4_MAIN_AXE", 1 as Enchant, kontext({
      ...levneRuny,
      "T4_MAIN_AXE#1": 12_880,   // přesně tolik, kolik stojí enchantování
    }));
    expect(u.zpusob).toBe("koupit");
    expect(u.uspora).toBe(0);
  });
});

/**
 * Recept bez vstupů není výroba.
 *
 * Regrese k vadě nalezené při zavádění cesty enchantem: 140 položek má
 * v datech „recept" s prázdným seznamem surovin (tokeny, essence potions,
 * blueprinty cap). Součet vstupů 0 + poplatek 0 = náklad 0, takže je řetěz
 * hlásil jako „vyrobit zadarmo" — a přes Siphoned Energy to dělalo zdarma
 * i všechny runy.
 */
describe("recept bez vstupů není výroba", () => {
  it("Siphoned Energy nejde vyrobit z ničeho", () => {
    const u = spocitatRetezec("UNIQUE_GVGTOKEN_GENERIC", 0, kontext({}));
    expect(u.nakladVyrobou).toBeNull();
    expect(u.zpusob).toBe("nedostupne");
  });

  it("runa bez ceny je nedostupná, ne zadarmo", () => {
    // Přes token by dřív vyšla na 0 — a enchantování pak vždycky zdarma.
    const u = spocitatRetezec("T4_RUNE", 0, kontext({}));
    expect(u.naklad).toBeNull();
  });

  it("skutečný recept se ale nezakázal", () => {
    // Runa = 1 token na 75 kusů. Když je token oceněný, výroba platí.
    const u = spocitatRetezec("T4_RUNE", 0, kontext({
      "T4_RUNE#0": 10_000,
      "UNIQUE_GVGTOKEN_GENERIC#0": 7500,
    }));
    expect(u.zpusob).toBe("vyrobit");
    expect(u.nakladVyrobou!).toBeGreaterThan(0);
  });
});
