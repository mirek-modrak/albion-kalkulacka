/**
 * Historie cen a objemů.
 *
 * Nejdůležitější vlastnost: **díry v datech se nesmí zaplňovat.**
 * AODP vrací jen dny, kdy se obchodovalo — naměřeno, že Caerleon měl
 * 29 bodů ze 30. Kdyby se chybějící den nahradil nulou nebo průměrem,
 * graf i souhrny by lhaly.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SerieHistorie } from "../src/data/aodp";

const nactiHistorii = vi.fn();
vi.mock("../src/data/aodp", async (puvodni) => ({
  ...(await puvodni<typeof import("../src/data/aodp")>()),
  nactiHistorii: (...a: unknown[]) => nactiHistorii(...a),
}));

const { ziskejHistorii, odchylkaOdPrumeru, trend } = await import("../src/stav/historie");

/** Vytvoří sérii s daty pro zadané dny (offsety od 2026-07-01). */
function serie(mesto: string, body: { den: number; cena: number; objem: number }[]): SerieHistorie {
  return {
    location: mesto, item_id: "T5_METALBAR", quality: 1,
    data: body.map((b) => ({
      avg_price: b.cena,
      item_count: b.objem,
      timestamp: `2026-07-${String(b.den).padStart(2, "0")}T00:00:00`,
    })),
  };
}

beforeEach(() => {
  nactiHistorii.mockReset();
  // Keš je modulová — každý test musí použít jiné ID, aby se netrefil do ní.
});

let poradi = 0;
const jineId = () => `T5_TEST_${++poradi}`;

describe("díry v datech", () => {
  it("chybějící den je null, NE nula", () => {
    // Nula by znamenala „obchodovalo se za nula silver", což je nesmysl.
    // Null znamená „ten den nevíme" — a to je pravda.
    nactiHistorii.mockResolvedValue([serie("Thetford", [
      { den: 1, cena: 100, objem: 10 },
      // 2. července chybí
      { den: 3, cena: 300, objem: 30 },
    ])]);

    return ziskejHistorii("west", jineId(), ["Thetford"]).then(([h]) => {
      const dny = h!.dny;
      const den2 = dny.find((d) => d.datum === "2026-07-02");
      expect(den2?.cena).toBeNull();
      expect(den2?.objem).toBeNull();
      expect(den2?.cena).not.toBe(0);
    });
  });

  it("průměr se počítá JEN ze dnů, kdy se obchodovalo", async () => {
    // Kdyby se chybějící dny braly jako nula, průměr by spadl na zlomek.
    nactiHistorii.mockResolvedValue([serie("Thetford", [
      { den: 1, cena: 100, objem: 10 },
      { den: 30, cena: 200, objem: 20 },
    ])]);

    const [h] = await ziskejHistorii("west", jineId(), ["Thetford"]);
    expect(h!.prumernaCena).toBe(150);
    expect(h!.prumernyObjem).toBe(15);
    expect(h!.dniSData).toBe(2);
  });

  it("hlásí, kolik dní ze 30 má data", async () => {
    nactiHistorii.mockResolvedValue([serie("Thetford",
      Array.from({ length: 5 }, (_, i) => ({ den: i + 1, cena: 100, objem: 10 })),
    )]);

    const [h] = await ziskejHistorii("west", jineId(), ["Thetford"]);
    expect(h!.dniSData).toBe(5);
    // Osa má pořád 30 dní — díry musí být vidět.
    expect(h!.dny.length).toBe(30);
  });

  it("město bez dat vrátí prázdné dny, ne chybu", async () => {
    nactiHistorii.mockResolvedValue([serie("Thetford", [{ den: 1, cena: 100, objem: 10 }])]);

    const vysledek = await ziskejHistorii("west", jineId(), ["Thetford", "Caerleon"]);
    const caerleon = vysledek.find((h) => h.mesto === "Caerleon")!;
    expect(caerleon.dniSData).toBe(0);
    expect(caerleon.prumernaCena).toBeNull();
  });

  it("úplně prázdná odpověď nespadne", async () => {
    nactiHistorii.mockResolvedValue([]);
    const vysledek = await ziskejHistorii("west", jineId(), ["Thetford"]);
    expect(vysledek).toHaveLength(1);
    expect(vysledek[0]!.dny).toEqual([]);
  });
});

describe("keš", () => {
  it("druhé volání nejde na síť", async () => {
    nactiHistorii.mockResolvedValue([serie("Thetford", [{ den: 1, cena: 100, objem: 10 }])]);
    const id = jineId();

    await ziskejHistorii("west", id, ["Thetford"]);
    await ziskejHistorii("west", id, ["Thetford"]);

    expect(nactiHistorii).toHaveBeenCalledTimes(1);
  });
});

describe("odchylka od průměru", () => {
  it("kladná nad průměrem, záporná pod", () => {
    expect(odchylkaOdPrumeru(150, 100)).toBeCloseTo(0.5, 6);
    expect(odchylkaOdPrumeru(50, 100)).toBeCloseTo(-0.5, 6);
  });

  it("desetinásobek je varovný signál, ne příležitost", () => {
    // Tohle je typický artefakt tenkého orderbooku.
    expect(odchylkaOdPrumeru(1000, 100)).toBeCloseTo(9, 6);
  });

  it("null bez základu", () => {
    expect(odchylkaOdPrumeru(100, null)).toBeNull();
    expect(odchylkaOdPrumeru(100, 0)).toBeNull();
  });
});

describe("trend", () => {
  const dny = (ceny: (number | null)[]) =>
    ceny.map((c, i) => ({ datum: `2026-07-${String(i + 1).padStart(2, "0")}`, cena: c, objem: 1 }));

  it("kladný při růstu", () => {
    expect(trend(dny([100, 110, 120]), 30)).toBeCloseTo(0.2, 6);
  });

  it("záporný při poklesu", () => {
    expect(trend(dny([200, 150, 100]), 30)).toBeCloseTo(-0.5, 6);
  });

  it("díry přeskočí, nepočítá je jako pokles na nulu", () => {
    expect(trend(dny([100, null, null, 120]), 30)).toBeCloseTo(0.2, 6);
  });

  it("null, když není z čeho počítat", () => {
    expect(trend(dny([100]), 7)).toBeNull();
    expect(trend(dny([null, null]), 7)).toBeNull();
  });
});
