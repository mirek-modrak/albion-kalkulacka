import { MESTA } from "../data/hra";
import { SERVERY, type Server } from "../data/aodp";
import { SKUPINY, SUROVINY_ID, kategorieSPocty, nazevKategorie } from "../data/kategorie";
import { METRIKY, potrebnaIds, type Metrika, type NastaveniSkenu } from "../stav/sken";
import type { StavSkenu } from "../App";

interface Props {
  server: Server;
  setServer: (s: Server) => void;
  nastaveni: NastaveniSkenu;
  setNastaveni: (n: NastaveniSkenu) => void;
  metrika: Metrika;
  setMetrika: (m: Metrika) => void;
  maxStari: number;
  setMaxStari: (h: number) => void;
  jenZiskove: boolean;
  setJenZiskove: (b: boolean) => void;
  stav: StavSkenu;
  spustitSken: () => void;
  zrusitSken: () => void;
  zapomenoutCeny: () => void;
  maUlozeneCeny: boolean;
  souhrn: {
    celkem: number; spocitano: number; ziskove: number;
    podezrele: number; chybiCena: number;
  };
}

const stylPole =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm " +
  "dark:border-slate-700 dark:bg-slate-950";

function Popisek({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-3 text-xs text-slate-500 dark:text-slate-400">{children}</div>;
}

export function OvladaciPanel(p: Props) {
  const uprav = <K extends keyof NastaveniSkenu>(klic: K, hodnota: NastaveniSkenu[K]) =>
    p.setNastaveni({ ...p.nastaveni, [klic]: hodnota });

  return (
    <aside className="space-y-1 rounded-xl border border-slate-200 bg-white p-4
                      dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nastavení</h2>

      <Popisek>Co skenovat</Popisek>
      <select className={stylPole} value={p.nastaveni.skupina}
              onChange={(e) => p.setNastaveni({
                ...p.nastaveni, skupina: e.target.value, kategorie: [],
              })}>
        {SKUPINY.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
      </select>

      <VyberKategorii nastaveni={p.nastaveni} setNastaveni={p.setNastaveni} />

      <Popisek>Server</Popisek>
      <select className={stylPole} value={p.server}
              onChange={(e) => p.setServer(e.target.value as Server)}>
        {SERVERY.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
      </select>

      <Popisek>Město (nákup, refining i prodej)</Popisek>
      <select className={stylPole} value={p.nastaveni.mesto}
              onChange={(e) => uprav("mesto", e.target.value)}>
        {MESTA.map((m) => <option key={m.nazev} value={m.nazev}>{m.nazev}</option>)}
      </select>

      <Popisek>Denní bonus</Popisek>
      <select className={stylPole} value={p.nastaveni.denniBonus}
              onChange={(e) => uprav("denniBonus", Number(e.target.value))}>
        <option value={0}>žádný</option>
        <option value={10}>silver day (+10)</option>
        <option value={20}>gold day (+20)</option>
      </select>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.nastaveni.focus}
               onChange={(e) => uprav("focus", e.target.checked)} />
        Používám focus (+59)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.nastaveni.premium}
               onChange={(e) => uprav("premium", e.target.checked)} />
        Premium (daň 4 % místo 8 %)
      </label>

      <Popisek>Poplatek stanice (silver / 100 nutrition)</Popisek>
      <input type="number" min={0} step={10} className={stylPole}
             value={p.nastaveni.sazbaStanice}
             onChange={(e) => uprav("sazbaStanice", Number(e.target.value))} />

      <Popisek>Počet kusů (pro absolutní čísla)</Popisek>
      <input type="number" min={1} step={10} className={stylPole}
             value={p.nastaveni.pocetVyrobku}
             onChange={(e) => uprav("pocetVyrobku", Math.max(1, Number(e.target.value)))} />

      <Popisek>Nákup surovin</Popisek>
      <select className={stylPole} value={p.nastaveni.rezimNakupu}
              onChange={(e) => uprav("rezimNakupu", e.target.value as "instant" | "order")}>
        <option value="instant">hned ze sell orderů</option>
        <option value="order">přes buy order (+2,5 % fee)</option>
      </select>

      <Popisek>Prodej výsledku</Popisek>
      <select className={stylPole} value={p.nastaveni.rezimProdeje}
              onChange={(e) => uprav("rezimProdeje", e.target.value as "instant" | "order")}>
        <option value="order">přes sell order (+2,5 % fee)</option>
        <option value="instant">hned do buy orderů</option>
      </select>

      {p.stav.druh === "bezi" ? (
        <div className="mt-4 space-y-2">
          <div className="rounded-md bg-blue-600/10 px-3 py-2 text-sm">
            Stahuji ceny… {p.stav.hotovo}/{p.stav.celkem}
            <div className="mt-1 h-1 overflow-hidden rounded bg-slate-300 dark:bg-slate-700">
              <div className="h-full bg-blue-600 transition-all"
                   style={{ width: `${(p.stav.hotovo / Math.max(1, p.stav.celkem)) * 100}%` }} />
            </div>
          </div>
          <button onClick={p.zrusitSken}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm
                             dark:border-slate-700">
            Zrušit
          </button>
        </div>
      ) : (
        <button
          onClick={p.spustitSken}
          className="mt-4 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold
                     text-white hover:bg-blue-700"
        >
          Stáhnout ceny a spočítat
        </button>
      )}

      <StavHlaska stav={p.stav} />

      {p.maUlozeneCeny && (
        <p className="mt-2 text-xs text-slate-500">
          Ceny a nastavení se pamatují v tomhle prohlížeči.{" "}
          {/* Maže jen ceny — nastavení má smysl si nechat. */}
          <button onClick={p.zapomenoutCeny} className="underline">zahodit ceny</button>
        </p>
      )}

      <hr className="my-4 border-slate-200 dark:border-slate-800" />

      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zobrazení</h2>

      <Popisek>Seřadit podle</Popisek>
      <select className={stylPole} value={p.metrika}
              onChange={(e) => p.setMetrika(e.target.value as Metrika)}>
        {METRIKY.map((m) => (
          <option key={m.id} value={m.id}>{m.nazev}{m.popis && ` — ${m.popis}`}</option>
        ))}
      </select>

      <Popisek>Nejvýše stará data</Popisek>
      <select className={stylPole} value={maxStariHodnota(p.maxStari)}
              onChange={(e) => p.setMaxStari(Number(e.target.value))}>
        <option value={6}>6 hodin</option>
        <option value={24}>1 den</option>
        <option value={48}>2 dny</option>
        <option value={168}>týden</option>
        <option value={0}>bez omezení</option>
      </select>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.jenZiskove}
               onChange={(e) => p.setJenZiskove(e.target.checked)} />
        Jen ziskové
      </label>

      <Souhrn souhrn={p.souhrn} />
    </aside>
  );
}

function maxStariHodnota(h: number): number {
  return [6, 24, 48, 168, 0].includes(h) ? h : 48;
}

/**
 * Zúžení na konkrétní kategorie a odhad délky skenu.
 *
 * Odhad je tu proto, že sken vší výbavy trvá ~46 s. Bez varování by
 * uživatel nevěděl, do čeho jde, a považoval by to za zamrznutí.
 */
function VyberKategorii({ nastaveni, setNastaveni }: {
  nastaveni: NastaveniSkenu;
  setNastaveni: (n: NastaveniSkenu) => void;
}) {
  if (nastaveni.skupina === SUROVINY_ID) return <OdhadSkenu nastaveni={nastaveni} />;

  const dostupne = kategorieSPocty(nastaveni.skupina);
  if (dostupne.length <= 1) return <OdhadSkenu nastaveni={nastaveni} />;

  const prepni = (kat: string) => {
    const vybrane = nastaveni.kategorie.includes(kat)
      ? nastaveni.kategorie.filter((k) => k !== kat)
      : [...nastaveni.kategorie, kat];
    setNastaveni({ ...nastaveni, kategorie: vybrane });
  };

  return (
    <>
      <Popisek>
        Zúžit na kategorie {nastaveni.kategorie.length > 0 && (
          <button onClick={() => setNastaveni({ ...nastaveni, kategorie: [] })}
                  className="ml-1 underline">zrušit výběr</button>
        )}
      </Popisek>
      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
        {dostupne.map(({ kategorie, pocet }) => {
          const aktivni = nastaveni.kategorie.includes(kategorie);
          return (
            <button key={kategorie} onClick={() => prepni(kategorie)}
                    className={`rounded border px-1.5 py-0.5 text-xs ${aktivni
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 dark:border-slate-700"}`}>
              {nazevKategorie(kategorie)} <span className="opacity-60">{pocet}</span>
            </button>
          );
        })}
      </div>
      <OdhadSkenu nastaveni={nastaveni} />
    </>
  );
}

function OdhadSkenu({ nastaveni }: { nastaveni: NastaveniSkenu }) {
  const pocet = potrebnaIds(nastaveni.skupina, nastaveni.kategorie).length;
  const davky = Math.max(1, Math.ceil(pocet / 170));
  const vteriny = Math.round(davky * 1.1);

  return (
    <p className="mt-1 text-xs text-slate-500">
      {pocet.toLocaleString("cs-CZ")} položek k ocenění ·{" "}
      <span className={vteriny > 20 ? "text-amber-600 dark:text-amber-400" : ""}>
        {davky} {davky === 1 ? "dotaz" : davky < 5 ? "dotazy" : "dotazů"}, ~{vteriny} s
      </span>
      {nastaveni.skupina !== SUROVINY_ID && (
        <>
          <br />
          {/* Musí to být vidět v UI, ne schované v dokumentaci. */}
          <span className="text-amber-600 dark:text-amber-400">
            Počítá se jen základní kvalita — zisk je proto spíš podhodnocený.
          </span>
        </>
      )}
    </p>
  );
}

function StavHlaska({ stav }: { stav: StavSkenu }) {
  if (stav.druh === "necinny") {
    return (
      <p className="mt-2 text-xs text-slate-500">
        Zatím žádné ceny. Sken je pár dotazů a trvá vteřiny.
      </p>
    );
  }
  if (stav.druh === "chyba") {
    return <p className="mt-2 text-xs text-red-600 dark:text-red-400">{stav.zprava}</p>;
  }
  if (stav.druh === "hotovo") {
    return (
      <>
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          Načteno {stav.ulozeno} cen v {stav.kdy.toLocaleTimeString("cs-CZ")}
        </p>
        {stav.zachovanoRucnich > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {stav.zachovanoRucnich}× ponechána ruční cena — sken je nepřepisuje
          </p>
        )}
      </>
    );
  }
  return null;
}

function Souhrn({ souhrn }: { souhrn: Props["souhrn"] }) {
  if (souhrn.spocitano === 0 && souhrn.chybiCena === souhrn.celkem) return null;
  return (
    <div className="mt-4 space-y-1 rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-950">
      {/* Neúplnost se NESMÍ schovat — jinak by chyběla zrovna ta nejlepší položka. */}
      <div>
        Spočítáno <b>{souhrn.spocitano}</b> z {souhrn.celkem} kombinací
      </div>
      {souhrn.chybiCena > 0 && (
        <div className="text-amber-600 dark:text-amber-400">
          {souhrn.chybiCena}× chybí cena — AODP je crowdsourcované
        </div>
      )}
      <div className="text-emerald-600 dark:text-emerald-400">{souhrn.ziskove}× ziskové</div>
      {souhrn.podezrele > 0 && (
        <div className="text-amber-600 dark:text-amber-400">
          {souhrn.podezrele}× podezřele vysoká marže
        </div>
      )}
    </div>
  );
}
