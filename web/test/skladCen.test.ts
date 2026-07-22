/**
 * Sklad cen.
 *
 * Nejdůležitější vlastnost: ručně zadaná cena je vědomý zásah a nový sken
 * ji NESMÍ přepsat. Kdyby ano, uživatel by opravoval totéž po každém skenu,
 * až by na opravy rezignoval — a to je horší než kdyby oprava nešla vůbec.
 */

import { describe, expect, it } from "vitest";
import { SkladCen } from "../src/stav/skladCen";
import type { RadekCeny } from "../src/data/aodp";

const rozloz = (id: string) => ({ zaklad: id, enchant: 0 });

const radek = (zmeny: Partial<RadekCeny> = {}): RadekCeny => ({
  item_id: "T5_ORE",
  city: "Thetford",
  quality: 1,
  sell_price_min: 500,
  sell_price_min_date: "2026-07-22T10:00:00",
  sell_price_max: 600,
  buy_price_min: 300,
  buy_price_max: 400,
  buy_price_max_date: "2026-07-22T10:00:00",
  ...zmeny,
});

describe("ukládání a čtení", () => {
  it("rozlišuje typ ceny — táž položka má dvě různé ceny", () => {
    const s = new SkladCen();
    s.naplnZAodp([radek()], rozloz);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")?.hodnota).toBe(500);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "buy_max")?.hodnota).toBe(400);
  });

  it("rozlišuje město", () => {
    const s = new SkladCen();
    s.naplnZAodp([radek(), radek({ city: "Martlock", sell_price_min: 999 })], rozloz);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")?.hodnota).toBe(500);
    expect(s.ziskej("Martlock", "T5_ORE", 0, "sell_min")?.hodnota).toBe(999);
  });

  it("rozlišuje enchant", () => {
    const s = new SkladCen();
    s.naplnZAodp([radek()], (id) => ({ zaklad: id, enchant: 2 }));
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")).toBeUndefined();
    expect(s.ziskej("Thetford", "T5_ORE", 2, "sell_min")?.hodnota).toBe(500);
  });
});

describe("sentinelové hodnoty se NEUKLÁDAJÍ", () => {
  it("datum 0001-01-01 znamená nikdy nenaskenováno", () => {
    const s = new SkladCen();
    s.naplnZAodp([radek({ sell_price_min_date: "0001-01-01T00:00:00" })], rozloz);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")).toBeUndefined();
  });

  it("nulová cena se nebere jako cena", () => {
    const s = new SkladCen();
    s.naplnZAodp([radek({ sell_price_min: 0 })], rozloz);
    // Nula by dala hezky vypadající nesmysl — lepší je „nevím“.
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")).toBeUndefined();
    // Druhá strana order booku je platná a uložit se má.
    expect(s.ziskej("Thetford", "T5_ORE", 0, "buy_max")?.hodnota).toBe(400);
  });
});

describe("přednost ručních cen", () => {
  it("sken NEPŘEPÍŠE ručně zadanou hodnotu", () => {
    const s = new SkladCen();
    s.ulozRucne("Thetford", "T5_ORE", 0, "sell_min", 111);

    const { ulozeno, zachovanoRucnich } = s.naplnZAodp([radek()], rozloz);

    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")?.hodnota).toBe(111);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")?.zdroj).toBe("rucne");
    expect(zachovanoRucnich).toBe(1);
    // Druhá strana ruční není, ta se uložit má.
    expect(ulozeno).toBe(1);
  });

  it("ruční cena u JEDNOHO typu nechrání ten druhý", () => {
    const s = new SkladCen();
    s.ulozRucne("Thetford", "T5_ORE", 0, "sell_min", 111);
    s.naplnZAodp([radek()], rozloz);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "buy_max")?.hodnota).toBe(400);
  });

  it("po zrušení ruční hodnoty se sken zase uplatní", () => {
    const s = new SkladCen();
    s.ulozRucne("Thetford", "T5_ORE", 0, "sell_min", 111);
    s.zrusRucne("Thetford", "T5_ORE", 0, "sell_min");
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")).toBeUndefined();

    s.naplnZAodp([radek()], rozloz);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")?.hodnota).toBe(500);
  });

  it("zrušení nesmí smazat cenu z AODP", () => {
    const s = new SkladCen();
    s.naplnZAodp([radek()], rozloz);
    s.zrusRucne("Thetford", "T5_ORE", 0, "sell_min");
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")?.hodnota).toBe(500);
  });

  it("jeRucne rozliší původ", () => {
    const s = new SkladCen();
    s.naplnZAodp([radek()], rozloz);
    expect(s.jeRucne("Thetford", "T5_ORE", 0, "sell_min")).toBe(false);
    s.ulozRucne("Thetford", "T5_ORE", 0, "sell_min", 111);
    expect(s.jeRucne("Thetford", "T5_ORE", 0, "sell_min")).toBe(true);
  });
});

describe("omezení vstupu", () => {
  it("záporná cena se srazí na nulu", () => {
    const s = new SkladCen();
    s.ulozRucne("Thetford", "T5_ORE", 0, "sell_min", -500);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")?.hodnota).toBe(0);
  });

  it("absurdně vysoká cena se omezí", () => {
    const s = new SkladCen();
    s.ulozRucne("Thetford", "T5_ORE", 0, "sell_min", 1e15);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")!.hodnota).toBeLessThanOrEqual(1e9);
  });

  it("NaN se neuloží vůbec", () => {
    const s = new SkladCen();
    s.ulozRucne("Thetford", "T5_ORE", 0, "sell_min", Number.NaN);
    expect(s.ziskej("Thetford", "T5_ORE", 0, "sell_min")).toBeUndefined();
  });
});

describe("stáří cen", () => {
  it("vrací stáří té NEJSTARŠÍ — výsledek je tak starý jako nejhorší vstup", () => {
    const s = new SkladCen();
    const stara = { hodnota: 1, zdroj: "aodp" as const, mesto: "T", typ: "sell_min" as const,
      cas: new Date(Date.now() - 10 * 3_600_000).toISOString().slice(0, 19) };
    const nova = { ...stara, cas: new Date(Date.now() - 1 * 3_600_000).toISOString().slice(0, 19) };
    const v = s.nejstarsiStari([nova, stara]);
    expect(v).toBeGreaterThan(9);
    expect(v).toBeLessThan(11);
  });

  it("ruční ceny se do stáří nepočítají", () => {
    const s = new SkladCen();
    expect(s.nejstarsiStari([
      { hodnota: 1, zdroj: "rucne", cas: "2020-01-01T00:00:00", mesto: "T", typ: "sell_min" },
    ])).toBeNull();
  });
});
