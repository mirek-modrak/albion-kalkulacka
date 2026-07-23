import { useMemo, useRef, useState } from "react";
import { HRA, MESTA, VERZE_DAT, lokace, polozka } from "./data/hra";
import { SERVERY, nactiCeny, type Server } from "./data/aodp";
import { SUROVINY_ID } from "./data/kategorie";
import { SkladCen } from "./stav/skladCen";
import {
  METRIKY, potrebnaIds, rozlozId, seradit, souhrn, spocitatSken,
  type Metrika, type NastaveniSkenu, type RadekSkenu, type RezimCeny,
} from "./stav/sken";
import { OvladaciPanel } from "./ui/OvladaciPanel";
import { TabulkaSkenu } from "./ui/TabulkaSkenu";
import { DetailPolozky } from "./ui/DetailPolozky";
import { TabulkaPrilezitosti } from "./ui/TabulkaPrilezitosti";
import { spocitatNapricMesty, souhrnPrilezitosti } from "./stav/napricMesty";

/**
 * Lidský název položky.
 *
 * Přednost má herní název z `formatted/items.txt` („Expert's Broadsword"),
 * protože ten uživatel vidí ve hře. Tier se doplní zvlášť — v herním názvu
 * je sice zakódovaný slovem („Expert's"), ale porovnávat T4/T5/T6 v tabulce
 * jde snáz podle čísla.
 *
 * Bez tohohle by tabulka ukazovala syrová ID typu `T4_2H_DUALSWORD`.
 */
function nazevPolozky(zaklad: string, enchant: number): string {
  const p = polozka(zaklad);
  const shoda = /^T(\d)_/.exec(zaklad);
  const tier = shoda ? `T${shoda[1]} ` : "";
  const pripona = enchant > 0 ? `.${enchant}` : "";

  if (p?.nazev) return `${tier}${p.nazev}${pripona}`;

  // Záloha pro položky bez názvu — lepší čitelné ID než prázdno.
  return `${zaklad}${pripona}`;
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
    skupina: SUROVINY_ID,
    kategorie: [],
  });
  const [metrika, setMetrika] = useState<Metrika>("marze");
  const [maxStari, setMaxStari] = useState<number>(48);
  const [jenZiskove, setJenZiskove] = useState(false);
  const [stav, setStav] = useState<StavSkenu>({ druh: "necinny" });

  // Detail se drží jako KLÍČ, ne jako objekt řádku. Kdyby se držel objekt,
  // ukazoval by po úpravě ceny stará čísla — řádky se při přepočtu vytvářejí znovu.
  const [detailKlic, setDetailKlic] = useState<string | null>(null);

  // Dva pohledy na totéž: jedno město podrobně, nebo všechna naráz.
  const [rezim, setRezim] = useState<"mesto" | "prilezitosti">("prilezitosti");

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
  const rezimRef = useRef(rezim);
  rezimRef.current = rezim;

  async function spustitSken() {
    prerusRef.current?.abort();
    const rizeni = new AbortController();
    prerusRef.current = rizeni;

    const poradi = ++poradiRef.current;
    setStav({ druh: "bezi", hotovo: 0, celkem: 1 });

    try {
      const ids = potrebnaIds(nastaveniRef.current.skupina, nastaveniRef.current.kategorie);
      // V režimu příležitostí se tahají všechna města naráz. Nestojí to víc
      // dotazů — AODP násobí odpověď přes `locations`, ne počet dotazů
      // (ověřeno: 205 ID × 7 měst = 1 435 cen v jednom dotazu, 0,33 s).
      const mesta = rezimRef.current === "prilezitosti"
        ? MESTA.map((m) => m.nazev)
        : [nastaveniRef.current.mesto];

      const radky = await nactiCeny(
        serverRef.current, ids, mesta, [1], rizeni.signal,
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

  // Příležitosti napříč městy. Počítá se jen v odpovídajícím režimu —
  // je to 7× víc práce než sken jednoho města.
  const prilezitosti = useMemo(
    () => rezim === "prilezitosti"
      ? spocitatNapricMesty(nastaveni, skladRef.current, HRA.konstanty, nazevPolozky, metrika)
      : [],
    [rezim, nastaveni, verzeCen, metrika],
  );

  const filtrovanePrilezitosti = useMemo(() => {
    let v = prilezitosti;
    if (jenZiskove) v = v.filter((p) => (p.nejlepsi.radek.vysledek?.zisk ?? 0) > 0);
    if (maxStari > 0) {
      v = v.filter((p) => {
        const s = p.nejlepsi.radek.stariHodin;
        return s === null || s <= maxStari;
      });
    }
    return v;
  }, [prilezitosti, jenZiskove, maxStari]);

  const s = souhrn(radky);
  const sP = souhrnPrilezitosti(prilezitosti);

  // Řádek pro detail se dohledává podle klíče v ČERSTVÝCH datech,
  // aby detail po úpravě ceny ukázal nová čísla, ne ta při otevření.
  const detail = detailKlic
    ? radky.find((r) => `${r.polozka.zaklad}#${r.enchant}` === detailKlic) ?? null
    : null;
  const detailPrilezitost = detailKlic
    ? prilezitosti.find((p) => p.klic === detailKlic) ?? null
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

      <div className="mb-4 inline-flex rounded-lg border border-slate-300 p-0.5
                      dark:border-slate-700">
        {([
          ["prilezitosti", "Nejlepší příležitosti", `napříč všemi ${MESTA.length} městy`],
          ["mesto", "Sken jednoho města", "podrobněji"],
        ] as const).map(([id, popis, dovetek]) => (
          <button key={id} onClick={() => { setRezim(id); setDetailKlic(null); }}
                  className={`rounded-md px-3 py-1.5 text-sm ${rezim === id
                    ? "bg-blue-600 font-semibold text-white"
                    : "text-slate-600 dark:text-slate-400"}`}>
            {popis} <span className="opacity-70">· {dovetek}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <OvladaciPanel
          server={server} setServer={setServer}
          nastaveni={nastaveni} setNastaveni={setNastaveni}
          metrika={metrika} setMetrika={setMetrika}
          maxStari={maxStari} setMaxStari={setMaxStari}
          jenZiskove={jenZiskove} setJenZiskove={setJenZiskove}
          stav={stav} spustitSken={spustitSken}
          // Sken vší výbavy trvá ~46 s — bez možnosti zrušit by uživatel
          // musel čekat na něco, co si rozmyslel.
          zrusitSken={() => { prerusRef.current?.abort(); setStav({ druh: "necinny" }); }}
          souhrn={s}
        />
        {rezim === "prilezitosti" ? (
          <div className="space-y-3">
            {sP.podleMest.length > 0 && (
              <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-950">
                <b>{sP.ziskove}</b> ziskových z {sP.celkem} ·{" "}
                úplné srovnání u {sP.uplneSrovnani}
                <div className="mt-1 text-xs text-slate-500">
                  Nejčastěji vyhrává:{" "}
                  {sP.podleMest.slice(0, 3).map((m) => `${m.mesto} (${m.pocet}×)`).join(", ")}
                </div>
              </div>
            )}
            <TabulkaPrilezitosti
              prilezitosti={filtrovanePrilezitosti} metrika={metrika}
              otevritDetail={(p) => setDetailKlic(p.klic)}
            />
          </div>
        ) : (
          <TabulkaSkenu
            radky={filtrovane} metrika={metrika} celkem={s.celkem}
            otevritDetail={(r) => setDetailKlic(`${r.polozka.zaklad}#${r.enchant}`)}
          />
        )}
      </div>

      {/* V režimu příležitostí se detail otevírá pro NEJLEPŠÍ město dané
          položky, ne pro město z nastavení — jinak by rozpad neodpovídal
          řádku, na který uživatel klikl. */}
      {rezim === "prilezitosti" && detailPrilezitost && (
        <DetailPolozky
          radek={detailPrilezitost.nejlepsi.radek}
          zobrazeneMesto={detailPrilezitost.nejlepsi.mesto}
          srovnaniMest={detailPrilezitost.vsechnaMesta.map((v) => ({
            mesto: v.mesto, radek: v.radek,
          }))}
          nastaveni={nastaveni}
          sklad={skladRef.current}
          nazevPolozky={nazevPolozky}
          poZmeneCeny={() => setVerzeCen((v) => v + 1)}
          zavrit={() => setDetailKlic(null)}
        />
      )}

      {rezim === "mesto" && detail && (
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
