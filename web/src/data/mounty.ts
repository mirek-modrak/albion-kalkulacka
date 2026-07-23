/**
 * Nosnost mountů.
 *
 * Data NEJSOU v herních souborech — atribut `maxload` je v `items.xml`
 * u všech 813 výskytů nula a ve `spells.xml` chybí úplně. Jde o server-side
 * konfiguraci, takže jediný zdroj je komunitní seznam.
 *
 * Viz data/mounts.json a docs/todo.md.
 */

import surova from "../../../data/mounts.json";

export interface Mount {
  nazev: string;
  kg: number;
  kategorie: string;
  /** Hodnota vzbuzuje podezření a nebyla ověřena ve hře. */
  overit?: boolean;
}

interface SurovyMount {
  nazev: string;
  kg: number;
  kategorie: string;
  overit?: boolean;
}

export const MOUNTY: Mount[] = (surova as { mounty: SurovyMount[] }).mounty
  .slice()
  .sort((a, b) => b.kg - a.kg);

/** Výchozí volba — běžný transportní mount, ne ten s podezřelou hodnotou. */
export const VYCHOZI_MOUNT = "Elder's Transport Ox";

export function mount(nazev: string): Mount | undefined {
  return MOUNTY.find((m) => m.nazev === nazev);
}
