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

  /**
   * Ruční zadání. Má přednost před staženými cenami a stažení ho nepřepíše.
   *
   * Hodnota se omezuje na rozumný rozsah — jádro validaci nedělá (a nemá,
   * je to čistá matematika), takže se to musí ošetřit tady, kde vstup vzniká.
   * Bez toho by záporná cena nebo 10^15 udělaly z celého pořadí nesmysl.
   */
  ulozRucne(mesto: string, zaklad: string, enchant: number, typ: TypCeny, hodnota: number): void {
    const omezena = Math.min(Math.max(hodnota, 0), 1_000_000_000);
    if (!Number.isFinite(omezena)) return;
    this.uloz(
      { hodnota: omezena, zdroj: "rucne", cas: new Date().toISOString(), mesto, typ },
      zaklad, enchant,
    );
  }

  /** Zruší ruční hodnotu, aby se zase používala cena z AODP. */
  zrusRucne(mesto: string, zaklad: string, enchant: number, typ: TypCeny): void {
    const k = klic(mesto, zaklad, enchant, typ);
    if (this.mapa.get(k)?.zdroj === "rucne") this.mapa.delete(k);
  }

  jeRucne(mesto: string, zaklad: string, enchant: number, typ: TypCeny): boolean {
    return this.mapa.get(klic(mesto, zaklad, enchant, typ))?.zdroj === "rucne";
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
  ): { ulozeno: number; zachovanoRucnich: number } {
    let ulozeno = 0;
    let zachovanoRucnich = 0;

    // Ručně zadaná cena je vědomý zásah — nový sken ji NEPŘEPÍŠE.
    // Jinak by uživatel opravoval totéž po každém skenu znovu.
    const ulozPokudNeniRucni = (cena: Cena, zaklad: string, enchant: number) => {
      if (this.jeRucne(cena.mesto, zaklad, enchant, cena.typ)) {
        zachovanoRucnich++;
        return;
      }
      this.uloz(cena, zaklad, enchant);
      ulozeno++;
    };

    for (const r of radky) {
      const { zaklad, enchant } = rozlozId(r.item_id);

      if (!jeSentinel(r.sell_price_min, r.sell_price_min_date)) {
        ulozPokudNeniRucni({
          hodnota: r.sell_price_min, zdroj: "aodp",
          cas: r.sell_price_min_date, mesto: r.city, typ: "sell_min",
        }, zaklad, enchant);
      }

      if (!jeSentinel(r.buy_price_max, r.buy_price_max_date)) {
        ulozPokudNeniRucni({
          hodnota: r.buy_price_max, zdroj: "aodp",
          cas: r.buy_price_max_date, mesto: r.city, typ: "buy_max",
        }, zaklad, enchant);
      }
    }
    return { ulozeno, zachovanoRucnich };
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
