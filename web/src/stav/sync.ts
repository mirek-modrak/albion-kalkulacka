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

async function nactiAuth() {
  const [{ initializeApp, getApps, getApp }, auth] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  const app = getApps().length ? getApp() : initializeApp(KONFIG);
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

export async function odhlas(): Promise<void> {
  // Příznak zahodit i kdyby odhlášení selhalo — jinak by se aplikace
  // při dalším startu marně pokoušela obnovit neexistující přihlášení.
  zapisPriznak(false);
  const { auth, modul } = await firebase();
  await modul.signOut(auth);
}
