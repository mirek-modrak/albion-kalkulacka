/**
 * Přihlašovací zeď — rozhodovací logika.
 *
 * Bez přihlášení se kalkulačka nepoužívá (F9c). Zeď se **neopírá o seznam
 * e-mailů v kódu** — ten je veřejný a v prohlížeči jde přepsat. Opírá se
 * o skutečnou odpověď Firestore na pokus přečíst vlastní data: povolení
 * uděluje server, ne prohlížeč.
 *
 * Tenhle soubor je schválně bez Reactu i bez Firebase, aby se rozhodování
 * dalo otestovat bez klikání.
 */

/** Jak dlouho se smí pracovat offline od posledního úspěšného ověření. */
export const OFFLINE_LHUTA_MS = 7 * 24 * 60 * 60 * 1000;

export type DuvodOdepreni = "neniNaSeznamu" | "offlinePrilisDlouho";

export type StavBrany =
  /** Ještě nevíme — probíhá ověření. */
  | { druh: "zjistuji" }
  /** Nikdo přihlášený → přihlašovací obrazovka. */
  | { druh: "prihlasSe" }
  | { druh: "pusteno"; offline: boolean }
  | { druh: "odepreno"; duvod: DuvodOdepreni };

/** Výsledek pokusu o čtení dat ze serveru, přeložený do tří možností. */
export type OdpovedServeru = "povoleno" | "odepreno" | "nedostupno";

// ── Záznam o posledním úspěšném ověření ────────────────────────
//
// Per e-mail, aby se dva uživatelé na jednom počítači nepletli.

function klic(email: string): string {
  return `albion:overeno:${email}`;
}

export function zapisOvereni(email: string, kdy: number): void {
  try {
    localStorage.setItem(klic(email), String(kdy));
  } catch {
    // Zakázané úložiště — jen se příště offline nepustí.
  }
}

export function posledniOvereni(email: string): number | null {
  try {
    const s = localStorage.getItem(klic(email));
    const n = s === null ? NaN : Number(s);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Jádro rozhodování.
 *
 * Rozlišuje „server řekl ne" od „server neodpověděl" — kdyby se to slilo,
 * výpadek sítě by uživateli tvrdil, že ho někdo vyhodil ze seznamu.
 */
export function rozhodni(
  odpoved: OdpovedServeru,
  posledniOk: number | null,
  ted: number,
): StavBrany {
  if (odpoved === "povoleno") return { druh: "pusteno", offline: false };
  if (odpoved === "odepreno") return { druh: "odepreno", duvod: "neniNaSeznamu" };

  // Server neodpověděl. Data má uživatel fyzicky u sebe, tak ho k nim
  // pustíme — ale jen když se nedávno prokázal.
  if (posledniOk !== null && ted - posledniOk <= OFFLINE_LHUTA_MS) {
    return { druh: "pusteno", offline: true };
  }
  return { druh: "odepreno", duvod: "offlinePrilisDlouho" };
}

/** Překlad chyby z adaptéru na jednu ze tří možností. */
export function prelozChybu(kod: string | undefined): OdpovedServeru {
  return kod === "permission-denied" ? "odepreno" : "nedostupno";
}
