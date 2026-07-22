/**
 * Společné formátování čísel.
 *
 * Tabulka i detail zobrazují tytéž hodnoty. Dvě kopie formátování by se
 * dřív nebo později rozešly a uživatel by viděl dvě různá čísla pro totéž.
 */

export const cislo = (n: number, des = 0): string =>
  n.toLocaleString("cs-CZ", { minimumFractionDigits: des, maximumFractionDigits: des });

export const procenta = (n: number, des = 1): string => `${cislo(n * 100, des)} %`;

/** Se znaménkem — u zisku je směr důležitější než hodnota. */
export const seZnamenkem = (n: number, des = 0): string =>
  `${n >= 0 ? "+" : ""}${cislo(n, des)}`;

/** Barva podle toho, jestli je hodnota zisk nebo ztráta. */
export const barvaHodnoty = (n: number): string =>
  n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";

/** Stáří dat: do 48 h v hodinách, dál ve dnech. */
export const stari = (hodin: number): string =>
  hodin < 48 ? `${cislo(hodin, 0)} h` : `${cislo(hodin / 24, 0)} d`;

/**
 * Barva podle stáří.
 * Zastaralá cena vypadá stejně jako čerstvá, dokud se neoznačí —
 * a data z AODP jsou crowdsourcovaná, takže stará bývají často.
 */
export const barvaStari = (hodin: number): string =>
  hodin < 6
    ? "text-emerald-600 dark:text-emerald-400"
    : hodin < 48
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
