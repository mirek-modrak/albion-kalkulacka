/**
 * Filtr měst pro kartu Příležitosti.
 *
 * Schválně SAMOSTATNÝ, ne napojený na „kam jsem ochoten jezdit" z Dílny
 * a Refiningu (`NastaveniGlobalni.zakazanaMesta`) — Mirek chce v týhle
 * kartě vyřadit Black Market a Brecilien nezávisle na tom, co si nastaví
 * jinde. Sdílené nastavení by tady znamenalo, že přepnutí v Příležitostech
 * změní i výrobu v Dílně.
 */

export interface FiltrMist {
  /** Prázdné pole = žádné město není vyloučené (počítají se všechna). */
  vylouceneMesta: string[];
  zahrnoutBM: boolean;
}

export const VYCHOZI_FILTR_MIST: FiltrMist = {
  vylouceneMesta: [],
  zahrnoutBM: true,
};

const KLIC = "albion:filtr-mist-prilezitosti:v1";

export function nactiFiltrMist(): FiltrMist {
  try {
    const s = localStorage.getItem(KLIC);
    if (!s) return VYCHOZI_FILTR_MIST;
    const d = JSON.parse(s) as Partial<FiltrMist>;
    return {
      vylouceneMesta: Array.isArray(d.vylouceneMesta)
        ? d.vylouceneMesta.filter((x): x is string => typeof x === "string")
        : [],
      zahrnoutBM: typeof d.zahrnoutBM === "boolean" ? d.zahrnoutBM : true,
    };
  } catch {
    return VYCHOZI_FILTR_MIST;
  }
}

export function ulozFiltrMist(f: FiltrMist): void {
  try {
    localStorage.setItem(KLIC, JSON.stringify(f));
  } catch {
    // Nevadí — filtr je pohodlí, ne nutnost.
  }
}
