/**
 * Sklad cen.
 *
 * Klíčem je `(město, položka, typ)` — NE aktuální výběr v UI.
 *
 * Důvod: při skenu se ceny zadávají nebo stahují pro desítky položek naráz
 * a uživatel mezi nimi přepíná. Kdyby byly ceny navázané na aktuální výběr,
 * přepnutím by zmizely.
 *
 * Ještě důležitější: TÁŽ položka vystupuje jako vstup i jako výstup.
 * T4 ingot se kupuje (vstup do T5) i prodává (výstup z T4) — to jsou dvě
 * různé ceny ze dvou různých stran order booku.
 */

import type { Cena, TypCeny } from "@albion/jadro";
import { jeSentinel, stariHodin, type RadekCeny } from "../data/aodp";

function klic(mesto: string, zaklad: string, enchant: number, typ: TypCeny): string {
  return `${mesto}|${zaklad}#${enchant}|${typ}`;
}

export class SkladCen {
  private readonly mapa = new Map<string, Cena>();

  ziskej(mesto: string, zaklad: string, enchant: number, typ: TypCeny): Cena | undefined {
    return this.mapa.get(klic(mesto, zaklad, enchant, typ));
  }

  uloz(cena: Cena, zaklad: string, enchant: number): void {
    this.mapa.set(klic(cena.mesto, zaklad, enchant, cena.typ), cena);
  }

  /** Ruční zadání. Má přednost před staženými cenami. */
  ulozRucne(mesto: string, zaklad: string, enchant: number, typ: TypCeny, hodnota: number): void {
    this.uloz(
      { hodnota, zdroj: "rucne", cas: new Date().toISOString(), mesto, typ },
      zaklad, enchant,
    );
  }

  get pocet(): number {
    return this.mapa.size;
  }

  /**
   * Naplní sklad odpovědí z AODP.
   *
   * Z jednoho řádku vzniknou DVĚ ceny — nákupní i prodejní strana.
   * Sentinelové a nulové hodnoty se přeskakují, aby se nikdy nepočítalo
   * s nulou místo „nevím".
   *
   * @param rozlozId  převod AODP ID zpět na (základ, enchant)
   * @returns kolik cen se uložilo
   */
  naplnZAodp(
    radky: RadekCeny[],
    rozlozId: (id: string) => { zaklad: string; enchant: number },
  ): number {
    let ulozeno = 0;

    for (const r of radky) {
      const { zaklad, enchant } = rozlozId(r.item_id);

      if (!jeSentinel(r.sell_price_min, r.sell_price_min_date)) {
        this.uloz({
          hodnota: r.sell_price_min, zdroj: "aodp",
          cas: r.sell_price_min_date, mesto: r.city, typ: "sell_min",
        }, zaklad, enchant);
        ulozeno++;
      }

      if (!jeSentinel(r.buy_price_max, r.buy_price_max_date)) {
        this.uloz({
          hodnota: r.buy_price_max, zdroj: "aodp",
          cas: r.buy_price_max_date, mesto: r.city, typ: "buy_max",
        }, zaklad, enchant);
        ulozeno++;
      }
    }
    return ulozeno;
  }

  /** Nejstarší cena z předaného seznamu, v hodinách. Null u ručních. */
  nejstarsiStari(ceny: (Cena | undefined)[]): number | null {
    let nejstarsi: number | null = null;
    for (const c of ceny) {
      if (!c?.cas || c.zdroj === "rucne") continue;
      const stari = stariHodin(c.cas);
      if (nejstarsi === null || stari > nejstarsi) nejstarsi = stari;
    }
    return nejstarsi;
  }
}
