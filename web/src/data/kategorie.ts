/**
 * Skupiny nad herními kategoriemi.
 *
 * V herních datech je 53 různých kategorií výbavy. Nabídnout je uživateli
 * v jednom seznamu je nepoužitelné — nikdo nechce rolovat 53 položkami,
 * aby našel „plate brnění".
 *
 * Skupiny slouží k výběru rozsahu skenu. Kategorie samotné se nadále
 * používají pro bonusy měst (`craftingmodifiers.xml`) — tam se skupiny
 * neuplatňují.
 */

import { HRA } from "./hra";

export interface Skupina {
  id: string;
  nazev: string;
  /** Prázdné = odvodí se ze zbytku (viz `ostatniKategorie`). */
  kategorie: string[];
}

const ZBRANE = [
  "sword", "dagger", "axe", "mace", "hammer", "quarterstaff", "spear",
  "bow", "crossbow", "knuckles",
  "firestaff", "froststaff", "arcanestaff", "holystaff", "naturestaff", "cursestaff",
];

const BRNENI = [
  "plate_helmet", "plate_armor", "plate_shoes",
  "leather_helmet", "leather_armor", "leather_shoes",
  "cloth_helmet", "cloth_armor", "cloth_shoes",
];

/** Pláště jsou v datech rozdrobené podle frakcí — sloučit do jedné skupiny. */
const PLASTE = Object.keys(
  HRA.polozky.reduce<Record<string, true>>((mapa, p) => {
    if (p.kategorie?.startsWith("accessoires_capes")) mapa[p.kategorie] = true;
    return mapa;
  }, {}),
).concat("cape");

export const SUROVINY_ID = "suroviny";

export const SKUPINY: Skupina[] = [
  { id: SUROVINY_ID, nazev: "Suroviny (refining)", kategorie: [] },
  { id: "zbrane", nazev: "Zbraně", kategorie: ZBRANE },
  { id: "brneni", nazev: "Brnění", kategorie: BRNENI },
  { id: "offhand", nazev: "Offhand a štíty", kategorie: ["offhand", "offhands", "shieldtype"] },
  { id: "plaste", nazev: "Pláště", kategorie: PLASTE },
  { id: "tasky", nazev: "Tašky", kategorie: ["bag"] },
  { id: "nastroje", nazev: "Nástroje", kategorie: ["tools"] },
  { id: "sberne", nazev: "Sběrné vybavení", kategorie: ["gatherergear"] },
  // `other` je sběrný koš se 118 nesouvisejícími předměty — patří sem, ne mezi
  // smysluplné kategorie.
  { id: "ostatni", nazev: "Ostatní", kategorie: ["other", "weapons"] },
];

/** Skupina → seznam kategorií. Prázdné pole u surovin je zvláštní případ. */
export function kategorieSkupiny(id: string): string[] {
  return SKUPINY.find((s) => s.id === id)?.kategorie ?? [];
}

/**
 * Konkrétní kategorie ve skupině, které v datech opravdu existují,
 * s počtem položek — pro podrobnější výběr.
 */
export function kategorieSPocty(idSkupiny: string): { kategorie: string; pocet: number }[] {
  const patri = new Set(kategorieSkupiny(idSkupiny));
  const pocty = new Map<string, number>();

  for (const p of HRA.polozky) {
    if (p.druh !== "vybava" || !p.kategorie || !patri.has(p.kategorie)) continue;
    pocty.set(p.kategorie, (pocty.get(p.kategorie) ?? 0) + 1);
  }

  return [...pocty.entries()]
    .map(([kategorie, pocet]) => ({ kategorie, pocet }))
    .sort((a, b) => b.pocet - a.pocet);
}

/** Lidský název kategorie. Herní ID typu `plate_armor` je srozumitelné jen zčásti. */
const NAZVY: Record<string, string> = {
  sword: "meče", dagger: "dýky", axe: "sekery", mace: "palcáty", hammer: "kladiva",
  quarterstaff: "hole", spear: "kopí", bow: "luky", crossbow: "kuše", knuckles: "boxery",
  firestaff: "ohnivé hole", froststaff: "mrazivé hole", arcanestaff: "arkánové hole",
  holystaff: "svaté hole", naturestaff: "přírodní hole", cursestaff: "prokleté hole",
  plate_helmet: "plátové helmy", plate_armor: "plátová brnění", plate_shoes: "plátové boty",
  leather_helmet: "kožené helmy", leather_armor: "kožená brnění", leather_shoes: "kožené boty",
  cloth_helmet: "látkové helmy", cloth_armor: "látková brnění", cloth_shoes: "látkové boty",
  offhand: "offhand", offhands: "offhand", shieldtype: "štíty",
  bag: "tašky", cape: "pláště", tools: "nástroje", gatherergear: "sběrné vybavení",
  other: "ostatní", weapons: "zbraně (různé)",
};

export function nazevKategorie(kategorie: string): string {
  if (NAZVY[kategorie]) return NAZVY[kategorie]!;
  if (kategorie.startsWith("accessoires_capes_")) {
    return `pláště — ${kategorie.replace("accessoires_capes_", "")}`;
  }
  return kategorie;
}
