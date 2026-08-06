/**
 * Kam se zapisuje ručně zadaná prodejní cena.
 *
 * Nejrizikovější místo celé funkce: kdyby se zapsalo jinam, než odkud
 * výpočet čte, uživatel přepíše cenu a **zisk se nezmění**. Vypadalo by to,
 * že aplikace vstup ignoruje — a nešlo by to poznat jinak než ručním
 * dopočítáním.
 */

import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("localStorage", {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
});

const { kamSeProdava } = await import("../src/stav/dilna");
const { BLACK_MARKET } = await import("../src/data/hra");

type Vysledek = import("../src/stav/dilna").VysledekDilny;

function vysledek(mesto: string, mistoProdeje: "mesto" | "bm" | "bm-s-prevozem"): Vysledek {
  return { klic: "T5_X#0", mesto, mistoProdeje, auto: false, radek: null } as Vysledek;
}

describe("prodej na místní trh", () => {
  it("cena se čte z města výroby", () => {
    expect(kamSeProdava(vysledek("Martlock", "mesto"), "order").mesto).toBe("Martlock");
  });

  it("typ ceny odpovídá zvolenému režimu prodeje", () => {
    expect(kamSeProdava(vysledek("Martlock", "mesto"), "order").typ).toBe("sell_min");
    expect(kamSeProdava(vysledek("Martlock", "mesto"), "instant").typ).toBe("buy_max");
  });
});

describe("prodej na Black Market", () => {
  it("cena se čte z Black Marketu, NE z města výroby", () => {
    // Tohle je ta past: město řádku je Martlock, ale cena leží pod „Black Market".
    const kam = kamSeProdava(vysledek("Martlock", "bm-s-prevozem"), "order");
    expect(kam.mesto).toBe(BLACK_MARKET);
    expect(kam.mesto).not.toBe("Martlock");
  });

  it("na Black Marketu se prodává do výkupu — vždy buy_max, bez ohledu na režim", () => {
    // Na BM se neklade sell order. Kdyby se sem zapsala cena sell orderu,
    // výpočet by ji nikdy nepřečetl.
    for (const rezim of ["order", "instant"] as const) {
      expect(kamSeProdava(vysledek("Caerleon", "bm"), rezim).typ).toBe("buy_max");
      expect(kamSeProdava(vysledek("Thetford", "bm-s-prevozem"), rezim).typ).toBe("buy_max");
    }
  });
});

describe("volba nejlevnějšího města", () => {
  it("zapisuje se do města, které je u řádku vidět", () => {
    // U „nejlevnější" je `mesto` už to konkrétní vybrané, ne značka auto.
    const kam = kamSeProdava(vysledek("Fort Sterling", "mesto"), "order");
    expect(kam.mesto).toBe("Fort Sterling");
  });
});
