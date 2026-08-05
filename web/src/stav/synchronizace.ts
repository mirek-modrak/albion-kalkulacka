/**
 * Kdy se co ukládá a kdo rozhoduje při střetu.
 *
 * Pořadí je tu to nejdůležitější a je pevně dané:
 *
 * 1. **Nejdřív se čte ze serveru.** Vždycky.
 * 2. Automatické ukládání se zapne **až po úspěšném načtení**.
 *
 * Bez toho by první přihlášení na novém telefonu (kde je prohlížeč prázdný)
 * přepsalo data na serveru prázdnem — viz vada 1 v oponentuře plánu F9b.
 *
 * **Kdy se ptáme uživatele:** jen když do serveru zapsalo jiné zařízení,
 * než jaké naposledy synchronizovalo tenhle prohlížeč. Zjišťuje se to
 * porovnáním času poslední známé verze, ne porovnáváním samotných dat —
 * ta ze serveru chodí v jiném pořadí klíčů a bez prázdných hodnot, takže
 * doslovné porovnání hlásilo rozdíl pokaždé.
 */

import {
  jePrazdny, jePrilisNovy, pouzij, sesbirej, type Balicek, type DataBalicku,
} from "./balicek";
import { ChybaDat, casZmeny, nactiZeServeru, ulozNaServer } from "./sync";

/**
 * Odklad po zjištění změny — aby posuvník negeneroval zápis na každý krok.
 *
 * POZOR: odklad i kontrolu řídí **jeden** časovač. Když to byly dva
 * (interval na kontrolu + timeout na odklad se stejnou periodou), interval
 * odložený zápis pokaždé zrušil a naplánoval znovu — a zápis se nikdy
 * neprovedl. Navenek to vypadalo, že aplikace ukládá, ale na server nešlo nic.
 */
const ODKLAD_MS = 2000;
/** Jak často se kouká, jestli se stav změnil. Musí být kratší než odklad. */
const KONTROLA_MS = 700;
/** Pojistka proti smyčce: nejvýš jeden zápis za tuhle dobu. */
const NEJKRATSI_ROZESTUP_MS = 5000;
/** Pojistka proti smyčce: strop zápisů na jedno otevření stránky. */
const MAX_ZAPISU = 200;

export type Stav =
  | { druh: "nacitam" }
  /** Do serveru zapsalo jiné zařízení — rozhodne uživatel. */
  | { druh: "rozhodni"; server: Balicek; mistni: DataBalicku }
  | { druh: "bezi"; ukladam: boolean }
  | { druh: "jenCteni"; duvod: string }
  | { druh: "chyba"; zprava: string };

export interface Rizeni {
  vezmiServerova(): void;
  vezmiMistni(): void;
  zastav(): void;
}

// ── Záznam o poslední synchronizaci ────────────────────────────
//
// Drží se per e-mail, aby se dva různí uživatelé na jednom počítači
// nepletli dohromady.

interface Zaznam {
  cas: number | null;
  otisk: string;
}

function klicZaznamu(email: string): string {
  return `albion:sync:${email}`;
}

function nactiZaznam(email: string): Zaznam | null {
  try {
    const s = localStorage.getItem(klicZaznamu(email));
    if (!s) return null;
    const z = JSON.parse(s) as Zaznam;
    return typeof z?.otisk === "string" ? z : null;
  } catch {
    return null;
  }
}

function ulozZaznam(email: string, z: Zaznam): void {
  try {
    localStorage.setItem(klicZaznamu(email), JSON.stringify(z));
  } catch {
    // Nevadí — bez záznamu se jen příště zeptáme na rozhodnutí.
  }
}

export function spustSynchronizaci(email: string, oznam: (s: Stav) => void): Rizeni {
  let zastaveno = false;
  let znamyCas: number | null = null;
  let posledniOtisk = "";
  let posledniZapis = 0;
  let pocetZapisu = 0;
  let zmenaOd: number | null = null;
  let hlidac: ReturnType<typeof setInterval> | undefined;
  let bezi = false;

  const otisk = (d: DataBalicku) => JSON.stringify(d);
  const nahlas = (s: Stav) => { if (!zastaveno) oznam(s); };

  async function zapis(duvod: "zmena" | "odchod"): Promise<void> {
    if (zastaveno || !bezi) return;
    if (pocetZapisu >= MAX_ZAPISU) {
      bezi = false;
      nahlas({ druh: "jenCteni", duvod: "Příliš mnoho zápisů — ukládám jen do prohlížeče." });
      return;
    }
    const ted = Date.now();
    if (duvod === "zmena" && ted - posledniZapis < NEJKRATSI_ROZESTUP_MS) return;

    const data = sesbirej();
    const novy = otisk(data);
    if (novy === posledniOtisk) return;

    nahlas({ druh: "bezi", ukladam: true });
    try {
      pocetZapisu++;
      posledniZapis = ted;
      const v = await ulozNaServer(email, data, znamyCas);
      if (v.stav === "ulozeno") {
        znamyCas = v.novyCas;
        posledniOtisk = novy;
        ulozZaznam(email, { cas: znamyCas, otisk: novy });
        nahlas({ druh: "bezi", ukladam: false });
      } else if (v.stav === "konflikt") {
        bezi = false;
        nahlas({ druh: "rozhodni", server: v.server, mistni: data });
      } else {
        bezi = false;
        nahlas({ druh: "jenCteni", duvod: "Na serveru jsou data z novější verze aplikace. Obnov stránku." });
      }
    } catch (e) {
      // Výpadek sítě nesmí nic shodit — v prohlížeči je vše uložené.
      nahlas({ druh: "bezi", ukladam: false });
      if (!(e instanceof ChybaDat)) throw e;
    }
  }

  function priOdchodu() {
    if (document.visibilityState === "hidden") void zapis("odchod");
  }

  function spustHlidani(zakladniOtisk: string) {
    posledniOtisk = zakladniOtisk;
    bezi = true;
    nahlas({ druh: "bezi", ukladam: false });

    hlidac = setInterval(() => {
      if (!bezi) return;
      if (otisk(sesbirej()) === posledniOtisk) { zmenaOd = null; return; }
      // První zjištěná změna nastartuje odklad; zapisuje se, až se stav
      // na chvíli uklidní.
      zmenaOd ??= Date.now();
      if (Date.now() - zmenaOd >= ODKLAD_MS) {
        zmenaOd = null;
        void zapis("zmena");
      }
    }, KONTROLA_MS);

    document.addEventListener("visibilitychange", priOdchodu);
  }

  async function start() {
    nahlas({ druh: "nacitam" });
    try {
      const server = await nactiZeServeru(email);
      if (zastaveno) return;

      if (jePrilisNovy(server)) {
        nahlas({ druh: "jenCteni", duvod: "Na serveru jsou data z novější verze aplikace. Obnov stránku." });
        return;
      }

      znamyCas = casZmeny(server);
      const mistni = sesbirej();
      const zaznam = nactiZaznam(email);

      // Na serveru ještě nic není → nahrajeme, co je tady. Nic se nepřepisuje.
      if (!server) {
        spustHlidani("");
        void zapis("zmena");
        return;
      }

      // Tenhle prohlížeč se s tímhle účtem ještě nikdy nesynchronizoval.
      if (!zaznam) {
        if (jePrazdny(mistni)) {
          // Typicky nové zařízení → prostě vezmi server.
          pouzij(server.data);
          const o = otisk(sesbirej());
          ulozZaznam(email, { cas: znamyCas, otisk: o });
          spustHlidani(o);
          return;
        }
        // Obojí neprázdné a nevíme, co je novější → rozhodne uživatel.
        nahlas({ druh: "rozhodni", server, mistni });
        return;
      }

      // Server se od naší poslední synchronizace nezměnil → případné
      // rozdíly jsou naše vlastní neuložené změny, ty se prostě dopíšou.
      if (zaznam.cas === znamyCas) {
        spustHlidani(zaznam.otisk);
        return;
      }

      // Zapsalo jiné zařízení.
      nahlas({ druh: "rozhodni", server, mistni });
    } catch (e) {
      nahlas({ druh: "chyba", zprava: e instanceof ChybaDat ? e.message : "Synchronizace selhala." });
    }
  }

  void start();

  return {
    vezmiServerova() {
      void (async () => {
        const server = await nactiZeServeru(email).catch(() => null);
        if (!server) return;
        pouzij(server.data);
        ulozZaznam(email, { cas: casZmeny(server), otisk: otisk(sesbirej()) });
        // Aplikace čte úložiště při startu, takže se musí překreslit celá.
        location.reload();
      })();
    },
    vezmiMistni() {
      void (async () => {
        // Načtením zjistíme aktuální čas serveru, abychom směli přepsat.
        const server = await nactiZeServeru(email).catch(() => null);
        znamyCas = casZmeny(server);
        posledniOtisk = "";
        bezi = true;
        await zapis("zmena");
        if (!hlidac) spustHlidani(otisk(sesbirej()));
      })();
    },
    zastav() {
      zastaveno = true;
      bezi = false;
      zmenaOd = null;
      clearInterval(hlidac);
      document.removeEventListener("visibilitychange", priOdchodu);
    },
  };
}
