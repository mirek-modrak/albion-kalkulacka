/**
 * Sklad skutečných obchodů a vyhodnocení likvidity.
 *
 * Nejdůležitější vlastnost: **„nemáme data" se nesmí slít s „neobchoduje se".**
 * Naměřeno 2026-07-23: T5 Main Sword má v okně 7 dní ve všech královských
 * městech nulu, ale v okně 30 dní má Lymhurst 23 dní dat. Kdyby to obojí
 * dopadlo do jednoho stavu, aplikace by u desítek řádků tvrdila „tady se
 * neobchoduje" — a takové varování uživatel přestane číst.
 *
 * Každý guard se tu testuje scénářem, který ho MÁ spustit. Ověřit, že
 * u zdravého řádku mlčí, neříká o guardu nic.
 */

import { describe, expect, it } from "vitest";
import {
  SkladHistorie, stariDnu, vyhodnotLikviditu, type SouhrnObchodu,
} from "../src/stav/skladHistorie";
import type { SerieHistorie } from "../src/data/aodp";

const rozloz = (id: string) => ({ zaklad: id, enchant: 0 });

/** Série pro dané dny července 2026. */
function serie(
  mesto: string,
  body: { den: number; cena: number; objem: number }[],
  itemId = "T5_METALBAR",
): SerieHistorie {
  return {
    location: mesto, item_id: itemId, quality: 1,
    data: body.map((b) => ({
      avg_price: b.cena,
      item_count: b.objem,
      timestamp: `2026-07-${String(b.den).padStart(2, "0")}T00:00:00`,
    })),
  };
}

/** Dny 16.–22. 7. = přesně týdenní okno, když konec vyjde na 22. */
const TYDEN = (cena: number, objem: number) =>
  Array.from({ length: 7 }, (_, i) => ({ den: 16 + i, cena, objem }));

describe("konec okna", () => {
  it("je nejnovější den napříč CELOU odpovědí, ne per sérii", () => {
    // Kdyby si každé město určovalo konec samo, města by nešlo porovnat —
    // dobře skenované by mělo týden posunutý oproti špatně skenovanému.
    const s = new SkladHistorie();
    s.naplnZAodp([
      serie("Caerleon", [{ den: 10, cena: 100, objem: 5 }]),
      serie("Black Market", [{ den: 22, cena: 200, objem: 500 }]),
    ], rozloz);

    expect(s.konec).toBe("2026-07-22");
  });

  it("odpověď bez jediného použitelného bodu nevyčistí dřívější souhrny", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([serie("Caerleon", TYDEN(100, 50))], rozloz);
    expect(s.pocet).toBe(1);

    const { ulozeno } = s.naplnZAodp([serie("Caerleon", [])], rozloz);

    expect(ulozeno).toBe(0);
    // Starší souhrn je pořád lepší než nic — jeho stáří je vidět z `konec`.
    expect(s.pocet).toBe(1);
    expect(s.konec).toBe("2026-07-22");
  });
});

describe("chybějící data NEJSOU nula", () => {
  it("týden bez dat dá objemTyden null, ne 0", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([
      // Lymhurst má data, ale jen do 10. 7.
      serie("Lymhurst", [{ den: 8, cena: 100, objem: 40 }, { den: 10, cena: 110, objem: 60 }]),
      // Black Market posune konec okna na 22. 7.
      serie("Black Market", TYDEN(200, 500)),
    ], rozloz);

    const l = s.ziskej("Lymhurst", "T5_METALBAR", 0)!;
    expect(l.objemTyden).toBeNull();
    expect(l.objemTyden).not.toBe(0);
    expect(l.medianTyden).toBeNull();
    // Ale v okně data JSOU a musí být vidět.
    expect(l.objemOkno).toBe(100);
    expect(l.dniOkna).toBe(2);
    expect(l.dniTydne).toBe(0);
  });

  it("den s nulovým objemem se od chybějícího dne liší", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([serie("Caerleon", [
      { den: 22, cena: 100, objem: 0 },
    ])], rozloz);

    const c = s.ziskej("Caerleon", "T5_METALBAR", 0)!;
    // Data ten den byla — objem je tedy 0, ne null.
    expect(c.objemTyden).toBe(0);
    expect(c.dniTydne).toBe(1);
  });
});

describe("poškozený vstup z AODP", () => {
  const spatne = (zmena: Record<string, unknown>): SerieHistorie => ({
    location: "Caerleon", item_id: "T5_METALBAR", quality: 1,
    data: [
      { avg_price: 100, item_count: 10, timestamp: "2026-07-22T00:00:00" },
      { avg_price: 100, item_count: 10, timestamp: "2026-07-21T00:00:00", ...zmena } as never,
    ],
  });

  it.each([
    ["záporná cena", { avg_price: -5 }],
    ["nulová cena", { avg_price: 0 }],
    ["NaN cena", { avg_price: Number.NaN }],
    ["nekonečno", { avg_price: Number.POSITIVE_INFINITY }],
    ["záporný počet", { item_count: -3 }],
    ["NaN počet", { item_count: Number.NaN }],
    ["rozbité datum", { timestamp: "nesmysl" }],
  ])("%s se zahodí a nezkazí souhrn", (_popis, zmena) => {
    const s = new SkladHistorie();
    s.naplnZAodp([spatne(zmena)], rozloz);

    const c = s.ziskej("Caerleon", "T5_METALBAR", 0)!;
    expect(c.dniOkna).toBe(1);
    expect(c.objemOkno).toBe(10);
    expect(c.medianTyden).toBe(100);
    expect(Number.isFinite(c.medianTyden!)).toBe(true);
  });

  it("série se samými pokaženými body se neuloží vůbec", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([
      { location: "Caerleon", item_id: "T5_METALBAR", quality: 1,
        data: [{ avg_price: 0, item_count: 5, timestamp: "2026-07-22T00:00:00" }] },
      serie("Black Market", TYDEN(200, 500)),
    ], rozloz);

    expect(s.ziskej("Caerleon", "T5_METALBAR", 0)).toBeUndefined();
  });
});

describe("medián", () => {
  it("lichý počet — prostřední hodnota", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([serie("Caerleon", [
      { den: 20, cena: 100, objem: 1 },
      { den: 21, cena: 900, objem: 1 },
      { den: 22, cena: 300, objem: 1 },
    ])], rozloz);
    // Průměr by byl 433 — výstřelek 900 by ho vytáhl. Medián drží 300.
    expect(s.ziskej("Caerleon", "T5_METALBAR", 0)!.medianTyden).toBe(300);
  });

  it("sudý počet — průměr dvou prostředních", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([serie("Caerleon", [
      { den: 21, cena: 100, objem: 1 },
      { den: 22, cena: 200, objem: 1 },
    ])], rozloz);
    expect(s.ziskej("Caerleon", "T5_METALBAR", 0)!.medianTyden).toBe(150);
  });

  it("počítá se jen z TÝDNE, ne z celého okna", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([serie("Caerleon", [
      { den: 1, cena: 9999, objem: 1 },    // mimo týden
      { den: 21, cena: 100, objem: 1 },
      { den: 22, cena: 200, objem: 1 },
    ])], rozloz);
    const c = s.ziskej("Caerleon", "T5_METALBAR", 0)!;
    expect(c.medianTyden).toBe(150);
    // Ale rozsah okna zahrnuje i ten starý den — guard na fantom ho potřebuje.
    expect(c.maxOkno).toBe(9999);
    expect(c.dniOkna).toBe(3);
  });
});

describe("stav likvidity — každý scénář MÁ spustit svůj guard", () => {
  const souhrn = (z: Partial<SouhrnObchodu> = {}): SouhrnObchodu => ({
    medianTyden: 100, objemTyden: 1000, objemOkno: 4000,
    minOkno: 90, maxOkno: 110, dniTydne: 7, dniOkna: 30,
    posledniDen: "2026-07-22", ...z,
  });

  it("žádná historie vůbec → bez-dat (NE ok)", () => {
    // Přesně případ T6 Main Sword v Caerleonu: nabídka 89 999, nula obchodů.
    const v = vyhodnotLikviditu(undefined, 100, 89_999);
    expect(v.stav).toBe("bez-dat");
  });

  it("data v okně, ale ne za týden → zastarala (NE bez-dat)", () => {
    // Případ Lymhurstu. Trh existuje, jen ho týden nikdo neskenoval.
    const v = vyhodnotLikviditu(
      souhrn({ dniTydne: 0, objemTyden: null, medianTyden: null, dniOkna: 23 }), 100, 5000,
    );
    expect(v.stav).toBe("zastarala");
    expect(v.stav).not.toBe("bez-dat");
  });

  it("objem menší než dávka → tenky", () => {
    // Chceš 100 kusů, trh jich za týden vzal 13.
    const v = vyhodnotLikviditu(souhrn({ objemTyden: 13 }), 100, 100);
    expect(v.stav).toBe("tenky");
  });

  it("objem přesně roven dávce → ok (hranice není varování)", () => {
    expect(vyhodnotLikviditu(souhrn({ objemTyden: 100 }), 100, 100).stav).toBe("ok");
  });

  it("objem o kus menší než dávka → tenky (hranice se testuje z obou stran)", () => {
    expect(vyhodnotLikviditu(souhrn({ objemTyden: 99 }), 100, 100).stav).toBe("tenky");
  });

  it("nulová dávka nespustí tenky — není s čím porovnávat", () => {
    expect(vyhodnotLikviditu(souhrn({ objemTyden: 1 }), 0, 100).stav).toBe("ok");
  });

  it("týden s daty a nulovým objemem je tenky, ne zastarala", () => {
    const v = vyhodnotLikviditu(souhrn({ objemTyden: 0, dniTydne: 3 }), 100, 100);
    expect(v.stav).toBe("tenky");
  });
});

describe("fantomový listing", () => {
  const s = (max: number | null): SouhrnObchodu => ({
    medianTyden: 100, objemTyden: 1000, objemOkno: 4000,
    minOkno: 90, maxOkno: max, dniTydne: 7, dniOkna: 30, posledniDen: "2026-07-22",
  });

  it("nabídka nad dvojnásobkem maxima → označit", () => {
    expect(vyhodnotLikviditu(s(110), 100, 221).fantomovyListing).toBe(true);
  });

  it("přesně dvojnásobek → NEoznačit (práh je ostrý)", () => {
    expect(vyhodnotLikviditu(s(110), 100, 220).fantomovyListing).toBe(false);
  });

  it("běžná nabídka nad průměrem → NEoznačit", () => {
    // Sell order leží nad denním průměrem vždy — o rozpětí. To není fantom.
    expect(vyhodnotLikviditu(s(110), 100, 130).fantomovyListing).toBe(false);
  });

  it("bez historie se fantom netvrdí — nemáme podle čeho", () => {
    expect(vyhodnotLikviditu(undefined, 100, 1_000_000).fantomovyListing).toBe(false);
    expect(vyhodnotLikviditu(s(null), 100, 1_000_000).fantomovyListing).toBe(false);
  });

  it("bez aktuální ceny se fantom netvrdí", () => {
    expect(vyhodnotLikviditu(s(110), 100, null).fantomovyListing).toBe(false);
  });
});

describe("odchylka od mediánu", () => {
  const s = (median: number | null): SouhrnObchodu => ({
    medianTyden: median, objemTyden: 1000, objemOkno: 4000,
    minOkno: 90, maxOkno: 110, dniTydne: 7, dniOkna: 30, posledniDen: "2026-07-22",
  });

  it("kladná nad mediánem, záporná pod", () => {
    expect(vyhodnotLikviditu(s(100), 100, 150).odchylkaOdMedianu).toBeCloseTo(0.5, 6);
    // Případ T5 Cape: buy_max 4 108 proti mediánu 8 753 — podhodnocení o polovinu.
    expect(vyhodnotLikviditu(s(100), 100, 50).odchylkaOdMedianu).toBeCloseTo(-0.5, 6);
  });

  it("null bez základu", () => {
    expect(vyhodnotLikviditu(s(null), 100, 150).odchylkaOdMedianu).toBeNull();
    expect(vyhodnotLikviditu(s(0), 100, 150).odchylkaOdMedianu).toBeNull();
    expect(vyhodnotLikviditu(s(100), 100, null).odchylkaOdMedianu).toBeNull();
  });
});

describe("rozlišení klíče", () => {
  it("město, základ i enchant jsou součástí klíče", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([
      serie("Caerleon", TYDEN(100, 10), "T5_PLANKS"),
      serie("Lymhurst", TYDEN(200, 20), "T5_PLANKS"),
    ], rozloz);

    expect(s.ziskej("Caerleon", "T5_PLANKS", 0)!.medianTyden).toBe(100);
    expect(s.ziskej("Lymhurst", "T5_PLANKS", 0)!.medianTyden).toBe(200);
    expect(s.ziskej("Caerleon", "T5_PLANKS", 1)).toBeUndefined();
    expect(s.ziskej("Martlock", "T5_PLANKS", 0)).toBeUndefined();
  });

  it("enchant se bere z rozlozId, ne z ID naslepo", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([serie("Caerleon", TYDEN(100, 10), "T5_PLANKS_LEVEL2@2")],
      () => ({ zaklad: "T5_PLANKS", enchant: 2 }));

    expect(s.ziskej("Caerleon", "T5_PLANKS", 2)!.medianTyden).toBe(100);
    expect(s.ziskej("Caerleon", "T5_PLANKS", 0)).toBeUndefined();
  });
});

describe("export a obnova", () => {
  it("kolečko tam a zpět zachová souhrn i konec okna", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([
      serie("Caerleon", TYDEN(100, 10), "T5_PLANKS"),
      serie("Lymhurst", [{ den: 5, cena: 50, objem: 3 }], "T5_PLANKS"),
    ], rozloz);

    const novy = new SkladHistorie();
    novy.obnov(s.export(), s.konec);

    expect(novy.pocet).toBe(2);
    expect(novy.konec).toBe("2026-07-22");
    expect(novy.ziskej("Caerleon", "T5_PLANKS", 0)).toEqual(
      s.ziskej("Caerleon", "T5_PLANKS", 0),
    );
    // Null hodnoty musí přežít JSON — jsou to nositelé „nevíme".
    expect(novy.ziskej("Lymhurst", "T5_PLANKS", 0)!.objemTyden).toBeNull();
  });

  it("přežije i skutečný JSON kolečko (null se nesmí ztratit)", () => {
    const s = new SkladHistorie();
    s.naplnZAodp([
      serie("Lymhurst", [{ den: 5, cena: 50, objem: 3 }], "T5_PLANKS"),
      serie("Black Market", TYDEN(200, 500), "T5_PLANKS"),
    ], rozloz);

    const novy = new SkladHistorie();
    novy.obnov(JSON.parse(JSON.stringify(s.export())), s.konec);

    expect(novy.ziskej("Lymhurst", "T5_PLANKS", 0)!.objemTyden).toBeNull();
    expect(novy.ziskej("Lymhurst", "T5_PLANKS", 0)!.objemOkno).toBe(3);
  });
});

describe("stáří posledního záznamu", () => {
  const ted = new Date("2026-07-23T12:00:00Z");

  it("počítá se ve dnech", () => {
    expect(stariDnu("2026-07-22", ted)).toBe(1);
    expect(stariDnu("2026-07-16", ted)).toBe(7);
  });

  it("null bez data", () => {
    expect(stariDnu(null, ted)).toBeNull();
    expect(stariDnu("nesmysl", ted)).toBeNull();
  });

  it("budoucí datum nedá záporné stáří", () => {
    expect(stariDnu("2026-08-01", ted)).toBe(0);
  });
});
