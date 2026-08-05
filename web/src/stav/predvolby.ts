/**
 * Předvolby, které si aplikace pamatuje mezi spuštěními.
 *
 * Vzniklo z chyby: **vybraný server se nikde neukládal.** Aplikace vždycky
 * nastartovala na `west` a načetla jeho nastavení, takže kdo hraje na
 * Europe, našel po každém obnovení stránky cizí město, cizí ceny a hlásku
 * „chybí cena". Vypadalo to, že se nepamatuje vůbec nic.
 *
 * **Co sem patří:** volby zobrazení — server, metrika, stáří dat, otevřená
 * záložka, nastavení převozu.
 *
 * **Co sem nepatří:** nastavení skenu (město, focus, premium…) a ceny.
 * Ty se drží zvlášť pro každý herní server v [uloziste.ts](./uloziste.ts)
 * a synchronizují se mezi zařízeními.
 *
 * Předvolby se **nesynchronizují** — jsou to vlastnosti zařízení. Na mobilu
 * má člověk běžně otevřenou jinou záložku než na počítači a přepínat mu ji
 * na dálku by bylo otravné.
 */

import { SERVERY, type Server } from "../data/aodp";
import { METRIKY, type Metrika } from "./sken";
import { METRIKY_PREVOZU as SEZNAM_METRIK_PREVOZU, type MetrikaPrevozu } from "./prevoz";

export type Rezim = "mesto" | "prilezitosti" | "prevoz" | "dilna";

export interface Predvolby {
  server: Server;
  metrika: Metrika;
  /** Hodiny; 0 znamená „bez omezení". */
  maxStari: number;
  jenZiskove: boolean;
  rezim: Rezim;
  prevoz: { vychoziMesto: string; nosnostKg: number; ztrataZasilek: number };
  metrikaPrevozu: MetrikaPrevozu;
}

export function vychoziPredvolby(vychoziNosnostKg: number): Predvolby {
  return {
    server: "west",
    metrika: "marze",
    maxStari: 48,
    jenZiskove: false,
    rezim: "prilezitosti",
    prevoz: { vychoziMesto: "Thetford", nosnostKg: vychoziNosnostKg, ztrataZasilek: 0.05 },
    metrikaPrevozu: "ziskNaKg",
  };
}

const KLIC = "albion:predvolby:v1";

const REZIMY: Rezim[] = ["mesto", "prilezitosti", "prevoz", "dilna"];
const METRIKY_PREVOZU: MetrikaPrevozu[] = SEZNAM_METRIK_PREVOZU.map((x) => x.id);

/** Vezmi uloženou hodnotu, jen když dává smysl. Jinak výchozí. */
function jedna<T>(hodnota: unknown, povolene: readonly T[], vychozi: T): T {
  return povolene.includes(hodnota as T) ? (hodnota as T) : vychozi;
}

function cislo(hodnota: unknown, vychozi: number): number {
  return typeof hodnota === "number" && Number.isFinite(hodnota) ? hodnota : vychozi;
}

/**
 * Načte předvolby. Poškozený nebo cizí obsah se zahodí — aplikace musí
 * nastartovat vždycky, i s prázdnými předvolbami.
 */
export function nactiPredvolby(vychoziNosnostKg: number): Predvolby {
  const v = vychoziPredvolby(vychoziNosnostKg);
  try {
    const s = localStorage.getItem(KLIC);
    if (!s) return v;
    const d = JSON.parse(s) as Partial<Predvolby>;
    return {
      server: jedna(d.server, SERVERY.map((x) => x.id), v.server),
      metrika: jedna(d.metrika, METRIKY.map((x) => x.id), v.metrika),
      maxStari: cislo(d.maxStari, v.maxStari),
      jenZiskove: typeof d.jenZiskove === "boolean" ? d.jenZiskove : v.jenZiskove,
      rezim: jedna(d.rezim, REZIMY, v.rezim),
      prevoz: {
        vychoziMesto: typeof d.prevoz?.vychoziMesto === "string"
          ? d.prevoz.vychoziMesto : v.prevoz.vychoziMesto,
        nosnostKg: cislo(d.prevoz?.nosnostKg, v.prevoz.nosnostKg),
        ztrataZasilek: cislo(d.prevoz?.ztrataZasilek, v.prevoz.ztrataZasilek),
      },
      metrikaPrevozu: jedna(d.metrikaPrevozu, METRIKY_PREVOZU, v.metrikaPrevozu),
    };
  } catch {
    return v;
  }
}

export function ulozPredvolby(p: Predvolby): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(p));
  } catch {
    // Nevadí — předvolby jsou pohodlí, ne nutnost.
  }
}
