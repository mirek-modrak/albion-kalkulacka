/**
 * Stanice a jejich sazby.
 *
 * Nejdůležitější vlastnost: **sazba nesmí nikdy vyjít nula.** Nula znamená
 * „stanice zdarma", což tiše nadhodnotí zisk — přesně ta vada, kvůli které
 * se ve F10 opravoval `itemValue` u výbavy.
 */

import { describe, expect, it } from "vitest";
import {
  STANICE, VYCHOZI_SAZBA, nazevStanice, ocistiSazby, sazbaProKategorii,
  sazbaProPolozku, staniceProKategorii, staniceProPolozky, vsemStanicim,
} from "../src/stav/stanice";
import { HRA } from "../src/data/hra";
import { SKUPINY, SUROVINY_ID } from "../src/data/kategorie";
import type { HerniPolozka } from "@albion/jadro";

const najdi = (zaklad: string): HerniPolozka =>
  HRA.polozky.find((p) => p.zaklad === zaklad)!;

describe("mapování kategorie → stanice", () => {
  it("pět refining linek má vlastní stavbu", () => {
    expect(staniceProKategorii("ore")).toBe("tavirna");
    expect(staniceProKategorii("hide")).toBe("kozeluzna");
    expect(staniceProKategorii("fiber")).toBe("tkalcovna");
    expect(staniceProKategorii("wood")).toBe("pila");
    expect(staniceProKategorii("rock")).toBe("kamenictvi");
  });

  it("brnění jde se zbraněmi téhož materiálu, ne dohromady", () => {
    // Tohle je to sporné místo v mapování — kdyby se rozjelo, plátové
    // a látkové brnění by sdílely sazbu jedné budovy.
    expect(staniceProKategorii("plate_armor")).toBe("forge");
    expect(staniceProKategorii("leather_armor")).toBe("lodge");
    expect(staniceProKategorii("cloth_armor")).toBe("tower");
  });

  it("hole patří do věže, meče do kovárny", () => {
    expect(staniceProKategorii("holystaff")).toBe("tower");
    expect(staniceProKategorii("firestaff")).toBe("tower");
    expect(staniceProKategorii("sword")).toBe("forge");
    // Quarterstaff je „hůl" jen jménem — je to lovecká zbraň.
    expect(staniceProKategorii("quarterstaff")).toBe("lodge");
  });

  it("pláště rozdrobené podle frakcí spadnou do jedné stanice", () => {
    expect(staniceProKategorii("cape")).toBe("toolmaker");
    expect(staniceProKategorii("accessoires_capes_morgana")).toBe("toolmaker");
    expect(staniceProKategorii("accessoires_capes_avalon")).toBe("toolmaker");
  });

  it("neznámá a prázdná kategorie vrátí null, ne náhodnou stanici", () => {
    expect(staniceProKategorii("neexistuje")).toBeNull();
    expect(staniceProKategorii(null)).toBeNull();
    expect(staniceProKategorii(undefined)).toBeNull();
    expect(staniceProKategorii("")).toBeNull();
  });

  it("žádná kategorie nepatří do dvou stanic naráz", () => {
    const videne = new Set<string>();
    for (const s of STANICE) {
      for (const k of s.kategorie) {
        expect(videne.has(k), `${k} je ve dvou stanicích`).toBe(false);
        videne.add(k);
      }
    }
  });

  it("KAŽDÁ smysluplná skenovaná kategorie má stanici", () => {
    // Pojistka proti tomu, že se mapování rozejde s `kategorie.ts`.
    // Bez ní by kategorie přidaná v budoucnu tiše spadla na výchozí sazbu.
    //
    // Skupina „ostatní“ je vynechaná schválně: `kategorie.ts` ji sama
    // popisuje jako sběrný koš se 118 nesouvisejícími předměty. Do jedné
    // stavby je přiřadit nejde a předstírat to by bylo horší než přiznat,
    // že se u nich počítá s výchozí sazbou (viz test níž).
    const chybi: string[] = [];
    for (const skupina of SKUPINY) {
      if (skupina.id === SUROVINY_ID || skupina.id === "ostatni") continue;
      for (const k of skupina.kategorie) {
        if (staniceProKategorii(k) === null) chybi.push(k);
      }
    }
    expect(chybi).toEqual([]);
  });

  it("sběrný koš ostatní stanici nemá — a počítá se s výchozí sazbou", () => {
    // Přiznaný stav, ne přehlédnutí. Důležité je, že to není NULA:
    // ta by znamenala stanici zdarma a nadhodnotila zisk.
    expect(staniceProKategorii("other")).toBeNull();
    expect(staniceProKategorii("weapons")).toBeNull();
    expect(sazbaProKategorii({ forge: 500 }, "other")).toBe(VYCHOZI_SAZBA);
    expect(sazbaProKategorii({ forge: 500 }, "other")).toBeGreaterThan(0);
  });
});

describe("sazba — nikdy nula", () => {
  const sazby = { tavirna: 385, forge: 500 };

  it("vezme sazbu té správné stanice", () => {
    expect(sazbaProKategorii(sazby, "ore")).toBe(385);
    expect(sazbaProKategorii(sazby, "sword")).toBe(500);
  });

  it("nenastavená stanice spadne na výchozí, ne na nulu", () => {
    expect(sazbaProKategorii(sazby, "holystaff")).toBe(VYCHOZI_SAZBA);
    expect(sazbaProKategorii(sazby, "holystaff")).toBeGreaterThan(0);
  });

  it("NEZNÁMÁ kategorie taky spadne na výchozí, ne na nulu", () => {
    // Kategorie může přibýt herním patchem. Nula by znamenala
    // „stanice zdarma" a tiše nadhodnotila zisk.
    expect(sazbaProKategorii(sazby, "neco_noveho_z_patche")).toBe(VYCHOZI_SAZBA);
    expect(sazbaProKategorii({}, null)).toBe(VYCHOZI_SAZBA);
  });

  it("poškozené hodnoty spadnou na výchozí", () => {
    const rozbite = { tavirna: NaN, forge: -5, tower: "hodně" } as never;
    expect(sazbaProKategorii(rozbite, "ore")).toBe(VYCHOZI_SAZBA);
    expect(sazbaProKategorii(rozbite, "sword")).toBe(VYCHOZI_SAZBA);
    expect(sazbaProKategorii(rozbite, "holystaff")).toBe(VYCHOZI_SAZBA);
  });

  it("nula zadaná ÚMYSLNĚ se respektuje — stanice zdarma existují", () => {
    // Vlastní stanice v hideoutu má sazbu 0 legitimně. Rozdíl proti
    // předchozímu testu je v tom, že tady to uživatel opravdu zadal.
    expect(sazbaProKategorii({ tavirna: 0 }, "ore")).toBe(0);
  });

  it("funguje i nad položkou, nejen nad kategorií", () => {
    expect(sazbaProPolozku({ tavirna: 385 }, najdi("T5_METALBAR"))).toBe(385);
    expect(sazbaProPolozku({ forge: 500 }, najdi("T5_MAIN_SWORD"))).toBe(500);
    expect(sazbaProPolozku({}, null)).toBe(VYCHOZI_SAZBA);
  });
});

describe("které stanice nabídnout", () => {
  it("jen ty, do kterých seznam opravdu posílá", () => {
    const s = staniceProPolozky([najdi("T5_METALBAR"), najdi("T5_MAIN_SWORD")]);
    expect(s.map((x) => x.id).sort()).toEqual(["forge", "tavirna"]);
  });

  it("prázdný seznam nenabídne nic", () => {
    expect(staniceProPolozky([])).toEqual([]);
    expect(staniceProPolozky([null, undefined])).toEqual([]);
  });

  it("pořadí drží podle seznamu stanic, ne podle položek", () => {
    // Ať se panel nepřeskládává podle toho, co uživatel zrovna přidal.
    const s = staniceProPolozky([najdi("T5_MAIN_SWORD"), najdi("T5_METALBAR")]);
    expect(s.map((x) => x.id)).toEqual(["tavirna", "forge"]);
  });
});

describe("migrace z jedné společné sazby", () => {
  it("stará hodnota se rozkopíruje do všech stanic", () => {
    // Bez tohohle by po aktualizaci všechny stanice spadly na výchozí
    // hodnotu a čísla by se uživateli změnila, aniž by cokoli udělal.
    const s = vsemStanicim(385);
    for (const st of STANICE) expect(s[st.id]).toBe(385);
    expect(sazbaProKategorii(s, "ore")).toBe(385);
    expect(sazbaProKategorii(s, "holystaff")).toBe(385);
  });
});

describe("očištění uložených sazeb", () => {
  it("nesmysly se zahodí, platné projdou", () => {
    const s = ocistiSazby({ tavirna: 385, forge: -1, tower: "x", neznama: 5, kamenictvi: NaN });
    expect(s.tavirna).toBe(385);
    expect(s.forge).toBeUndefined();
    expect(s.tower).toBeUndefined();
    expect(s.kamenictvi).toBeUndefined();
    expect("neznama" in s).toBe(false);
  });

  it("nesmyslný vstup dá prázdné sazby, ne pád", () => {
    for (const x of [null, undefined, 42, "text", []]) {
      expect(ocistiSazby(x)).toEqual({});
    }
  });

  it("překlep o řád se ořízne", () => {
    expect(ocistiSazby({ tavirna: 1e12 }).tavirna).toBe(1_000_000);
  });
});

describe("názvy", () => {
  it("každá stanice má název i popis", () => {
    for (const s of STANICE) {
      expect(s.nazev.length).toBeGreaterThan(0);
      expect(s.popis.length).toBeGreaterThan(0);
    }
  });

  it("neznámé id nespadne", () => {
    expect(nazevStanice(null)).toContain("neznámá");
  });

  it("pět refining stanic, čtyři craftingové", () => {
    expect(STANICE.filter((s) => s.refining)).toHaveLength(5);
    expect(STANICE.filter((s) => !s.refining)).toHaveLength(4);
  });
});
