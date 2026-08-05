/**
 * Synchronizace mezi zařízeními — adaptér.
 *
 * **Tohle je JEDINÝ soubor, který smí importovat `firebase/*`.** Zbytek
 * aplikace o Firebase nesmí vědět. Důvod je přenositelnost (F9b): přechod
 * na vlastní server znamená přepsat tenhle soubor, ne aplikaci.
 *
 * Zatím umí jen přihlášení a odhlášení. Čtení a zápis dat přibude
 * v kroku 4 a 5 podle [f9b-plan.md](../../../docs/f9b-plan.md).
 *
 * Dvě věci, které stojí za vysvětlení:
 *
 * 1. **Knihovna se načítá až při prvním použití** (`import()` uvnitř funkcí).
 *    Firebase je velký balík a kdo se nepřihlašuje, nemá důvod ho stahovat.
 *    Aplikace tím funguje beze změny i bez sítě.
 *
 * 2. **Vlastní příznak v `localStorage`.** Abychom po návratu na stránku
 *    věděli, že se máme pokusit obnovit přihlášení, aniž bychom kvůli tomu
 *    načítali celý Firebase u každého návštěvníka.
 */

import { VERZE_BALICKU, idZarizeni, jePrilisNovy, type Balicek, type DataBalicku } from "./balicek";

/** Není secret — u Firebase patří do frontendu. Ochranu dělají pravidla. */
const KONFIG = {
  apiKey: "AIzaSyD2As3bkNA8PLIl-ItE-WySwUU7h4v9rEg",
  authDomain: "albion-kalkulacka.firebaseapp.com",
  projectId: "albion-kalkulacka",
  storageBucket: "albion-kalkulacka.firebasestorage.app",
  messagingSenderId: "548199596129",
  appId: "1:548199596129:web:cbb049c0076360d048aa20",
};

const KLIC_PRIZNAKU = "albion:prihlasen";

export interface Uzivatel {
  /** VŽDY malými písmeny — je to budoucí klíč dokumentu (viz vada 5 v plánu). */
  email: string;
  jmeno: string | null;
}

/**
 * Byl uživatel přihlášený, když tu byl naposledy?
 *
 * Odpovídá okamžitě a bez sítě. Slouží jen k rozhodnutí, jestli má cenu
 * načítat Firebase — není to důkaz platného přihlášení.
 */
export function bylPrihlasen(): boolean {
  try {
    return localStorage.getItem(KLIC_PRIZNAKU) === "1";
  } catch {
    return false;
  }
}

function zapisPriznak(hodnota: boolean): void {
  try {
    if (hodnota) localStorage.setItem(KLIC_PRIZNAKU, "1");
    else localStorage.removeItem(KLIC_PRIZNAKU);
  } catch {
    // Zakázané úložiště — přihlášení bude fungovat, jen se neobnoví samo.
  }
}

/** E-mail jako klíč se normalizuje na jednom jediném místě — tady. */
function normalizuj(email: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

type FirebaseAuth = Awaited<ReturnType<typeof nactiAuth>>;

let rozpracovane: Promise<FirebaseAuth> | undefined;

async function aplikace() {
  const { initializeApp, getApps, getApp } = await import("firebase/app");
  return getApps().length ? getApp() : initializeApp(KONFIG);
}

async function nactiAuth() {
  const [app, auth] = await Promise.all([aplikace(), import("firebase/auth")]);
  return { auth: auth.getAuth(app), modul: auth };
}

/** Načte Firebase nejvýš jednou, i když se o to požádá vícekrát naráz. */
function firebase(): Promise<FirebaseAuth> {
  rozpracovane ??= nactiAuth();
  return rozpracovane;
}

function naUzivatele(u: { email: string | null; displayName: string | null } | null): Uzivatel | null {
  if (!u?.email) return null;
  return { email: normalizuj(u.email), jmeno: u.displayName };
}

/**
 * Sleduje stav přihlášení. Vrací funkci pro ukončení sledování.
 *
 * Volá se i při obnovení stránky — Firebase si přihlášení pamatuje sám.
 */
export async function sledujPrihlaseni(
  zmena: (u: Uzivatel | null) => void,
): Promise<() => void> {
  const { auth, modul } = await firebase();
  return modul.onAuthStateChanged(auth, (u) => {
    const uzivatel = naUzivatele(u);
    zapisPriznak(uzivatel !== null);
    zmena(uzivatel);
  });
}

/** Chyby, které chceme uživateli vysvětlit česky, ne kódem od Googlu. */
function srozumitelnaChyba(e: unknown): string {
  const kod = (e as { code?: string })?.code ?? "";
  if (kod === "auth/popup-closed-by-user" || kod === "auth/cancelled-popup-request") {
    return "Přihlašovací okno bylo zavřené.";
  }
  if (kod === "auth/popup-blocked") {
    return "Prohlížeč zablokoval vyskakovací okno. Povol ho a zkus to znovu.";
  }
  if (kod === "auth/network-request-failed") {
    return "Nepodařilo se spojit se serverem. Zkontroluj připojení.";
  }
  if (kod === "auth/unauthorized-domain") {
    return "Tahle adresa není ve Firebase povolená.";
  }
  return `Přihlášení se nepovedlo (${kod || "neznámá chyba"}).`;
}

export class ChybaPrihlaseni extends Error {}

export async function prihlas(): Promise<Uzivatel> {
  try {
    const { auth, modul } = await firebase();
    const provider = new modul.GoogleAuthProvider();
    const vysledek = await modul.signInWithPopup(auth, provider);
    const uzivatel = naUzivatele(vysledek.user);
    if (!uzivatel) throw new ChybaPrihlaseni("Účet nemá e-mailovou adresu.");
    zapisPriznak(true);
    return uzivatel;
  } catch (e) {
    if (e instanceof ChybaPrihlaseni) throw e;
    throw new ChybaPrihlaseni(srozumitelnaChyba(e));
  }
}

// ── Data ───────────────────────────────────────────────────────

let rozpracovanaData: Promise<Awaited<ReturnType<typeof nactiFirestore>>> | undefined;

async function nactiFirestore() {
  const [app, fs] = await Promise.all([aplikace(), import("firebase/firestore")]);
  return { db: fs.getFirestore(app), modul: fs };
}

function firestore() {
  rozpracovanaData ??= nactiFirestore();
  return rozpracovanaData;
}

export class ChybaDat extends Error {
  /**
   * Původní kód od Firebase (`permission-denied`, `unavailable`…).
   *
   * Brána podle něj rozlišuje „server řekl ne" od „server neodpověděl".
   * Kdyby se to slilo do jedné chyby, výpadek sítě by uživateli tvrdil,
   * že nemá přístup.
   */
  constructor(zprava: string, readonly kod?: string) {
    super(zprava);
  }
}

function srozumitelnaChybaDat(e: unknown): string {
  const kod = (e as { code?: string })?.code ?? "";
  if (kod === "permission-denied") {
    return "Tenhle účet nemá přístup k datům. Napiš Mirkovi, ať tě přidá.";
  }
  if (kod === "unavailable" || kod === "failed-precondition") {
    return "Server je nedostupný. Data zůstávají uložená v prohlížeči.";
  }
  return `Načtení dat se nepovedlo (${kod || "neznámá chyba"}).`;
}

/**
 * Načte balíček uživatele ze serveru.
 *
 * Vrací `null`, když uživatel na serveru ještě nic nemá — to není chyba,
 * ale úplně běžný stav při prvním přihlášení.
 */
export async function nactiZeServeru(email: string): Promise<Balicek | null> {
  try {
    const { db, modul } = await firestore();
    const snimek = await modul.getDoc(modul.doc(db, "uzivatele", normalizuj(email)));
    if (!snimek.exists()) return null;
    return snimek.data() as Balicek;
  } catch (e) {
    throw new ChybaDat(srozumitelnaChybaDat(e), (e as { code?: string })?.code);
  }
}

/** Čas poslední změny v milisekundách, nebo `null` když chybí. */
export function casZmeny(b: Balicek | null): number | null {
  const t = b?.aktualizovano as { toMillis?: () => number } | undefined;
  return typeof t?.toMillis === "function" ? t.toMillis() : null;
}

export type VysledekZapisu =
  | { stav: "ulozeno"; novyCas: number | null }
  /** Někdo jiný (druhé zařízení) zapsal dřív — NEPŘEPISUJEME. */
  | { stav: "konflikt"; server: Balicek }
  /** Na serveru je novější formát, než tahle verze aplikace umí. */
  | { stav: "novejsiFormat" };

/**
 * Uloží balíček — ale jen když se od posledního načtení nic nezměnilo.
 *
 * `znamyCas` je čas verze, kterou tenhle prohlížeč naposledy viděl.
 * `null` znamená „ještě jsem nic nenačetl" — a pak se zapisuje jen do
 * prázdna. Tím je konstrukčně vyloučené, že nové zařízení s prázdným
 * úložištěm přepíše data na serveru (vada 1 v oponentuře).
 */
export async function ulozNaServer(
  email: string,
  data: DataBalicku,
  znamyCas: number | null,
): Promise<VysledekZapisu> {
  try {
    const { db, modul } = await firestore();
    const ref = modul.doc(db, "uzivatele", normalizuj(email));

    const vysledek = await modul.runTransaction<VysledekZapisu>(db, async (t) => {
      const snimek = await t.get(ref);
      if (snimek.exists()) {
        const server = snimek.data() as Balicek;
        if (jePrilisNovy(server)) return { stav: "novejsiFormat" };
        const cas = casZmeny(server);
        if (znamyCas === null || (cas !== null && cas !== znamyCas)) {
          return { stav: "konflikt", server };
        }
      }
      t.set(ref, {
        verze: VERZE_BALICKU,
        zarizeni: idZarizeni(),
        aktualizovano: modul.serverTimestamp(),
        data,
      });
      return { stav: "ulozeno", novyCas: null };
    });

    if (vysledek.stav !== "ulozeno") return vysledek;

    // Čas přiděluje server, takže ho zjistíme až zpětným přečtením.
    // Bez něj bychom při dalším zápisu hlásili konflikt sami se sebou.
    const po = await modul.getDoc(ref);
    return { stav: "ulozeno", novyCas: casZmeny(po.data() as Balicek) };
  } catch (e) {
    throw new ChybaDat(srozumitelnaChybaDat(e), (e as { code?: string })?.code);
  }
}

export async function odhlas(): Promise<void> {
  // Příznak zahodit i kdyby odhlášení selhalo — jinak by se aplikace
  // při dalším startu marně pokoušela obnovit neexistující přihlášení.
  zapisPriznak(false);
  const { auth, modul } = await firebase();
  await modul.signOut(auth);
}
