/**
 * Refining — tři města, ne jedno.
 *
 * Proti Dílně, která kupuje i vyrábí na jednom místě, řeší refining
 * úplně jiný pohyb:
 *
 *     kde koupím rudu  →  kde ji refinuju  →  kde prodám ingot
 *      (kde je levná)     (kde je bonus)      (kde je drahý)
 *
 * Každý z těch tří kroků je jiné město a každý se dá nechat vybrat
 * automaticky. Proto je tenhle modul samostatný a ne příznak v Dílně.
 *
 * **Black Market tu nefiguruje vůbec.** Refined suroviny na něm mají
 * nulový objem (ověřeno ve F5, viz `bmObchodujeSkupinu`), takže odpadá
 * celá větev „prodat na BM / vézt na BM" a zbývá 7 městských tržnic.
 *
 * Výpočet se PŘEBÍRÁ ze skenu (`spocitatSken`), stejně jako v Dílně.
 * Tady je jen rozhodování o městech a to, co z něj plyne.
 */

import {
  spocitatBonus, spocitatRetezec,
  type Cena, type Enchant, type HerniPolozka, type Konstanty, type TypCeny,
  type UzelRetezce,
} from "@albion/jadro";
import { BLACK_MARKET, LINKY, MESTA, lokace, polozka, refinedKombinace } from "../data/hra";
import type { Kombinace, Linka } from "../data/hra";
import { SUROVINY_ID } from "../data/kategorie";
import { stariHodin } from "../data/aodp";
import { sazbaProPolozku } from "./stanice";
import {
  spocitatSken, typProNakup, typProProdej,
  type NastaveniSkenu, type RadekSkenu, type RezimCeny,
} from "./sken";
import { SkladCen } from "./skladCen";
import type { SkladHistorie } from "./skladHistorie";
import type { ZdrojCen } from "./dilna";

// ── Sentinely ──────────────────────────────────────────────────
//
// Dvojité podtržítko proto, aby se nikdy nesrazily s názvem města.
// Kdyby existovalo město „nejlevněji", rozpadlo by se rozhodování tiše.

/** Kupuj tam, kde je to nejlevnější. */
export const NAKUP_NEJLEVNEJI = "__nejlevneji__";
/** Refinuj tam, kde má město bonus na tuhle surovinu. */
export const REFINING_NEJL_BONUS = "__nejlepsi-bonus__";
/** Refinuj tam, kde vyjde nejvyšší zisk (projede všechna města). */
export const REFINING_NEJV_ZISK = "__nejvyssi-zisk__";
/** Prodej tam, kde je nejvyšší cena. */
export const PRODEJ_NEJLEPSI = "__nejlepsi-cena__";

/**
 * Výsledková hodnota, ne volba: každá surovina se koupila jinde.
 *
 * Slouží zároveň jako název „města" v dočasném skladu cen — díky tomu
 * projde nákup po vstupech stejným výpočtem jako všechno ostatní.
 */
export const NAKUP_RUZNA_MESTA = "__ruzna__";

/** Kolik procent rozdílu je ještě „skoro nastejno" a stojí za upozornění. */
const PRAH_TESNEHO_VITEZE = 0.05;

// ── Konfigurace ────────────────────────────────────────────────

export interface KonfigRefiningu {
  /** Město nákupu surovin, nebo `NAKUP_NEJLEVNEJI`. */
  nakup: string;
  /** Město refiningu, nebo `REFINING_NEJL_BONUS` / `REFINING_NEJV_ZISK`. */
  refining: string;
  /** Město prodeje, nebo `PRODEJ_NEJLEPSI`. */
  prodej: string;
  /**
   * Uplatní se jen u `NAKUP_NEJLEVNEJI`.
   *
   * `true` = všechny suroviny v jednom městě (jedna zastávka — tak se
   * reálně hraje). `false` = každá tam, kde je nejlevnější; ušetří silver,
   * ale znamená to objíždět tržnice.
   */
  jednoNakupniMesto: boolean;
  /** Ztráta na úseku nákup → refining, 0–1. Zdražuje NÁKLAD. */
  ztrataDoRefiningu: number;
  /** Ztráta na úseku refining → prodej, 0–1. Snižuje TRŽBU. */
  ztrataDoProdeje: number;
}

export const VYCHOZI_KONFIG_REFININGU: KonfigRefiningu = {
  nakup: NAKUP_NEJLEVNEJI,
  refining: REFINING_NEJL_BONUS,
  prodej: PRODEJ_NEJLEPSI,
  jednoNakupniMesto: true,
  // Nenulové odhady, ať se na riziko nezapomene — precedent z F7.
  ztrataDoRefiningu: 0.05,
  ztrataDoProdeje: 0.05,
};

export interface StavRefiningu {
  /** Klíče položek (`T5_METALBAR#0`) v pořadí přidání. */
  klice: string[];
  konfig: KonfigRefiningu;
  /** Přepis pro konkrétní položky. Chybí = globální. */
  override: Record<string, KonfigRefiningu>;
  zdrojCen: ZdrojCen;
}

export const PRAZDNY_REFINING: StavRefiningu = {
  klice: [], konfig: VYCHOZI_KONFIG_REFININGU, override: {}, zdrojCen: "orderbook",
};

/** Efektivní konfigurace položky: její override, jinak globální. */
export function konfigProKlicRefiningu(s: StavRefiningu, klic: string): KonfigRefiningu {
  return s.override[klic] ?? s.konfig;
}

export function jeAutoNakup(k: KonfigRefiningu): boolean {
  return k.nakup === NAKUP_NEJLEVNEJI;
}
export function jeAutoRefining(k: KonfigRefiningu): boolean {
  return k.refining === REFINING_NEJL_BONUS || k.refining === REFINING_NEJV_ZISK;
}
export function jeAutoProdej(k: KonfigRefiningu): boolean {
  return k.prodej === PRODEJ_NEJLEPSI;
}

// ── Katalog ────────────────────────────────────────────────────

export function klicRefiningu(zaklad: string, enchant: number): string {
  return `${zaklad}#${enchant}`;
}

/** Linka (`ore`, `hide`…) podle kategorie položky. */
export function linkaProKategorii(kategorie: string | null | undefined): Linka | undefined {
  if (!kategorie) return undefined;
  return LINKY.find((l) => l.kategorie === kategorie);
}

/**
 * Které město má bonus na tuhle linku.
 *
 * Z dat, ne z pevné tabulky: kdyby Sandbox bonusy přesunul, pevný seznam
 * by tiše radil špatné město. Vrací `undefined`, když bonus nemá nikdo.
 */
export function mestoSBonusem(kategorie: string | null | undefined): string | undefined {
  // Jen refining linky. Města mají modifikátory i na zbraně a brnění
  // (Lymhurst má +15 % na meče) a bez téhle podmínky by funkce na dotaz
  // „kde refinovat sword" vesele odpověděla Lymhurst — tedy nesmysl,
  // který by se v UI projevil jako doporučené město u položky, která
  // do refiningu vůbec nepatří.
  if (!kategorie || !linkaProKategorii(kategorie)) return undefined;

  let nej: { mesto: string; bonus: number } | null = null;
  for (const m of MESTA) {
    const b = m.modifikatory[kategorie] ?? 0;
    if (b > 0 && (!nej || b > nej.bonus)) nej = { mesto: m.nazev, bonus: b };
  }
  return nej?.mesto;
}

export interface RadaKatalogu {
  linka: Linka;
  /** Položky téhle linky po tierech, jen ty, které v datech opravdu jsou. */
  polozky: { tier: number; zaklad: string; enchanty: number[] }[];
}

/**
 * Katalog pro mřížku „linka × tier".
 *
 * Refined surovin je ~115, takže se dá naklikat celá řada najednou —
 * u Dílny to nešlo, tam je 3 240 kusů výbavy a zbývá jen vyhledávač.
 */
export function katalogRefiningu(): RadaKatalogu[] {
  const podleLinky = new Map<string, RadaKatalogu>();
  for (const linka of LINKY) podleLinky.set(linka.kategorie, { linka, polozky: [] });

  for (const { polozka: p, enchant } of refinedKombinace()) {
    const rada = podleLinky.get(p.kategorie ?? "");
    if (!rada) continue;
    const tier = tierZeZakladu(p.zaklad);
    if (tier === null) continue;

    const uz = rada.polozky.find((x) => x.zaklad === p.zaklad);
    if (uz) uz.enchanty.push(enchant);
    else rada.polozky.push({ tier, zaklad: p.zaklad, enchanty: [enchant] });
  }

  for (const rada of podleLinky.values()) {
    rada.polozky.sort((a, b) => a.tier - b.tier);
    for (const p of rada.polozky) p.enchanty.sort((a, b) => a - b);
  }
  return [...podleLinky.values()].filter((r) => r.polozky.length > 0);
}

function tierZeZakladu(zaklad: string): number | null {
  const shoda = /^T(\d)_/.exec(zaklad);
  return shoda ? Number(shoda[1]) : null;
}

/**
 * Klíče na platné kombinace. Neplatné se zahodí — v uloženém seznamu
 * může být položka z verze dat, která už neexistuje.
 */
export function kombinaceZKlicuRefiningu(klice: string[]): Kombinace[] {
  const vysledek: Kombinace[] = [];
  for (const k of klice) {
    const [zaklad, e] = k.split("#");
    if (!zaklad) continue;
    const p = polozka(zaklad);
    // Jen suroviny s receptem. Ruda samotná se nerefinuje, ta se kope.
    if (!p || p.druh !== "surovina" || !linkaProKategorii(p.kategorie)) continue;
    const enchant = Number(e ?? 0);
    if (!p.varianty.some((v) => v.enchant === enchant && !v.sFactionTokenem)) continue;
    vysledek.push({ polozka: p, enchant });
  }
  return vysledek;
}

// ── Výsledek ───────────────────────────────────────────────────

export interface NakupVstupu {
  zaklad: string;
  enchant: number;
  mesto: string;
  cena: number | null;
  /** Kolik kusů reálně koupíš (po return rate a ztrátě cestou). */
  kusu: number;
}

export interface VysledekRefiningu {
  klic: string;
  /** Efektivní města po rozhodnutí auto-režimů. */
  nakup: string;
  refining: string;
  prodej: string;
  /** Kde se koupil který vstup a za kolik — nákupní seznam pro dávku. */
  vstupy: NakupVstupu[];
  radek: RadekSkenu | null;
  /**
   * Druhý nejlepší kandidát, když vyhrál o míň než 5 %.
   *
   * Rozdíl v šumu není doporučení. Bez tohohle by karta tvrdila
   * „refinuj v Martlocku" tam, kde je Thetford prakticky stejný,
   * a uživatel by kvůli desetině procenta jel přes půl mapy.
   */
  tesnyVitez: { refining: string; zisk: number } | null;
  /**
   * O co tě připravilo vyloučení měst.
   *
   * Vyřadit Caerleon je legitimní volba — ale bez čísla je to volba slepá
   * a za měsíc už nepoznáš, jestli se ti pořád vyplácí. Null znamená buď
   * „nic není vyloučené", nebo „vyloučená města by stejně nebyla lepší".
   */
  usloTi: { mesto: string; zisk: number; oKolik: number } | null;
  /** Koupit nižší tier, nebo si ho refinovat? Null, když nejde určit. */
  nizsiTier: UzelRetezce | null;
  /** Jízdy mountem. Null = jede se nikam, města se shodují. */
  jizdDoRefiningu: number | null;
  jizdDoProdeje: number | null;
}

// ── Vyhodnocení ────────────────────────────────────────────────

interface Kontext {
  sklad: SkladCen;
  historie: SkladHistorie | undefined;
  konstanty: Konstanty;
  nastaveni: NastaveniSkenu;
  nazevPolozky: (zaklad: string, enchant: number) => string;
  typNakup: TypCeny;
  typProdej: TypCeny;
  nosnostKg: number;
  /** Hodiny; 0 = bez omezení. Auto-výběr starší ceny přeskočí. */
  maxStari: number;
  /** Města, ze kterých smí automatický výběr vybírat. */
  mesta: string[];
}

const NAZVY_MEST = MESTA.map((m) => m.nazev);

/**
 * Nejlepší město prodeje pro danou položku.
 *
 * Vybírá se **nezávisle na nákupu a refiningu**, protože cena výstupu
 * na nich nezávisí. Tím se z 7×7×7 = 343 kombinací stane 7×7 = 49
 * plných výpočtů na řádek — bez toho by karta při každé změně nastavení
 * počítala desetitisíce receptů.
 *
 * Jediná vazba na refining je ztráta cestou: prodej doma se za cestu
 * netrestá, proto se do porovnání promítne.
 */
function nejlepsiProdej(
  komb: Kombinace, mestoRefiningu: string, kandidati: string[],
  k: Kontext, ztrataDoProdeje: number,
): string {
  let nej: { mesto: string; hodnota: number } | null = null;

  for (const m of kandidati) {
    const cena = k.sklad.ziskej(m, komb.polozka.zaklad, komb.enchant, k.typProdej);
    if (!cena || !(cena.hodnota > 0)) continue;
    if (jeCenaStara(cena, k.maxStari)) continue;

    const podil = m === mestoRefiningu ? 1 : 1 - ztrataDoProdeje;
    const hodnota = cena.hodnota * podil;
    if (!nej || hodnota > nej.hodnota) nej = { mesto: m, hodnota };
  }

  // Když nikde není použitelná cena, vrátíme prvního kandidáta — řádek
  // pak skončí na „chybí cena", což je pravdivější než tichý přeskok.
  return nej?.mesto ?? kandidati[0] ?? mestoRefiningu;
}

/**
 * Je cena starší, než uživatel povolil?
 *
 * Auto-výběr se tím řídí schválně: doporučit trasu podle třídenní ceny
 * z prázdné tržnice je horší než nedoporučit nic. Ruční ceny (`cas === null`)
 * se nikdy nezahazují — ty zadal uživatel vědomě.
 */
function jeCenaStara(cena: Cena, maxStari: number): boolean {
  if (maxStari <= 0 || !cena.cas || cena.zdroj === "rucne") return false;
  const hodin = stariHodin(cena.cas);
  return Number.isFinite(hodin) && hodin > maxStari;
}

/**
 * Dočasný sklad pro nákup „každou surovinu tam, kde je nejlevnější".
 *
 * Místo zvláštní větve ve výpočtu se postaví malý sklad, ve kterém pod
 * sentinelovým městem leží pro každý vstup ta nejlevnější nalezená cena.
 * `spocitatSken` pak běží beze změny a nemusí o téhle možnosti vědět.
 *
 * Kopírují se i ceny výstupu, protože týž sklad obsluhuje obě strany —
 * bez nich by řádek hlásil „chybí cena" u toho, co se prodává.
 */
function skladPoVstupech(
  komb: Kombinace, k: Kontext, mestaProdeje: string[], mestaNakupu: string[],
): { sklad: SkladCen; kde: Map<string, string> } {
  const s = new SkladCen();
  const kde = new Map<string, string>();

  const varianta = varianta0(komb);
  for (const vstup of varianta?.vstupy ?? []) {
    let nej: { cena: Cena; mesto: string } | null = null;
    // Jen povolená města — jinak by „nejlevněji po vstupech" poslalo
    // uživatele nakoupit do Caerleonu, který si zrovna vyloučil.
    for (const m of mestaNakupu) {
      const c = k.sklad.ziskej(m, vstup.zaklad, vstup.enchant, k.typNakup);
      if (!c || !(c.hodnota > 0) || jeCenaStara(c, k.maxStari)) continue;
      if (!nej || c.hodnota < nej.cena.hodnota) nej = { cena: c, mesto: m };
    }
    if (!nej) continue;

    // Cena se přeznačí na sentinelové město; `cas` a `zdroj` zůstávají,
    // aby stáří i rozpoznání ruční ceny fungovalo dál.
    s.uloz({ ...nej.cena, mesto: NAKUP_RUZNA_MESTA }, vstup.zaklad, vstup.enchant);
    kde.set(`${vstup.zaklad}#${vstup.enchant}`, nej.mesto);
  }

  for (const m of mestaProdeje) {
    const c = k.sklad.ziskej(m, komb.polozka.zaklad, komb.enchant, k.typProdej);
    if (c) s.uloz(c, komb.polozka.zaklad, komb.enchant);
  }
  return { sklad: s, kde };
}

function varianta0(komb: Kombinace) {
  return komb.polozka.varianty.find(
    (v) => v.enchant === komb.enchant && !v.sFactionTokenem,
  );
}

/** Jeden pokus: konkrétní trojice měst → řádek skenu. */
function spocitejTrojici(
  komb: Kombinace, nakup: string, refining: string, prodej: string,
  konfig: KonfigRefiningu, k: Kontext, sklad: SkladCen,
): RadekSkenu | null {
  const radky = spocitatSken(
    {
      ...k.nastaveni,
      mesto: refining,
      nakupniMesto: nakup,
      prodejniMesto: prodej,
      // Suroviny, ne výbava — jinak by se uplatnil crafting bonus města
      // místo refining bonusu a Black Market by se stal možností.
      // `bmObchodujeSkupinu` na tuhle skupinu vrací false, takže se BM
      // nemůže do výpočtu dostat ani omylem.
      skupina: SUROVINY_ID,
      kategorie: [],
      mistoProdeje: "mesto",
      ztrataZasilek: konfig.ztrataDoProdeje,
      ztrataVstupu: konfig.ztrataDoRefiningu,
    },
    sklad, lokace(refining), k.konstanty, k.nazevPolozky, k.historie, [komb],
  );
  return radky[0] ?? null;
}

/**
 * Spočítá každou položku pod její efektivní konfigurací.
 *
 * Pořadí odpovídá seznamu; řazení a filtrování dělá až
 * [filtrDilny](./filtrDilny.ts), sdílený s Dílnou.
 */
export function vyhodnotitRefining(
  stav: StavRefiningu,
  sklad: SkladCen,
  historie: SkladHistorie | undefined,
  konstanty: Konstanty,
  nastaveni: NastaveniSkenu,
  nazevPolozky: (zaklad: string, enchant: number) => string,
  nosnostKg: number,
  maxStari: number,
  /**
   * Města, ze kterých smí automatický výběr vybírat. Chybí = všechna.
   * Ruční volba města tím omezená není.
   */
  mesta: string[] = NAZVY_MEST,
): VysledekRefiningu[] {
  const kombinace = kombinaceZKlicuRefiningu(stav.klice);
  const podleKlice = new Map<string, Kombinace>();
  for (const komb of kombinace) {
    podleKlice.set(klicRefiningu(komb.polozka.zaklad, komb.enchant), komb);
  }

  const efektivniSklad = stav.zdrojCen === "historie" && historie && historie.konec !== null
    ? skladZHistorieRefiningu(sklad, historie, kombinace)
    : sklad;

  const k: Kontext = {
    sklad: efektivniSklad, historie, konstanty, nastaveni, nazevPolozky,
    typNakup: typProNakup(nastaveni.rezimNakupu),
    typProdej: typProProdej(nastaveni.rezimProdeje),
    nosnostKg, maxStari,
    // Prázdný seznam by znamenal, že se nedá vybrat nic. Karta na to
    // upozorní sama; tady se nic nepředstírá.
    mesta,
  };

  return stav.klice.map((klic) => {
    const komb = podleKlice.get(klic);
    const konfig = konfigProKlicRefiningu(stav, klic);
    if (!komb) return prazdnyVysledek(klic, konfig);
    return vyhodnotJednu(klic, komb, konfig, k);
  });
}

function prazdnyVysledek(klic: string, konfig: KonfigRefiningu): VysledekRefiningu {
  return {
    klic,
    nakup: jeAutoNakup(konfig) ? NAKUP_RUZNA_MESTA : konfig.nakup,
    refining: jeAutoRefining(konfig) ? (MESTA[0]?.nazev ?? "") : konfig.refining,
    prodej: jeAutoProdej(konfig) ? (MESTA[0]?.nazev ?? "") : konfig.prodej,
    vstupy: [], radek: null, tesnyVitez: null, usloTi: null, nizsiTier: null,
    jizdDoRefiningu: null, jizdDoProdeje: null,
  };
}

interface Nalez {
  vitez: { radek: RadekSkenu | null; nakup: string; refining: string; prodej: string };
  druhy: { refining: string; zisk: number } | null;
  /** Sklad, ve kterém se počítalo — u nákupu po vstupech je dočasný. */
  sklad: SkladCen;
  kde: Map<string, string> | undefined;
  /** Zisk vítěze, nebo null když se nedal spočítat. */
  zisk: number | null;
}

/**
 * Projde povolená města a najde nejlepší trojici.
 *
 * Vytažené z `vyhodnotJednu` ven, aby šlo pustit dvakrát: jednou nad
 * povolenými městy a jednou nad všemi. Z rozdílu se pak dá říct, o co
 * uživatele vyloučení Caerleonu připravilo.
 */
function najdiNejlepsi(
  komb: Kombinace, konfig: KonfigRefiningu, k: Kontext, mesta: string[],
): Nalez | null {
  const mestaRefiningu = kandidatiRefiningu(komb, konfig, mesta);
  const mestaProdeje = jeAutoProdej(konfig) ? mesta : [konfig.prodej];
  if (mestaRefiningu.length === 0 || mestaProdeje.length === 0) return null;

  // Nákup po vstupech běží přes dočasný sklad, jinak se prochází města.
  const poVstupech = jeAutoNakup(konfig) && !konfig.jednoNakupniMesto
    ? skladPoVstupech(komb, k, mestaProdeje, mesta)
    : null;
  const mestaNakupu = poVstupech
    ? [NAKUP_RUZNA_MESTA]
    : jeAutoNakup(konfig) ? mesta : [konfig.nakup];
  if (mestaNakupu.length === 0) return null;
  const sklad = poVstupech?.sklad ?? k.sklad;

  let nej: { radek: RadekSkenu; nakup: string; refining: string; prodej: string } | null = null;
  let druhy: { refining: string; zisk: number } | null = null;
  let zaloha: Nalez["vitez"] | null = null;

  for (const refining of mestaRefiningu) {
    const prodej = nejlepsiProdej(komb, refining, mestaProdeje, k, konfig.ztrataDoProdeje);

    for (const nakup of mestaNakupu) {
      const radek = spocitejTrojici(komb, nakup, refining, prodej, konfig, k, sklad);
      zaloha ??= { radek, nakup, refining, prodej };
      if (!radek?.vysledek) continue;

      const zisk = radek.vysledek.zisk;
      if (!nej || zisk > nej.radek.vysledek!.zisk) {
        // Dosavadní vítěz klesá na druhé místo — jen když je to JINÉ
        // město refiningu. Druhý nejlepší nákup v témže městě uživatele
        // nezajímá, ten se stejně rozhoduje, kam pojede.
        if (nej && nej.refining !== refining) {
          druhy = { refining: nej.refining, zisk: nej.radek.vysledek!.zisk };
        }
        nej = { radek, nakup, refining, prodej };
      } else if (refining !== nej.refining && (!druhy || zisk > druhy.zisk)) {
        druhy = { refining, zisk };
      }
    }
  }

  const vitez = nej ?? zaloha;
  if (!vitez) return null;

  return {
    vitez, druhy, sklad, kde: poVstupech?.kde,
    zisk: nej?.radek.vysledek?.zisk ?? null,
  };
}

function vyhodnotJednu(
  klic: string, komb: Kombinace, konfig: KonfigRefiningu, k: Kontext,
): VysledekRefiningu {
  const nalez = najdiNejlepsi(komb, konfig, k, k.mesta);
  if (!nalez) return prazdnyVysledek(klic, konfig);

  const { vitez, druhy, sklad } = nalez;
  const radek = vitez.radek;
  const vysledek = radek?.vysledek ?? null;

  const tesnyVitez = nalez.zisk !== null && druhy && jeTesne(nalez.zisk, druhy.zisk)
    ? druhy
    : null;

  // ── O co tě připravilo vyloučení měst ────────────────────────
  //
  // Druhý průchod se pouští jen když je něco vyloučené — jinak by se
  // práce zdvojnásobila pro nic. Porovnává se zisk vítězů; hlásí se jen
  // tehdy, když vyloučené město opravdu vede a vede o něco znatelného.
  let usloTi: VysledekRefiningu["usloTi"] = null;
  if (k.mesta.length < NAZVY_MEST.length && nalez.zisk !== null) {
    const bezOmezeni = najdiNejlepsi(komb, konfig, k, NAZVY_MEST);
    const jinyZisk = bezOmezeni?.zisk ?? null;

    // Vyloučené město může vylepšit KTERÝKOLI ze tří kroků, ne jen
    // refining — typicky právě prodej, protože Caerleon platí nejvíc.
    // Dívat se jen na město výroby znamenalo, že se nejčastější případ
    // vůbec neohlásil.
    const povolena = new Set(k.mesta);
    const vylouceneKroky = bezOmezeni
      ? [bezOmezeni.vitez.nakup, bezOmezeni.vitez.refining, bezOmezeni.vitez.prodej]
        .filter((m) => m !== NAKUP_RUZNA_MESTA && !povolena.has(m))
      : [];

    if (jinyZisk !== null && vylouceneKroky.length > 0 && jinyZisk > nalez.zisk) {
      usloTi = {
        // Když jich je víc, stačí jmenovat jedno — uživateli jde o to,
        // že mu vyřazení něco bere, ne o přesný seznam.
        mesto: vylouceneKroky[0]!,
        zisk: jinyZisk,
        oKolik: nalez.zisk === 0 ? 1 : (jinyZisk - nalez.zisk) / Math.abs(nalez.zisk),
      };
    }
  }

  return {
    klic,
    nakup: vitez.nakup,
    refining: vitez.refining,
    prodej: vitez.prodej,
    vstupy: nakupniSeznam(komb, radek, vitez.nakup, nalez.kde, k, sklad),
    radek,
    tesnyVitez,
    usloTi,
    nizsiTier: retezecNizsihoTieru(komb, vitez.refining, vitez.nakup, k, sklad),
    // Jízdy jen tam, kde se opravdu jede. Vrácené suroviny vznikají až
    // u stanice, proto `vahaNakupu` a ne `vahaVstupu` — jinak by karta
    // hlásila o polovinu víc jízd, než je potřeba.
    jizdDoRefiningu: vitez.nakup === vitez.refining || !vysledek
      ? null
      : jizd(vysledek.vahaNakupu, k.nosnostKg),
    jizdDoProdeje: vitez.prodej === vitez.refining || !vysledek
      ? null
      : jizd(vysledek.vahaVystupu, k.nosnostKg),
  };
}

/**
 * Rozdíl v šumu není doporučení.
 *
 * Porovnává se proti absolutní hodnotě vítěze, aby to fungovalo i pro
 * ztrátové položky — u záporných čísel by prosté dělení obrátilo smysl.
 */
function jeTesne(nejlepsi: number, druhy: number): boolean {
  const merítko = Math.abs(nejlepsi);
  if (merítko === 0) return true;
  return (nejlepsi - druhy) / merítko < PRAH_TESNEHO_VITEZE;
}

function jizd(kg: number, nosnostKg: number): number | null {
  if (!(kg > 0) || !(nosnostKg > 0)) return null;
  return Math.ceil(kg / nosnostKg);
}

function kandidatiRefiningu(
  komb: Kombinace, konfig: KonfigRefiningu, mesta: string[],
): string[] {
  if (konfig.refining === REFINING_NEJV_ZISK) return mesta;
  if (konfig.refining === REFINING_NEJL_BONUS) {
    // Jedno město, spočítané z dat. Když bonus nemá nikdo (nemělo by
    // nastat), spadne se na projetí všech — radši dražší výpočet
    // než prázdný řádek.
    const s = mestoSBonusem(komb.polozka.kategorie);
    // Když je město s bonusem vyloučené, nelze ho tiše použít — vrátí se
    // povolená města a vybere se z nich to nejvýhodnější.
    if (s) return mesta.includes(s) ? [s] : mesta;
    return mesta;
  }
  // Ruční volba platí VŽDY, i pro vyloučené město. Vyloučení znamená
  // „nenabízej mi to sám", ne „zakaž to".
  return [konfig.refining];
}

/**
 * Nákupní seznam pro dávku — co a kde reálně koupit.
 *
 * Bere `efektivne` z výpočtu, ne nominální spotřebu receptu: vrácené
 * suroviny se nekupují. Přesně tohle číslo si člověk zadává do tržnice.
 */
function nakupniSeznam(
  komb: Kombinace, radek: RadekSkenu | null, mestoNakupu: string,
  kde: Map<string, string> | undefined, k: Kontext, sklad: SkladCen,
): NakupVstupu[] {
  const varianta = varianta0(komb);
  return (varianta?.vstupy ?? []).map((vstup) => {
    const klic = `${vstup.zaklad}#${vstup.enchant}`;
    const mesto = kde?.get(klic) ?? mestoNakupu;
    const radekVstupu = radek?.vysledek?.vstupy.find(
      (x) => x.zaklad === vstup.zaklad && x.enchant === vstup.enchant,
    );
    const cena = sklad.ziskej(mestoNakupu, vstup.zaklad, vstup.enchant, k.typNakup);
    return {
      zaklad: vstup.zaklad,
      enchant: vstup.enchant,
      mesto,
      cena: cena?.hodnota ?? null,
      // Zaokrouhluje se NAHORU: půl kusu rudy si v tržnici nekoupíš.
      kusu: Math.ceil(radekVstupu?.efektivne ?? 0),
    };
  });
}

/**
 * Vyplatí se nižší tier koupit, nebo si ho refinovat?
 *
 * T5 ingot potřebuje T4 ingot, a ten se dá buď koupit, nebo vyrobit
 * z T4 rudy — a na každém patře se znovu uplatní return rate. U refiningu
 * je to největší skrytý zisk a modul na to v jádru už je; jen ho zatím
 * žádná karta nepoužívala po řádcích.
 */
function retezecNizsihoTieru(
  komb: Kombinace, mestoRefiningu: string, mestoNakupu: string,
  k: Kontext, sklad: SkladCen,
): UzelRetezce | null {
  const varianta = varianta0(komb);
  // Vstup, který se sám dá refinovat — tedy nižší tier téže linky.
  const nizsi = (varianta?.vstupy ?? []).find((v) => {
    const p = polozka(v.zaklad);
    return !!p && p.druh === "surovina" && p.varianty.length > 0
      && p.kategorie === komb.polozka.kategorie;
  });
  if (!nizsi) return null;

  const lok = lokace(mestoRefiningu);
  return spocitatRetezec(nizsi.zaklad, nizsi.enchant as Enchant, {
    najdiPolozku: polozka,
    cena: (zaklad, enchant) =>
      sklad.ziskej(mestoNakupu, zaklad, enchant, k.typNakup)?.hodnota ?? null,
    // Bonus se počítá pro KAŽDOU položku zvlášť — město má bonus na svou
    // surovinu, ne na všechno. Prochází se přes `spocitatBonus`, aby
    // pravidlo existovalo jen jednou.
    bonusProPolozku: (p: HerniPolozka) => spocitatBonus(
      {
        mesto: mestoRefiningu,
        focus: k.nastaveni.focus,
        denniBonus: k.nastaveni.denniBonus,
      },
      lok, true, p.kategorie, k.konstanty.bonusFocus,
    ).bonusCelkem,
    // Každé patro řetězu má svou stanici — T5 ingot i T4 ingot pod ním
    // se tavějí v Tavírně, ale obecně to platit nemusí.
    sazbaStanice: (p: HerniPolozka) => sazbaProPolozku(k.nastaveni.sazbyStanic ?? {}, p),
    konstanty: k.konstanty,
  });
}

/**
 * Sklad postavený z 30denního mediánu obchodů.
 *
 * Stejný princip jako v Dílně: medián nerozlišuje nákup a prodej, počítá
 * se s férovou tržní cenou. Ruční ceny se překryjí navrch — co sis zapsal
 * z tržnice, pořád platí.
 *
 * Black Market se tu záměrně neobjevuje: refined suroviny na něm nejsou.
 */
function skladZHistorieRefiningu(
  realny: SkladCen, historie: SkladHistorie, kombinace: Kombinace[],
): SkladCen {
  const s = new SkladCen();
  const typy: TypCeny[] = ["sell_min", "buy_max"];

  const nastav = (mesto: string, zaklad: string, enchant: number) => {
    const cena = historie.ziskej(mesto, zaklad, enchant)?.median30;
    if (cena == null || !(cena > 0)) return;
    for (const typ of typy) {
      s.uloz({ hodnota: cena, zdroj: "aodp", cas: null, mesto, typ }, zaklad, enchant);
    }
  };

  for (const mesto of NAZVY_MEST) {
    for (const komb of kombinace) {
      nastav(mesto, komb.polozka.zaklad, komb.enchant);
      for (const vst of varianta0(komb)?.vstupy ?? []) {
        nastav(mesto, vst.zaklad, vst.enchant);
      }
    }
  }

  for (const u of realny.export()) {
    if (u.zdroj !== "rucne" || u.mesto === BLACK_MARKET) continue;
    s.uloz(
      { hodnota: u.hodnota, zdroj: "rucne", cas: u.cas, mesto: u.mesto, typ: u.typ },
      u.zaklad, u.enchant,
    );
  }
  return s;
}

// ── Kam se zapisuje ruční prodejní cena ────────────────────────

/**
 * Odkud se čte (a kam se ručně zapisuje) prodejní cena.
 *
 * **Musí to být jedno jediné místo**, stejně jako `kamSeProdava` v Dílně.
 * Kdyby si UI pravidlo opsalo, uživatel by přepsal cenu a zisk by se
 * nezměnil — vypadalo by to, že aplikace ignoruje vstup.
 */
export function kamSeProdavaRefining(
  v: VysledekRefiningu, rezimProdeje: RezimCeny,
): { mesto: string; typ: TypCeny } {
  return { mesto: v.prodej, typ: typProProdej(rezimProdeje) };
}

/**
 * Zafixuje město prodeje, když do něj uživatel zapsal ruční cenu.
 *
 * Bez toho by ruční cena změnila vítěze automatického výběru a políčko
 * by při dalším překreslení „uteklo" do jiného města — uživatel by viděl,
 * jak mu zadaná hodnota mizí.
 */
export function poRucniProdejniCene(
  stav: StavRefiningu, klic: string, mesto: string,
): StavRefiningu {
  const konfig = konfigProKlicRefiningu(stav, klic);
  if (!jeAutoProdej(konfig)) return stav;
  return {
    ...stav,
    override: { ...stav.override, [klic]: { ...konfig, prodej: mesto } },
  };
}

// ── Uložení ────────────────────────────────────────────────────
//
// Nezávislé na serveru — „co a jak refinuju" je volba, ne ekonomika.

const KLIC_ULOZISTE = "albion:refining:v1";

function ocistiKonfig(x: unknown): KonfigRefiningu {
  const o = (x ?? {}) as Partial<KonfigRefiningu>;
  const podil = (v: unknown, vychozi: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : vychozi;
  const mesto = (v: unknown, vychozi: string) =>
    typeof v === "string" && v !== "" ? v : vychozi;

  return {
    nakup: mesto(o.nakup, VYCHOZI_KONFIG_REFININGU.nakup),
    refining: mesto(o.refining, VYCHOZI_KONFIG_REFININGU.refining),
    prodej: mesto(o.prodej, VYCHOZI_KONFIG_REFININGU.prodej),
    jednoNakupniMesto: o.jednoNakupniMesto !== false,
    ztrataDoRefiningu: podil(o.ztrataDoRefiningu, VYCHOZI_KONFIG_REFININGU.ztrataDoRefiningu),
    ztrataDoProdeje: podil(o.ztrataDoProdeje, VYCHOZI_KONFIG_REFININGU.ztrataDoProdeje),
  };
}

export function ocistiStavRefiningu(x: unknown): StavRefiningu {
  const d = (x ?? {}) as Partial<StavRefiningu>;
  const klice = Array.isArray(d.klice)
    ? d.klice.filter((y): y is string => typeof y === "string")
    : [];
  const override: Record<string, KonfigRefiningu> = {};
  for (const [key, val] of Object.entries(d.override ?? {})) override[key] = ocistiKonfig(val);
  return {
    klice,
    konfig: ocistiKonfig(d.konfig),
    override,
    zdrojCen: d.zdrojCen === "historie" ? "historie" : "orderbook",
  };
}

export function nactiRefining(): StavRefiningu {
  try {
    const s = localStorage.getItem(KLIC_ULOZISTE);
    if (s) return ocistiStavRefiningu(JSON.parse(s));
  } catch {
    // Poškozený obsah — začni s prázdným seznamem.
  }
  return PRAZDNY_REFINING;
}

export function ulozRefining(stav: StavRefiningu): void {
  try {
    localStorage.setItem(KLIC_ULOZISTE, JSON.stringify(stav));
  } catch {
    // Nevadí — seznam je pohodlí, ne nutnost.
  }
}

// ── Presety ────────────────────────────────────────────────────

export interface PresetRefiningu {
  nazev: string;
  stav: StavRefiningu;
}

const KLIC_PRESETY = "albion:refining-presety:v1";

export function nactiPresetyRefiningu(): PresetRefiningu[] {
  try {
    const s = localStorage.getItem(KLIC_PRESETY);
    if (!s) return [];
    const d = JSON.parse(s);
    if (!Array.isArray(d)) return [];
    return d
      .filter((p): p is PresetRefiningu => p && typeof p.nazev === "string" && p.stav)
      .map((p) => ({ nazev: p.nazev, stav: ocistiStavRefiningu(p.stav) }));
  } catch {
    return [];
  }
}

export function ulozPresetyRefiningu(presety: PresetRefiningu[]): void {
  try {
    localStorage.setItem(KLIC_PRESETY, JSON.stringify(presety));
  } catch {
    // Nevadí.
  }
}

/** Souhrn nad tabulkou — kolik se povedlo spočítat. */
export function souhrnRefiningu(vysledky: VysledekRefiningu[]) {
  const spocitane = vysledky.filter((v) => v.radek?.vysledek);
  const podleMest = new Map<string, number>();
  for (const v of spocitane) podleMest.set(v.refining, (podleMest.get(v.refining) ?? 0) + 1);

  return {
    celkem: vysledky.length,
    spocitano: spocitane.length,
    ziskove: spocitane.filter((v) => (v.radek!.vysledek!.zisk ?? 0) > 0).length,
    chybiCena: vysledky.length - spocitane.length,
    tesne: vysledky.filter((v) => v.tesnyVitez !== null).length,
    podleMest: [...podleMest.entries()]
      .map(([mesto, pocet]) => ({ mesto, pocet }))
      .sort((a, b) => b.pocet - a.pocet),
  };
}
