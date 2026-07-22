import { useMemo, useRef, useState } from "react";
import { HRA, LINKY, MESTA, VERZE_DAT, lokace } from "./data/hra";
import { SERVERY, nactiCeny, type Server } from "./data/aodp";
import { SkladCen } from "./stav/skladCen";
import {
  METRIKY, potrebnaIds, rozlozId, seradit, souhrn, spocitatSken,
  type Metrika, type NastaveniSkenu, type RadekSkenu, type RezimCeny,
} from "./stav/sken";
import { OvladaciPanel } from "./ui/OvladaciPanel";
import { TabulkaSkenu } from "./ui/TabulkaSkenu";
import { DetailPolozky } from "./ui/DetailPolozky";

/** Lidský název položky. Herní ID typu T5_METALBAR nikomu nic neřekne. */
function nazevPolozky(zaklad: string, enchant: number): string {
  const shoda = /^T(\d)_(.+)$/.exec(zaklad);
  if (!shoda) return zaklad;
  const [, tier, zbytek] = shoda;
  const linka = LINKY.find((l) => l.refined === zbytek || l.raw === zbytek);
  const jmeno = linka
    ? (linka.refined === zbytek ? linka.nazev.split(" → ")[1] : linka.nazev.split(" → ")[0])
    : zbytek!.toLowerCase();
  return `T${tier} ${jmeno}${enchant > 0 ? `.${enchant}` : ""}`;
}

type StavSkenu =
  | { druh: "necinny" }
  | { druh: "bezi"; hotovo: number; celkem: number }
  | { druh: "hotovo"; ulozeno: number; zachovanoRucnich: number; kdy: Date }
  | { druh: "chyba"; zprava: string };

export function App() {
  const [server, setServer] = useState<Server>("west");
  const [nastaveni, setNastaveni] = useState<NastaveniSkenu>({
    mesto: "Thetford",
    focus: false,
    denniBonus: 0,
    premium: true,
    sazbaStanice: 200,
    pocetVyrobku: 100,
    rezimNakupu: "instant",
    rezimProdeje: "order",
  });
  const [metrika, setMetrika] = useState<Metrika>("marze");
  const [maxStari, setMaxStari] = useState<number>(48);
  const [jenZiskove, setJenZiskove] = useState(false);
  const [stav, setStav] = useState<StavSkenu>({ druh: "necinny" });

  // Detail se drží jako KLÍČ, ne jako objekt řádku. Kdyby se držel objekt,
  // ukazoval by po úpravě ceny stará čísla — řádky se při přepočtu vytvářejí znovu.
  const [detailKlic, setDetailKlic] = useState<string | null>(null);

  // Sklad cen přežívá překreslení. Ceny se sbírají napříč skeny —
  // ruční zadání ani starší stažení se nemají ztrácet.
  const skladRef = useRef(new SkladCen());
  const [verzeCen, setVerzeCen] = useState(0);

  // Ochrana proti vadě 1: každý sken má pořadové číslo. Když uživatel
  // přepne město uprostřed, starší odpověď se zahodí a nepřepíše novější.
  const poradiRef = useRef(0);
  const prerusRef = useRef<AbortController | null>(null);

  // Zrcadlo nastavení pro čtení v okamžiku spuštění skenu.
  //
  // Bez tohohle by `spustitSken` četl nastavení z okamžiku VYKRESLENÍ.
  // Kdo přepne město a hned klikne (dřív než React překreslí), stáhl by
  // ceny jiného města, než má vybrané — a tabulka by hlásila „chybí cena“
  // bez zjevného důvodu.
  const nastaveniRef = useRef(nastaveni);
  nastaveniRef.current = nastaveni;
  const serverRef = useRef(server);
  serverRef.current = server;

  async function spustitSken() {
    prerusRef.current?.abort();
    const rizeni = new AbortController();
    prerusRef.current = rizeni;

    const poradi = ++poradiRef.current;
    setStav({ druh: "bezi", hotovo: 0, celkem: 1 });

    try {
      const ids = potrebnaIds();
      const radky = await nactiCeny(
        serverRef.current, ids, [nastaveniRef.current.mesto], [1], rizeni.signal,
        (p) => { if (poradi === poradiRef.current) setStav({ druh: "bezi", ...p }); },
      );

      // Mezitím mohl začít novější sken — tenhle výsledek už neplatí.
      if (poradi !== poradiRef.current) return;

      const { ulozeno, zachovanoRucnich } = skladRef.current.naplnZAodp(radky, rozlozId);
      setVerzeCen((v) => v + 1);
      setStav({ druh: "hotovo", ulozeno, zachovanoRucnich, kdy: new Date() });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (poradi !== poradiRef.current) return;
      setStav({ druh: "chyba", zprava: e instanceof Error ? e.message : String(e) });
    }
  }

  const radky: RadekSkenu[] = useMemo(
    () => spocitatSken(
      nastaveni, skladRef.current, lokace(nastaveni.mesto), HRA.konstanty, nazevPolozky,
    ),
    // verzeCen je záměrně v závislostech — sklad je proměnlivý objekt,
    // React by změnu uvnitř něj sám nezaznamenal.
    [nastaveni, verzeCen],
  );

  const filtrovane = useMemo(() => {
    let v = radky;
    if (jenZiskove) v = v.filter((r) => (r.vysledek?.zisk ?? 0) > 0);
    if (maxStari > 0) v = v.filter((r) => r.stariHodin === null || r.stariHodin <= maxStari);
    return seradit(v, metrika);
  }, [radky, metrika, jenZiskove, maxStari]);

  const s = souhrn(radky);

  // Řádek pro detail se dohledává podle klíče v ČERSTVÝCH datech,
  // aby detail po úpravě ceny ukázal nová čísla, ne ta při otevření.
  const detail = detailKlic
    ? radky.find((r) => `${r.polozka.zaklad}#${r.enchant}` === detailKlic) ?? null
    : null;

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold">Albion — kde se nejvíc vydělá</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sken refiningu. Ceny z Albion Online Data Project, herní data z commitu{" "}
          <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">{VERZE_DAT.commit}</code>.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <OvladaciPanel
          server={server} setServer={setServer}
          nastaveni={nastaveni} setNastaveni={setNastaveni}
          metrika={metrika} setMetrika={setMetrika}
          maxStari={maxStari} setMaxStari={setMaxStari}
          jenZiskove={jenZiskove} setJenZiskove={setJenZiskove}
          stav={stav} spustitSken={spustitSken}
          souhrn={s}
        />
        <TabulkaSkenu
          radky={filtrovane} metrika={metrika} celkem={s.celkem}
          otevritDetail={(r) => setDetailKlic(`${r.polozka.zaklad}#${r.enchant}`)}
        />
      </div>

      {detail && (
        <DetailPolozky
          radek={detail}
          nastaveni={nastaveni}
          sklad={skladRef.current}
          nazevPolozky={nazevPolozky}
          // Přepočítá se CELÝ sken, ne jen detail — jedna cena ovlivní víc řádků
          // (T4 ingot je vstupem pro T5 a zároveň výstupem T4).
          poZmeneCeny={() => setVerzeCen((v) => v + 1)}
          zavrit={() => setDetailKlic(null)}
        />
      )}
    </div>
  );
}

export { METRIKY, SERVERY };
export type { RezimCeny, StavSkenu };
