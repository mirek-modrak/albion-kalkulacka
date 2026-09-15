/**
 * Koupit, vyrobit, nebo enchantovat? — rekurzivní výpočet nákladu přes řetěz.
 *
 * Recepty tvoří řetěz: T5 ingot ← T4 ingot ← T3 ingot ← T2 ingot ← ruda.
 * Na KAŽDÉM patře se uplatní return rate, takže úspora z vlastní výroby
 * se skládá. Když je ale surovina vzácná, může být levnější koupit hotové.
 *
 * U enchantované výbavy existuje třetí cesta, kterou z receptů odvodit nejde:
 * vzít kus o stupeň níž a povýšit ho runou / duší / relikvií. Herní data ji
 * popisují zvlášť (`vylepseni`), protože to NENÍ recept — viz `cestaEnchantem`.
 *
 * Jádro:
 *   naklad(p) = min(
 *     cena na trhu,                                     // koupit
 *     Σ naklad(vstup) × efektivní počet + poplatek,     // vyrobit
 *     naklad(p o stupeň níž) + Σ naklad(runa) × počet   // enchantovat
 *   )
 */

import { returnRate } from "./bonusy.js";
import { poplatekStanice, vybratVariantu } from "./recept.js";
import type { Enchant, HerniPolozka, Konstanty, Varianta } from "./typy.js";

/** Jak se k položce dostat. */
export type Zpusob = "koupit" | "vyrobit" | "enchantovat" | "nedostupne";

export interface UzelRetezce {
  zaklad: string;
  enchant: Enchant;
  /** Co se vyplatí. */
  zpusob: Zpusob;
  /** Náklad na jeden kus tou levnější cestou. */
  naklad: number | null;
  /** Cena na trhu, pokud je známá. */
  cenaNaTrhu: number | null;
  /** Náklad při vlastní výrobě, pokud jde vyrobit. */
  nakladVyrobou: number | null;
  /**
   * Náklad při povýšení kusu o stupeň enchantu, pokud ta cesta existuje.
   *
   * Null znamená dvě různé věci a UI je musí rozlišit: buď položka takovou
   * cestu nemá (enchant 0, `.4` kusy, suroviny), nebo ji má, ale chybí cena
   * runy nebo kusu o stupeň níž. Mlčet o druhém případě by znamenalo
   * doporučit výrobu, aniž by uživatel věděl, že se třetí cesta nepočítala.
   */
  nakladEnchantem: number | null;
  /** O kolik je výroba levnější (0,15 = o 15 %). Null, když nejde porovnat. */
  usporaVyrobou: number | null;
  /**
   * O kolik je NEJLEVNĚJŠÍ cesta lepší než nákup na trhu.
   *
   * Oddělené od `usporaVyrobou`, která zná jen výrobu: když vyhraje
   * enchantování, musí se hlásit úspora TÉ cesty, ne výroby. Refining
   * čte dál `usporaVyrobou` — suroviny cestu enchantem nemají.
   */
  uspora: number | null;
  /** Return rate na tomhle patře. Liší se podle města i suroviny. */
  returnRate: number;
  /** Focus na jeden kus, když se vyrábí. Enchantování focus nestojí. */
  focus: number;
  /**
   * Vstupy zvolené cesty — suroviny při výrobě, nebo kus o stupeň níž
   * a runy při enchantování. U nákupu prázdné.
   */
  vstupy: { uzel: UzelRetezce; pocetNaKus: number; efektivneNaKus: number }[];
}

export interface KontextRetezce {
  /** Najde položku v herních datech. */
  najdiPolozku: (zaklad: string) => HerniPolozka | undefined;
  /** Cena na trhu, nebo null. */
  cena: (zaklad: string, enchant: Enchant) => number | null;
  /** Production bonus pro danou položku — liší se podle města a suroviny. */
  bonusProPolozku: (polozka: HerniPolozka) => number;
  /**
   * Sazba stanice pro danou položku.
   *
   * **Funkce, ne číslo.** Řetěz prochází patra a každé patro se vyrábí
   * jinde: T5 meč ve Warrior's Forge, ale T5 ingot pod ním v Tavírně
   * a T4 ingot pod tím taky. Jedno společné číslo (stav do F11) uplatnilo
   * sazbu kovárny i na tavení, takže náklad na vlastní výrobu vycházel
   * špatně — a právě podle něj se rozhoduje „koupit, nebo vyrobit".
   */
  sazbaStanice: (polozka: HerniPolozka) => number;
  konstanty: Konstanty;
  /** Pojistka proti zacyklení. */
  maxHloubka?: number;
}

const VYCHOZI_MAX_HLOUBKA = 12;

/**
 * Varianta receptu použitelná v řetězu.
 *
 * Přísnější než `vybratVariantu`: **recept BEZ vstupů se nepočítá jako
 * cesta výroby.** V herních datech jich je 140 — tokeny, essence potions,
 * blueprinty cap. Jsou to odměny z aktivit, ne výroba, ale ve struktuře dat
 * vypadají jako recept s prázdným seznamem surovin.
 *
 * Co to dělalo: součet vstupů = 0, poplatek 0 → náklad na výrobu vyšel 0
 * a řetěz hlásil „vyrobit zadarmo". Nejhorší dopad má na runy: každá runa
 * se dá „vyrobit" ze Siphoned Energy, což je přesně taková položka —
 * takže runy stály nula a enchantování by vycházelo jako zadarmo VŽDY.
 * Odhalily to testy negativního prostoru u cesty enchantem.
 *
 * Faction token řeší dál `vybratVariantu`, ať je to pravidlo na jednom místě.
 */
function variantaProRetezec(polozka: HerniPolozka, enchant: Enchant): Varianta | undefined {
  const skutecne = polozka.varianty.filter((v) => v.vstupy.length > 0);
  if (skutecne.length === polozka.varianty.length) return vybratVariantu(polozka, enchant);
  return vybratVariantu({ ...polozka, varianty: skutecne }, enchant);
}

function klic(zaklad: string, enchant: number): string {
  return `${zaklad}#${enchant}`;
}

/**
 * Spočítá, jestli je levnější položku koupit, nebo vyrobit.
 *
 * @param naVrcholuVzdyVyrobit u zkoumané položky nás zajímá výroba,
 *   i kdyby byl nákup levnější — chceme vidět obě čísla
 */
export function spocitatRetezec(
  zaklad: string,
  enchant: Enchant,
  kontext: KontextRetezce,
): UzelRetezce {
  return uzel(zaklad, enchant, kontext, new Map(), new Set(), 0);
}

function uzel(
  zaklad: string,
  enchant: Enchant,
  kontext: KontextRetezce,
  kes: Map<string, UzelRetezce>,
  naCeste: Set<string>,
  hloubka: number,
): UzelRetezce {
  const k = klic(zaklad, enchant);

  // Táž položka je vstupem víc receptů — bez keše by se u T8 počítala
  // exponenciálně mnohokrát.
  const ulozeny = kes.get(k);
  if (ulozeny) return ulozeny;

  const cenaNaTrhu = kontext.cena(zaklad, enchant);
  const polozka = kontext.najdiPolozku(zaklad);

  const jenKoupit = (): UzelRetezce => ({
    zaklad, enchant,
    zpusob: cenaNaTrhu !== null ? "koupit" : "nedostupne",
    naklad: cenaNaTrhu,
    cenaNaTrhu, nakladVyrobou: null, nakladEnchantem: null,
    usporaVyrobou: null, uspora: null,
    returnRate: 0, focus: 0, vstupy: [],
  });

  // Konec rekurze: položka bez receptu (raw surovina se sbírá, nevyrábí).
  if (!polozka) return zapamatuj(kes, k, jenKoupit());

  // Ochrana proti cyklu. V herních datech by být neměl, ale kdyby se
  // objevil, zacyklil by výpočet a shodil prohlížeč.
  if (naCeste.has(k) || hloubka >= (kontext.maxHloubka ?? VYCHOZI_MAX_HLOUBKA)) {
    return jenKoupit();   // NEcachovat — platí jen pro tuhle větev
  }

  naCeste.add(k);

  // ── Cesta 2: vyrobit ze surovin ───────────────────────────────
  //
  // Chybějící varianta receptu UŽ NEUKONČUJE výpočet — položka pořád může
  // mít cestu enchantem. Dřív se tu vracelo „jen koupit" a tím se ta cesta
  // tiše zahodila.
  const varianta = variantaProRetezec(polozka, enchant);

  // Return rate se počítá pro KAŽDOU položku zvlášť — bonus města platí
  // jen na svou surovinu. V Thetfordu má ruda +40, dřevo nic.
  const rrr = varianta ? returnRate(kontext.bonusProPolozku(polozka)) : 0;

  let nakladVyrobou: number | null = null;
  const vstupyVyroby: UzelRetezce["vstupy"] = [];

  if (varianta) {
    let nakladVstupu = 0;
    let lzeVyrobit = true;

    for (const vstup of varianta.vstupy) {
      const dite = uzel(vstup.zaklad, vstup.enchant, kontext, kes, naCeste, hloubka + 1);

      // Vrácené suroviny snižují spotřebu — ale jen ty vratné.
      // Artefakty a runy se nevracejí.
      const naKus = (vstup.pocet / varianta.pocetVyrobenych);
      const efektivne = vstup.vratna ? naKus * (1 - rrr) : naKus;

      vstupyVyroby.push({ uzel: dite, pocetNaKus: naKus, efektivneNaKus: efektivne });

      if (dite.naklad === null) lzeVyrobit = false;
      else nakladVstupu += dite.naklad * efektivne;
    }

    // Poplatek stanice se platí na KAŽDÉM patře, kde se vyrábí.
    // Sazba té stanice, ve které se vyrábí TAHLE položka — ne ta, ve které
    // se vyrábí výrobek na vrcholu řetězu.
    const poplatek = poplatekStanice(
      polozka, enchant, kontext.sazbaStanice(polozka), kontext.konstanty.nutritionKoeficient,
    );
    // Pevný poplatek za dávku — nenulový u transmutace suroviny na vyšší
    // tier. Bez něj by transmutace vypadala zadarmo a řetěz by ji chybně
    // doporučoval.
    const silverNaKus = varianta.silver / varianta.pocetVyrobenych;

    nakladVyrobou = lzeVyrobit ? nakladVstupu + poplatek + silverNaKus : null;
  }

  // ── Cesta 3: povýšit hotový kus o stupeň enchantu ─────────────
  const enchantem = cestaEnchantem(polozka, enchant, kontext, kes, naCeste, hloubka);

  naCeste.delete(k);

  // Nejlevnější cesta vyhrává. Když jde jen jedna, bereme ji — vrátit
  // „nedostupné" jen proto, že chybí prostřední článek, by zahodilo
  // platný výsledek.
  //
  // Na pořadí záleží: při SHODĚ nákladů vyhraje ta dřívější, tedy nákup
  // před výrobou a výroba před enchantováním. Zachovává to chování z doby
  // před třetí cestou (tehdy „nakladVyrobou < cenaNaTrhu ? vyrobit : koupit")
  // a je to i správné doporučení — za stejné peníze je nákup nejmíň práce.
  const cesty: { zpusob: Zpusob; naklad: number }[] = [];
  if (cenaNaTrhu !== null) cesty.push({ zpusob: "koupit", naklad: cenaNaTrhu });
  if (nakladVyrobou !== null) cesty.push({ zpusob: "vyrobit", naklad: nakladVyrobou });
  if (enchantem.naklad !== null) {
    cesty.push({ zpusob: "enchantovat", naklad: enchantem.naklad });
  }

  const nejlepsi = cesty.reduce<{ zpusob: Zpusob; naklad: number } | null>(
    (a, b) => (a === null || b.naklad < a.naklad ? b : a), null,
  );

  const zpusob: Zpusob = nejlepsi?.zpusob ?? "nedostupne";
  const naklad = nejlepsi?.naklad ?? null;

  /** O kolik je daná cesta levnější než nákup na trhu. */
  const podil = (proti: number | null) =>
    cenaNaTrhu !== null && proti !== null && cenaNaTrhu > 0
      ? (cenaNaTrhu - proti) / cenaNaTrhu
      : null;

  return zapamatuj(kes, k, {
    zaklad, enchant, zpusob, naklad, cenaNaTrhu,
    nakladVyrobou, nakladEnchantem: enchantem.naklad,
    usporaVyrobou: podil(nakladVyrobou),
    uspora: podil(naklad),
    returnRate: rrr,
    // Focus patří k výrobě. Enchantování ho nestojí, takže když vyhraje
    // cesta enchantem, souhrn ho nesmí započítat — viz shrnRetezec.
    focus: varianta ? varianta.focus / varianta.pocetVyrobenych : 0,
    vstupy: zpusob === "vyrobit" ? vstupyVyroby
      : zpusob === "enchantovat" ? enchantem.vstupy
        : [],
  });
}

/**
 * Povýšení hotového kusu runou / duší / relikvií.
 *
 * **Není to recept, a proto to není jen další varianta.** Tři věci se tu
 * chovají jinak než u výroby a naroubovat to na `Varianta` by je tiše
 * pokazilo:
 *
 *  1. **Return rate se neuplatní.** Runy jsou v datech `vratna: false`
 *     a základní kus se spotřebuje celý. Kdyby na to spadl return rate
 *     města, vycházelo by enchantování levněji, než je.
 *  2. **Neplatí se poplatek stanice.** Za enchant runami se platí jen
 *     runami — ověřeno u majitele projektu 2026-09-06.
 *  3. **Nestojí to focus.** Tamtéž.
 *
 * Rekurze skončí vždy: enchant klesá o jedna a na nule cesta neexistuje.
 */
function cestaEnchantem(
  polozka: HerniPolozka,
  enchant: Enchant,
  kontext: KontextRetezce,
  kes: Map<string, UzelRetezce>,
  naCeste: Set<string>,
  hloubka: number,
): { naklad: number | null; vstupy: UzelRetezce["vstupy"] } {
  const nic = { naklad: null, vstupy: [] };

  const cesta = polozka.vylepseni.find((v) => v.naEnchant === enchant);
  if (enchant === 0 || !cesta || cesta.vstupy.length === 0) return nic;

  // Kus o stupeň níž — a to rovnou tou nejlevnější cestou, takže se řetěz
  // enchantů (.0 → .1 → .2) poskládá rekurzí, ne zvláštní smyčkou.
  const nizsi = uzel(
    polozka.zaklad, (enchant - 1) as Enchant, kontext, kes, naCeste, hloubka + 1,
  );
  if (nizsi.naklad === null) return nic;

  let naklad = nizsi.naklad;
  const vstupy: UzelRetezce["vstupy"] = [
    { uzel: nizsi, pocetNaKus: 1, efektivneNaKus: 1 },
  ];

  for (const v of cesta.vstupy) {
    const dite = uzel(v.zaklad, v.enchant, kontext, kes, naCeste, hloubka + 1);
    // Bez ceny runy cesta neexistuje. Vrátit ji s neúplným nákladem by
    // znamenalo doporučit enchantování za cenu, která není celá.
    if (dite.naklad === null) return nic;

    vstupy.push({ uzel: dite, pocetNaKus: v.pocet, efektivneNaKus: v.pocet });
    naklad += dite.naklad * v.pocet;
  }

  return { naklad, vstupy };
}

function zapamatuj(kes: Map<string, UzelRetezce>, k: string, u: UzelRetezce): UzelRetezce {
  kes.set(k, u);
  return u;
}

/**
 * Souhrn celého řetězu.
 *
 * Úspora v silveru není celá pravda — hluboká výroba stojí čas a focus
 * na každém patře. Bez těch čísel by kalkulačka doporučovala výrobu,
 * aniž by řekla, co to obnáší.
 *
 * Kroky enchantu se počítají zvlášť od kroků výroby: taky je musíš odklikat,
 * ale focus nestojí ani se u nich nečeká na dávku. Slít je do jednoho čísla
 * by znamenalo tvrdit „5 kroků výroby" o řetězu, kde se třikrát jen přisypou
 * runy.
 */
export function shrnRetezec(korenu: UzelRetezce): {
  focusCelkem: number;
  krokuVyroby: number;
  krokuEnchantu: number;
  nejhlubsiUroven: number;
} {
  let focusCelkem = 0;
  let krokuVyroby = 0;
  let krokuEnchantu = 0;
  let nejhlubsiUroven = 0;

  const projdi = (u: UzelRetezce, mnozstvi: number, uroven: number) => {
    if (u.zpusob === "vyrobit") {
      focusCelkem += u.focus * mnozstvi;
      krokuVyroby++;
    } else if (u.zpusob === "enchantovat") {
      // Focus se ZÁMĚRNĚ nepřičítá — uzel ho v sobě má z receptu na výrobu,
      // ale tou cestou se nejde. Přičíst ho by nafouklo spotřebu focusu
      // o dávku, kterou nikdy nespustíš.
      krokuEnchantu++;
    } else {
      return;   // koupit / nedostupné — dál se řetěz nerozvíjí
    }
    nejhlubsiUroven = Math.max(nejhlubsiUroven, uroven);
    for (const v of u.vstupy) projdi(v.uzel, mnozstvi * v.efektivneNaKus, uroven + 1);
  };

  projdi(korenu, 1, 0);
  return { focusCelkem, krokuVyroby, krokuEnchantu, nejhlubsiUroven };
}
