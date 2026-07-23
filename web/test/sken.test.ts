/**
 * Testy logiky skenu.
 *
 * Zaměřeno na dvě věci, které selhávají tiše:
 *  - dělení dotazů podle délky URL (přetečení = HTTP 414, ne chyba v datech)
 *  - řazení podle metriky (špatné pořadí vypadá stejně věrohodně jako správné)
 */

import { describe, expect, it } from "vitest";
import { rozdelDoDavek } from "../src/data/aodp";
import {
  hodnotaMetriky, kombinaceProSken, lzeProdatNaBM, potrebnaIds, seradit,
  skenovanaIds, souhrn, spocitatSken, typProdejeProMisto,
  type RadekSkenu,
} from "../src/stav/sken";
import { SkladCen } from "../src/stav/skladCen";
import { SkladHistorie } from "../src/stav/skladHistorie";
import { HRA, lokace } from "../src/data/hra";
import { SKUPINY, SUROVINY_ID, kategorieSPocty } from "../src/data/kategorie";
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

describe("potrebnaIds — výbava", () => {
  const zbrane = potrebnaIds("zbrane");

  it("obsahuje samotné zbraně", () => {
    expect(zbrane).toContain("T5_MAIN_SWORD");
  });

  it("VŽDY obsahuje i vstupy, které do výběru nepatří", () => {
    // Nejdůležitější test F4. Kdyby vstupy chyběly, všechny řádky by
    // skončily na „chybí cena" — sken zbraní nestahuje ceny surovin,
    // protože suroviny nejsou zbraně.
    expect(zbrane).toContain("T5_METALBAR");
    expect(zbrane).toContain("T5_LEATHER");
  });

  it("enchantovaná výbava má jiný tvar ID než suroviny", () => {
    // Výbava: @n bez _LEVELn. Surovina: _LEVELn@n.
    expect(zbrane).toContain("T5_MAIN_SWORD@1");
    expect(zbrane).not.toContain("T5_MAIN_SWORD_LEVEL1@1");
    expect(zbrane).toContain("T5_METALBAR_LEVEL1@1");
  });

  it("zúžení na jednu kategorii zmenší rozsah", () => {
    const meceOnly = potrebnaIds("zbrane", ["sword"]);
    expect(meceOnly.length).toBeLessThan(zbrane.length);
    expect(meceOnly).toContain("T5_MAIN_SWORD");
    expect(meceOnly.some((i) => i.includes("BOW"))).toBe(false);
    // Vstupy musí zůstat i při zúžení.
    expect(meceOnly).toContain("T5_METALBAR");
  });

  it("bez duplicit — víc zbraní sdílí tytéž vstupy", () => {
    expect(new Set(zbrane).size).toBe(zbrane.length);
  });

  it("brnění je jiná množina než zbraně", () => {
    const brneni = potrebnaIds("brneni");
    expect(brneni).toContain("T5_HEAD_PLATE_SET1");
    expect(brneni).not.toContain("T5_MAIN_SWORD");
  });
});

describe("potrebnaIds — suroviny", () => {
  const ids = potrebnaIds(SUROVINY_ID);

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
  zaklad, nazev: null, druh: "surovina", tier: 5, vaha: 1, itemValue: 32,
  kategorie: "ore", maxEnchant: 0, varianty: [], vylepseni: [],
});

const radek = (zaklad: string, v: Partial<VysledekVypoctu> | null): RadekSkenu => ({
  polozka: prazdnaPolozka(zaklad),
  enchant: 0, nazev: zaklad,
  stav: v ? "ok" : "chybi-cena",
  vysledek: v ? ({ zisk: 0, marze: 0, ziskNaKg: 0, ziskNaFocus: 0, ziskNaKus: 0, ...v } as VysledekVypoctu) : null,
  chybejici: [], stariHodin: 1, likvidita: null,
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

describe("skupiny kategorií", () => {
  it("každá skupina kromě surovin má aspoň jednu existující kategorii", () => {
    for (const s of SKUPINY) {
      if (s.id === SUROVINY_ID) continue;
      expect(kategorieSPocty(s.id).length,
        `skupina ${s.id} nemá v datech žádnou kategorii`).toBeGreaterThan(0);
    }
  });

  it("žádná kategorie nepatří do dvou skupin naráz", () => {
    const videno = new Map<string, string>();
    for (const s of SKUPINY) {
      for (const k of s.kategorie) {
        expect(videno.has(k), `${k} je i ve skupině ${videno.get(k)}`).toBe(false);
        videno.set(k, s.id);
      }
    }
  });

  it("sken jedné kategorie zbraní se vejde do jednoho dotazu", () => {
    const davky = rozdelDoDavek(potrebnaIds("zbrane", ["sword"]), 200);
    expect(davky.length).toBeLessThanOrEqual(2);
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

describe("skenovanaIds — jen výstupy, bez vstupů", () => {
  it("obsahuje skenované položky", () => {
    expect(skenovanaIds("zbrane")).toContain("T5_MAIN_SWORD");
  });

  it("NEobsahuje vstupy — historie je vlastnost toho, co prodáváš", () => {
    // Rozdíl proti `potrebnaIds`, který vstupy obsahovat MUSÍ. U výbavy
    // je to polovina přenosu a historie je řádově megabajty.
    const skenovane = skenovanaIds("zbrane");
    const potrebne = potrebnaIds("zbrane");
    expect(skenovane.length).toBeLessThan(potrebne.length);
    expect(skenovane.every((id) => potrebne.includes(id))).toBe(true);
    // Ingot je vstup meče, ne skenovaná zbraň.
    expect(skenovane.some((id) => id.includes("METALBAR"))).toBe(false);
  });
});

describe("likvidita v řádcích skenu", () => {
  const nastaveni = {
    mesto: "Thetford", focus: false, denniBonus: 0, premium: true,
    sazbaStanice: 200, pocetVyrobku: 100,
    rezimNakupu: "instant" as const, rezimProdeje: "order" as const,
    skupina: SUROVINY_ID, kategorie: [],
  };

  const spocitej = (historie?: SkladHistorie) => spocitatSken(
    nastaveni, new SkladCen(), undefined, HRA.konstanty,
    (z, e) => `${z}#${e}`, historie,
  );

  it("bez skladu historie je likvidita null, NE „bez-dat“", () => {
    // „bez-dat" je tvrzení „ptali jsme se a nic tam není". Když se historie
    // netáhla, je to tvrzení nepravdivé — a stálo by u KAŽDÉHO řádku.
    const radky = spocitej();
    expect(radky.length).toBeGreaterThan(0);
    expect(radky.every((r) => r.likvidita === null)).toBe(true);
  });

  it("prázdný sklad historie taky dá null — nic se nenačetlo", () => {
    const radky = spocitej(new SkladHistorie());
    expect(radky.every((r) => r.likvidita === null)).toBe(true);
  });

  it("po načtení historie už likvidita je", () => {
    const h = new SkladHistorie();
    h.naplnZAodp([{
      location: "Thetford", item_id: "T4_PLANKS", quality: 1,
      data: [{ avg_price: 500, item_count: 9000, timestamp: "2026-07-22T00:00:00" }],
    }], (id) => ({ zaklad: id, enchant: 0 }));

    const radky = spocitej(h);
    expect(radky.every((r) => r.likvidita !== null)).toBe(true);

    // Položka, pro kterou data přišla, má stav podle objemu.
    const planks = radky.find((r) => r.polozka.zaklad === "T4_PLANKS" && r.enchant === 0);
    expect(planks?.likvidita?.stav).toBe("ok");
    // Ostatní položky v odpovědi nebyly → „bez-dat", protože jsme se PTALI.
    const jina = radky.find((r) => r.polozka.zaklad !== "T4_PLANKS");
    expect(jina?.likvidita?.stav).toBe("bez-dat");
  });

  it("likvidita je i na řádcích bez ceny — tam je nejcennější", () => {
    const h = new SkladHistorie();
    h.naplnZAodp([{
      location: "Thetford", item_id: "T4_PLANKS", quality: 1,
      data: [{ avg_price: 500, item_count: 9000, timestamp: "2026-07-22T00:00:00" }],
    }], (id) => ({ zaklad: id, enchant: 0 }));

    // Sklad cen je prázdný, takže VŠECHNY řádky mají „chybí cena".
    const radky = spocitej(h);
    const planks = radky.find((r) => r.polozka.zaklad === "T4_PLANKS" && r.enchant === 0);
    expect(planks?.stav).toBe("chybi-cena");
    expect(planks?.likvidita?.souhrn.objemTyden).toBe(9000);
  });
});

describe("Black Market — kde se smí prodávat", () => {
  it("jen v Caerleonu — jinde by to znamenalo mlčky předpokládat cestu", () => {
    expect(lzeProdatNaBM("Caerleon", "zbrane")).toBe(true);
    for (const m of ["Thetford", "Lymhurst", "Bridgewatch", "Martlock",
                     "Fort Sterling", "Brecilien"]) {
      expect(lzeProdatNaBM(m, "zbrane")).toBe(false);
    }
  });

  it("suroviny na Black Marketu ne — neobchoduje je", () => {
    // Ověřeno na živých datech: T5 Planks i T5 Metal Bar mají na BM
    // v týdenním okně nulový objem, zatímco na tržnicích statisíce kusů.
    expect(lzeProdatNaBM("Caerleon", SUROVINY_ID)).toBe(false);
  });

  it.each(["tasky", "plaste", "brneni", "nastroje"])(
    "ostatní výbava (%s) na Black Market smí", (skupina) => {
      expect(lzeProdatNaBM("Caerleon", skupina)).toBe(true);
    });
});

describe("Black Market ve výpočtu", () => {
  const zaklad = {
    focus: false, denniBonus: 0, premium: true, sazbaStanice: 200,
    pocetVyrobku: 1, rezimNakupu: "instant" as const, rezimProdeje: "instant" as const,
    skupina: "zbrane", kategorie: ["sword"],
  };

  /** Sklad, kde má TÁŽ položka jinou cenu v Caerleonu a jinou na BM. */
  function skladSObemaCenami() {
    const s = new SkladCen();
    for (const { polozka, enchant } of kombinaceProSken("zbrane", ["sword"])) {
      // Vstupy jen v Caerleonu — na BM se nedá nakupovat a nesmí to vadit.
      const varianta = polozka.varianty.find((v) => v.enchant === enchant);
      for (const vstup of varianta?.vstupy ?? []) {
        s.ulozRucne("Caerleon", vstup.zaklad, vstup.enchant, "sell_min", 100);
      }
      // Obě strany knihy — režim „instant" čte buy_max, „order" sell_min.
      for (const typ of ["buy_max", "sell_min"] as const) {
        s.ulozRucne("Caerleon", polozka.zaklad, enchant, typ, 1_000);
        s.ulozRucne("Black Market", polozka.zaklad, enchant, typ, 5_000);
      }
    }
    return s;
  }

  const spocitej = (nastaveni: Record<string, unknown>) => spocitatSken(
    { ...zaklad, ...nastaveni } as never,
    skladSObemaCenami(), lokace("Caerleon"), HRA.konstanty, (z, e) => `${z}#${e}`,
  ).filter((r) => r.vysledek !== null);

  it("s vypnutým BM se prodává za cenu z Caerleonu", () => {
    const r = spocitej({ mesto: "Caerleon", prodejNaBlackMarketu: false });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.vysledek!.trzbaHruba === 1_000)).toBe(true);
  });

  it("se zapnutým BM se prodává za cenu z Black Marketu", () => {
    const r = spocitej({ mesto: "Caerleon", prodejNaBlackMarketu: true });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.vysledek!.trzbaHruba === 5_000)).toBe(true);
  });

  it("MIMO Caerleon se příznak IGNORUJE — teleport se nekoná", () => {
    // Nejdůležitější negativní test celého kroku. Kdyby guard nefungoval,
    // aplikace by u Thetfordu počítala s cenou z Caerleonu zdarma.
    const r = spocitatSken(
      { ...zaklad, mesto: "Thetford", prodejNaBlackMarketu: true } as never,
      skladSObemaCenami(), lokace("Thetford"), HRA.konstanty, (z, e) => `${z}#${e}`,
    ).filter((x) => x.vysledek !== null);
    // V Thetfordu nejsou ani vstupy, ani výstup → nic se nespočítá.
    expect(r).toHaveLength(0);
  });

  it("vstupy se berou z MĚSTA i při prodeji na BM — na BM se nenakupuje", () => {
    // Sklad má vstupy výhradně v Caerleonu. Kdyby je výpočet hledal na BM,
    // všechny řádky by skončily na „chybí cena".
    const r = spocitej({ mesto: "Caerleon", prodejNaBlackMarketu: true });
    expect(r.every((x) => x.vysledek!.nakladSuroviny > 0)).toBe(true);
  });

  it("sell order ve městě stojí 2,5 %, prodej do výkupu na BM nic", () => {
    const bezBM = spocitej({
      mesto: "Caerleon", prodejNaBlackMarketu: false, rezimProdeje: "order",
    });
    const sBM = spocitej({
      mesto: "Caerleon", prodejNaBlackMarketu: true, rezimProdeje: "order",
    });
    // Setup fee se počítá z tržby, takže srovnáme podíl, ne absolutní číslo.
    expect(bezBM[0]!.vysledek!.setupFeeProdej / bezBM[0]!.vysledek!.trzbaHruba)
      .toBeCloseTo(0.025, 6);
    // Na Black Marketu se order neklade — sazba 1,5 % se nemá k čemu uplatnit.
    expect(sBM[0]!.vysledek!.setupFeeProdej).toBe(0);
  });
});

describe("Black Market je výkup, ne tržnice", () => {
  it("na BM se VŽDY čte buy_max, ať je nastaveno cokoli", () => {
    // Systém vypíše cenu a za tu vykoupí. „Přes sell order" tam neexistuje,
    // takže sell_min je cizí čekající nabídka, ne cena, kterou dostaneš.
    expect(typProdejeProMisto("order", true)).toBe("buy_max");
    expect(typProdejeProMisto("instant", true)).toBe("buy_max");
  });

  it("mimo BM platí volba uživatele dál", () => {
    expect(typProdejeProMisto("order", false)).toBe("sell_min");
    expect(typProdejeProMisto("instant", false)).toBe("buy_max");
  });
});

describe("prodej do výkupu neplatí setup fee", () => {
  const zaklad = {
    focus: false, denniBonus: 0, premium: true, sazbaStanice: 200,
    pocetVyrobku: 1, rezimNakupu: "instant" as const,
    skupina: "zbrane", kategorie: ["sword"],
  };

  function sklad() {
    const s = new SkladCen();
    for (const { polozka, enchant } of kombinaceProSken("zbrane", ["sword"])) {
      const v = polozka.varianty.find((x) => x.enchant === enchant);
      for (const vstup of v?.vstupy ?? []) {
        s.ulozRucne("Caerleon", vstup.zaklad, vstup.enchant, "sell_min", 100);
      }
      // Sell order je NAFOUKLÝ, výkup je realita. Kdyby se bral sell_min,
      // tržba by vyšla pětinásobná.
      s.ulozRucne("Black Market", polozka.zaklad, enchant, "sell_min", 50_000);
      s.ulozRucne("Black Market", polozka.zaklad, enchant, "buy_max", 10_000);
    }
    return s;
  }

  const spocitej = (rezimProdeje: "instant" | "order") => spocitatSken(
    { ...zaklad, mesto: "Caerleon", prodejNaBlackMarketu: true, rezimProdeje } as never,
    sklad(), lokace("Caerleon"), HRA.konstanty, (z, e) => `${z}#${e}`,
  ).filter((r) => r.vysledek !== null);

  it.each(["instant", "order"] as const)(
    "režim „%s“ dá na BM stejnou tržbu — z výkupní ceny", (rezim) => {
      const r = spocitej(rezim);
      expect(r.length).toBeGreaterThan(0);
      expect(r.every((x) => x.vysledek!.trzbaHruba === 10_000)).toBe(true);
      // NE 50 000 z nafouklého sell orderu.
      expect(r.some((x) => x.vysledek!.trzbaHruba === 50_000)).toBe(false);
    });

  it("setup fee je na BM vždy nula — order se neklade", () => {
    for (const rezim of ["instant", "order"] as const) {
      expect(spocitej(rezim).every((x) => x.vysledek!.setupFeeProdej === 0)).toBe(true);
    }
  });

  it("daň z prodeje se ale platí dál", () => {
    expect(spocitej("order").every((x) => x.vysledek!.dan > 0)).toBe(true);
  });
});
