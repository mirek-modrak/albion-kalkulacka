import { useEffect, useMemo, useRef, useState } from "react";
import { BLACK_MARKET, HRA, MESTA, VERZE_DAT, lokace, polozka } from "./data/hra";
import { SERVERY, nactiCeny, nactiHistoriiDavkove, type Server } from "./data/aodp";
import { SUROVINY_ID } from "./data/kategorie";
import { VYCHOZI_MOUNT, mount } from "./data/mounty";
import {
  nacti, uloz, zapomen,
  nactiUlozenouHistorii, ulozHistorii, zapomenHistorii,
} from "./stav/uloziste";
import { SkladCen } from "./stav/skladCen";
import { SkladHistorie } from "./stav/skladHistorie";
import {
  METRIKY, lzeProdatNaBM, potrebnaIds, potrebnaIdsZ, rozlozId, seradit,
  skenovanaIds, skenovanaIdsZ, souhrn, spocitatSken, typProNakup,
  type Metrika, type NastaveniSkenu, type RadekSkenu, type RezimCeny,
} from "./stav/sken";
import { RefreshDialog } from "./ui/RefreshDialog";
import type { UlozenaCena } from "./stav/uloziste";
import { OvladaciPanel } from "./ui/OvladaciPanel";
import { TabulkaSkenu } from "./ui/TabulkaSkenu";
import { DetailPolozky } from "./ui/DetailPolozky";
import { TabPrilezitosti } from "./ui/TabPrilezitosti";
import { spocitatNapricMesty, souhrnPrilezitosti } from "./stav/napricMesty";
import { nactiFiltrMist, ulozFiltrMist, type FiltrMist } from "./stav/filtrMistPrilezitosti";
import {
  katalogDilny, kombinaceZKlicu, nactiDilnu, ulozDilnu, vyhodnotitDilnu,
  type StavDilny,
} from "./stav/dilna";
import { TabDilna } from "./ui/TabDilna";
import {
  kombinaceZKlicuRefiningu, nactiRefining, poRucniProdejniCene, souhrnRefiningu,
  ulozRefining, vyhodnotitRefining, type StavRefiningu,
} from "./stav/refining";
import { TabRefining } from "./ui/TabRefining";
import { seraditPrevozy, souhrnPrevozu, spocitatPrevozy, type MetrikaPrevozu } from "./stav/prevoz";
import { TabulkaPrevozu } from "./ui/TabulkaPrevozu";
import { PanelPrevozu } from "./ui/PanelPrevozu";
import { Prihlaseni } from "./ui/Prihlaseni";
import type { Uzivatel } from "./stav/sync";
import { nactiPredvolby, ulozPredvolby, type Rezim } from "./stav/predvolby";
import {
  nactiNastaveni, povolenaMesta, ulozNastaveni,
  type NastaveniAplikace, type NastaveniGlobalni, type NastaveniKarty,
} from "./stav/nastaveni";
import { PanelStanic } from "./ui/PanelStanic";

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
  | { druh: "bezi"; hotovo: number; celkem: number; faze: "ceny" | "historie" }
  | {
      druh: "hotovo"; ulozeno: number; zachovanoRucnich: number; kdy: Date;
      /** Historie je doplněk — když selže, sken platí dál. Musí to být ale vidět. */
      historieChyba?: string;
    }
  | { druh: "chyba"; zprava: string };

/** Výchozí nastavení. Uložené hodnoty ho přepíšou, ne nahradí — kdyby
 *  v uložených datech chybělo nové pole, aplikace se o něj neopře naprázdno. */
/**
 * Kolik řádků se nejvýš vykreslí.
 *
 * Naměřeno 2026-07-23: 3 240 řádků stojí 9 408 ms na každý přepočet,
 * 231 řádků 3 864 ms. Vykreslení tedy bere víc než samotný výpočet
 * a nikdo tak dlouhou tabulku stejně neprojde. Stejný strop jako
 * u převozu, jen se u něj navíc ukazuje, kolik se zahodilo.
 */
const STROP_RADKU = 300;

const VYCHOZI_NASTAVENI: NastaveniSkenu = {
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
  mistoProdeje: "mesto",
  // Nenulový výchozí odhad, ať se na riziko nezapomene — stejný precedent
  // jako u převozu. Není v datech, je to odhad podle trasy.
  ztrataZasilek: 0.05,
};

export function App({ uzivatel }: { uzivatel: Uzivatel }) {
  // Předvolby se čtou JEDNOU při startu a všechno ostatní se odvíjí od nich.
  //
  // Dřív tu byl natvrdo `west` a vybraný server se nikde neukládal —
  // kdo hraje na Europe, našel po každém obnovení stránky cizí město,
  // cizí ceny a „chybí cena". Vypadalo to, že se nepamatuje vůbec nic.
  const [predvolby] = useState(() => nactiPredvolby(mount(VYCHOZI_MOUNT)?.kg ?? 4116));

  const [server, setServer] = useState<Server>(predvolby.server);
  // Uložené nastavení výchozí hodnoty PŘEPÍŠE, nenahradí — kdyby v uložených
  // datech chybělo pole přidané v novější verzi, zůstane výchozí.
  const [nastaveni, setNastaveni] = useState<NastaveniSkenu>(
    () => ({ ...VYCHOZI_NASTAVENI, ...nacti(predvolby.server).nastaveni }),
  );
  // Nastavení na třech úrovních (F11). `nastaveni` výš drží jen to, co je
  // vlastností SKENU — město, rozsah, místo prodeje. Premium, dávka, focus
  // a poplatky stanic žijí tady, protože každé patří na jinou úroveň.
  const [nastaveniApp, setNastaveniApp] = useState<NastaveniAplikace>(
    () => nactiNastaveni(predvolby.server),
  );

  const [metrika, setMetrika] = useState<Metrika>(predvolby.metrika);
  const [maxStari, setMaxStari] = useState<number>(predvolby.maxStari);
  const [jenZiskove, setJenZiskove] = useState(predvolby.jenZiskove);
  const [stav, setStav] = useState<StavSkenu>({ druh: "necinny" });

  // Vlastní výběr měst pro Příležitosti — NEZÁVISLÝ na „kam jsem ochoten
  // jezdit" z Dílny a Refiningu. Vlastnost prohlížeče, ne herního účtu,
  // proto vlastní klíč v localStorage, ne v synchronizovaném nastavení.
  const [mistaFiltrPrilezitosti, setMistaFiltrPrilezitosti] = useState<FiltrMist>(nactiFiltrMist);
  useEffect(() => {
    ulozFiltrMist(mistaFiltrPrilezitosti);
  }, [mistaFiltrPrilezitosti]);

  // Detail se drží jako KLÍČ, ne jako objekt řádku. Kdyby se držel objekt,
  // ukazoval by po úpravě ceny stará čísla — řádky se při přepočtu vytvářejí znovu.
  const [detailKlic, setDetailKlic] = useState<string | null>(null);

  // Tři různé otázky, ne tři činnosti:
  //  - příležitosti: co vyrobit a kde
  //  - město: totéž podrobně pro jedno město
  //  - převoz: co koupit tady a prodat jinde (arbitráž, jiný výpočet)
  const [rezim, setRezim] = useState<Rezim>(predvolby.rezim);

  // Dílna: kurátorský seznam položek + jak je vyrábět a kam prodávat.
  // Nezávislé na serveru — „co a jak vyrábím" je volba, ne ekonomika.
  const [dilna, setDilna] = useState<StavDilny>(() => nactiDilnu());
  const dilnaKombinace = useMemo(() => kombinaceZKlicu(dilna.klice), [dilna.klice]);
  const upravDilnu = (s: StavDilny) => { setDilna(s); ulozDilnu(s); };
  // Refining: kurátorský seznam surovin a tří měst (koupit / refinovat /
  // prodat). Nezávislé na serveru, stejně jako dílna — „co refinuju" je
  // volba, ne ekonomika.
  const [refining, setRefining] = useState<StavRefiningu>(() => nactiRefining());
  const refiningKombinace = useMemo(
    () => kombinaceZKlicuRefiningu(refining.klice), [refining.klice],
  );
  const upravRefining = (s: StavRefiningu) => { setRefining(s); ulozRefining(s); };

  // Otevřený dialog „co s ručními cenami" při stažení v dílně. Null = zavřený.
  const [refreshManualy, setRefreshManualy] = useState<UlozenaCena[] | null>(null);

  // Výchozí ztráta zásilek je nenulová, ať se na riziko nezapomene.
  // Není v datech, je to odhad podle trasy.
  const [nastaveniPrevozu, setNastaveniPrevozu] = useState(predvolby.prevoz);
  const [metrikaPrevozu, setMetrikaPrevozu] = useState<MetrikaPrevozu>(predvolby.metrikaPrevozu);

  // Sklad cen přežívá překreslení. Ceny se sbírají napříč skeny —
  // ruční zadání ani starší stažení se nemají ztrácet.
  //
  // Obnovuje se z prohlížeče, aby ruční ceny přežily i obnovení stránky.
  // Bez toho by slib z F3 („ruční cena je vědomý zásah") platil jen proti
  // skenu, ne proti F5.
  const skladRef = useRef<SkladCen>(null as unknown as SkladCen);
  if (skladRef.current === null) {
    skladRef.current = new SkladCen();
    skladRef.current.obnov(nacti(predvolby.server).ceny);
  }
  const [verzeCen, setVerzeCen] = useState(0);

  // Sklad skutečných obchodů. Odděleně od cen, protože odpovídá na jinou
  // otázku: ceny říkají „za kolik se nabízí", tenhle „co se reálně prodalo".
  // Dokud je `konec === null`, nic se nenačetlo a likvidita se nezobrazuje.
  const historieRef = useRef<SkladHistorie>(null as unknown as SkladHistorie);
  if (historieRef.current === null) {
    historieRef.current = new SkladHistorie();
    const u = nactiUlozenouHistorii(predvolby.server);
    historieRef.current.obnov(u.souhrny, u.konecOkna);
  }

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
  /**
   * Nastavení pro AKTIVNÍ kartu — tři úrovně složené do jednoho objektu,
   * který rozumí výpočet.
   *
   * Skládá se právě tady, na jednom místě. Kdyby si to každá karta dělala
   * po svém, rozešlo by se to při první úpravě a uživatel by viděl jinou
   * dávku v tabulce než v nastavení.
   */
  const nastaveniKarty: NastaveniSkenu = useMemo(() => ({
    ...nastaveni,
    ...nastaveniApp.globalni,
    ...nastaveniApp.karty[rezim],
    sazbyStanic: nastaveniApp.sazby,
  }), [nastaveni, nastaveniApp, rezim]);

  const nastaveniRef = useRef(nastaveniKarty);
  nastaveniRef.current = nastaveniKarty;
  const serverRef = useRef(server);
  serverRef.current = server;
  const rezimRef = useRef(rezim);
  rezimRef.current = rezim;
  const dilnaKombinaceRef = useRef(dilnaKombinace);
  dilnaKombinaceRef.current = dilnaKombinace;
  const refiningKombinaceRef = useRef(refiningKombinace);
  refiningKombinaceRef.current = refiningKombinace;

  async function spustitSken(preskocitDialog = false) {
    // V dílně a v refiningu se před stažením zeptáme, co s ručně zadanými
    // cenami — ať uživatel neztratí ceny, které si zapsal z tržnice, ani
    // nemusí ručně obcházet každou, když je chce naopak obnovit.
    // Obě karty stojí na kurátorském seznamu, kde ruční ceny dávají smysl;
    // u skenů se jich zadává málo a dialog by jen otravoval.
    const seSeznamem = rezimRef.current === "dilna" || rezimRef.current === "refining";
    if (seSeznamem && preskocitDialog !== true) {
      const manualy = skladRef.current.export().filter((c) => c.zdroj === "rucne");
      if (manualy.length > 0) { setRefreshManualy(manualy); return; }
    }

    prerusRef.current?.abort();
    const rizeni = new AbortController();
    prerusRef.current = rizeni;

    const poradi = ++poradiRef.current;
    setStav({ druh: "bezi", hotovo: 0, celkem: 1, faze: "ceny" });

    try {
      // Dílna tahá jen vybrané položky, ale ze VŠECH měst + Black Marketu —
      // vyrábět se dá kdekoli (i „nejlevnější") a prodávat lokálně nebo na BM.
      const jeDilna = rezimRef.current === "dilna";
      const jeRefining = rezimRef.current === "refining";
      const ids = jeDilna
        ? potrebnaIdsZ(dilnaKombinaceRef.current)
        : jeRefining
          ? potrebnaIdsZ(refiningKombinaceRef.current)
          : potrebnaIds(nastaveniRef.current.skupina, nastaveniRef.current.kategorie);

      // V režimu příležitostí se tahají všechna města naráz. Nestojí to víc
      // dotazů — AODP násobí odpověď přes `locations`, ne počet dotazů
      // (ověřeno: 205 ID × 7 měst = 1 435 cen v jednom dotazu, 0,33 s).
      // Převoz i příležitosti potřebují všechna města — u převozu proto,
      // že se porovnávají cílová města mezi sebou.
      // Black Market se přidává jen u výbavy — suroviny neobchoduje
      // (ověřeno: T5 Planks i T5 Metal Bar tam mají nulový týdenní objem),
      // takže u refiningu by to byla jen osmina přenosu navíc pro nic.
      const bmVHre = lzeProdatNaBM("Caerleon", nastaveniRef.current.skupina);
      // Refining tahá všech 7 měst, ale Black Market NE: refined suroviny
      // na něm mají nulový objem (ověřeno ve F5), takže by to byla osmina
      // přenosu navíc pro ceny, se kterými se stejně nesmí počítat.
      const mesta = jeRefining
        ? MESTA.map((m) => m.nazev)
        : jeDilna
          ? [...MESTA.map((m) => m.nazev), BLACK_MARKET]
          : [
              ...(rezimRef.current === "mesto"
                ? [nastaveniRef.current.mesto]
                : MESTA.map((m) => m.nazev)),
              ...(bmVHre ? [BLACK_MARKET] : []),
            ];

      const radky = await nactiCeny(
        serverRef.current, ids, mesta, [1], rizeni.signal,
        (p) => {
          if (poradi === poradiRef.current) setStav({ druh: "bezi", ...p, faze: "ceny" });
        },
      );

      // Mezitím mohl začít novější sken — tenhle výsledek už neplatí.
      if (poradi !== poradiRef.current) return;

      const { ulozeno, zachovanoRucnich } = skladRef.current.naplnZAodp(radky, rozlozId);
      setVerzeCen((v) => v + 1);

      // ── Historie skutečných obchodů ────────────────────────────────
      //
      // Až PO cenách a ve vlastním try. Historie je doplněk: když selže,
      // sken zůstává platný a jen se nezobrazí likvidita. Kdyby byla ve
      // společném try, výpadek doplňku by shodil hlavní výsledek.
      //
      // Tahá se jen pro skenované položky, ne pro jejich vstupy —
      // likvidita je vlastnost toho, co prodáváš.
      let historieChyba: string | undefined;
      try {
        // Dílna: historii tahá i pro VSTUPY (ne jen výstupy), aby 30denní
        // medián mohl sloužit jako zdroj ceny surovin, ne jen výrobku.
        const idsHistorie = jeDilna
          ? potrebnaIdsZ(dilnaKombinaceRef.current)
          : jeRefining
            ? potrebnaIdsZ(refiningKombinaceRef.current)
            : skenovanaIds(nastaveniRef.current.skupina, nastaveniRef.current.kategorie);
        setStav({ druh: "bezi", hotovo: 0, celkem: 1, faze: "historie" });

        const serie = await nactiHistoriiDavkove(
          serverRef.current, idsHistorie, mesta, rizeni.signal,
          (p) => {
            if (poradi === poradiRef.current) setStav({ druh: "bezi", ...p, faze: "historie" });
          },
        );
        if (poradi !== poradiRef.current) return;

        historieRef.current.naplnZAodp(serie, rozlozId);
        ulozHistorii(
          serverRef.current, historieRef.current.export(), historieRef.current.konec,
        );
        setVerzeCen((v) => v + 1);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (poradi !== poradiRef.current) return;
        historieChyba = e instanceof Error ? e.message : String(e);
      }

      setStav({ druh: "hotovo", ulozeno, zachovanoRucnich, kdy: new Date(), historieChyba });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (poradi !== poradiRef.current) return;
      setStav({ druh: "chyba", zprava: e instanceof Error ? e.message : String(e) });
    }
  }

  const radky: RadekSkenu[] = useMemo(
    () => spocitatSken(
      nastaveniKarty, skladRef.current, lokace(nastaveni.mesto), HRA.konstanty, nazevPolozky,
      historieRef.current,
    ),
    // verzeCen je záměrně v závislostech — sklad je proměnlivý objekt,
    // React by změnu uvnitř něj sám nezaznamenal.
    [nastaveniKarty, verzeCen],
  );

  const filtrovane = useMemo(() => {
    let v = radky;
    if (jenZiskove) v = v.filter((r) => (r.vysledek?.zisk ?? 0) > 0);
    if (maxStari > 0) v = v.filter((r) => r.stariHodin === null || r.stariHodin <= maxStari);
    return seradit(v, metrika);
  }, [radky, metrika, jenZiskove, maxStari]);

  // Katalog položek pro vyhledávač dílny — z herních dat, počítá se jednou.
  const katalog = useMemo(() => katalogDilny(), []);

  // Výsledky dílny: každá položka pod svou efektivní konfigurací (globální
  // nebo override), u „nejlevnější" napříč městy. Pořadí drží podle seznamu.
  const dilnaVysledky = useMemo(
    () => rezim !== "dilna" ? [] : vyhodnotitDilnu(
      dilna, skladRef.current, historieRef.current, HRA.konstanty, nastaveniKarty, nazevPolozky,
    ),
    // dilnaKombinace v závislostech drží přepočet při změně seznamu i konfigurace.
    [rezim, nastaveniKarty, verzeCen, dilna, dilnaKombinace],
  );

  // Města, ze kterých smí automatický výběr vybírat. Caerleon a Brecilien
  // se dají vyloučit — karta počítá se silverem, ne s tím, jestli se tam
  // náklad dostane.
  const mestaProAuto = useMemo(
    () => povolenaMesta(nastaveniApp.globalni, MESTA.map((m) => m.nazev)),
    [nastaveniApp.globalni],
  );

  // Refining: každá surovina pod svou trojicí měst. Naměřeno 2026-08-10:
  // nejhorší případ (115 surovin × 7 měst refiningu × 7 měst nákupu)
  // stojí 23 ms, takže strop na počet řádků není potřeba.
  const refiningVysledky = useMemo(
    () => rezim !== "refining" ? [] : vyhodnotitRefining(
      refining, skladRef.current, historieRef.current, HRA.konstanty, nastaveniKarty,
      nazevPolozky, nastaveniPrevozu.nosnostKg, maxStari, mestaProAuto,
    ),
    // maxStari je v závislostech schválně: řídí, které ceny smí auto-výběr
    // použít, takže jeho změna musí přepočítat, ne jen přefiltrovat.
    [rezim, nastaveniKarty, verzeCen, refining, refiningKombinace, mestaProAuto,
      nastaveniPrevozu.nosnostKg, maxStari],
  );

  // Která města smí Příležitosti vůbec zvažovat jako kandidáta na
  // „nejlepší místo" — vlastní filtr karty, viz `mistaFiltrPrilezitosti`.
  const povolenaMestaPrilezitosti = useMemo(
    () => MESTA.map((m) => m.nazev)
      .filter((m) => !mistaFiltrPrilezitosti.vylouceneMesta.includes(m)),
    [mistaFiltrPrilezitosti.vylouceneMesta],
  );

  // Příležitosti napříč městy. Počítá se jen v odpovídajícím režimu —
  // je to 7× víc práce než sken jednoho města.
  const prilezitosti = useMemo(
    () => rezim === "prilezitosti"
      ? spocitatNapricMesty(
          nastaveniKarty, skladRef.current, HRA.konstanty, nazevPolozky, metrika,
          historieRef.current, povolenaMestaPrilezitosti, mistaFiltrPrilezitosti.zahrnoutBM,
        )
      : [],
    [rezim, nastaveniKarty, verzeCen, metrika, povolenaMestaPrilezitosti,
      mistaFiltrPrilezitosti.zahrnoutBM],
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
    // Stejný strop jako u převozu. Sken vší výbavy dá 3 240 řádků, které
    // nikdo neprojde — a vykreslit je stálo naměřených 5,5 s z každého
    // přepočtu. Řazení proběhlo dřív, takže se ořezává jen ocas.
    //
    // Kolik se zahodilo, MUSÍ být vidět; tiché ořezání by vypadalo,
    // jako že víc příležitostí není.
    return { radky: v.slice(0, STROP_RADKU), celkem: v.length };
  }, [prilezitosti, jenZiskove, maxStari]);

  // Převozní trasy. Počítá se jen v odpovídajícím režimu.
  const prevozy = useMemo(
    () => rezim !== "prevoz" ? [] : seraditPrevozy(
      spocitatPrevozy(
        { ...nastaveni, ...nastaveniPrevozu },
        skladRef.current, HRA.konstanty, nazevPolozky,
      ),
      metrikaPrevozu,
    ),
    [rezim, nastaveni, nastaveniPrevozu, verzeCen, metrikaPrevozu],
  );

  const filtrovanePrevozy = useMemo(() => {
    let v = prevozy;
    if (jenZiskove) v = v.filter((r) => (r.vysledek?.zisk ?? 0) > 0);
    if (maxStari > 0) v = v.filter((r) => r.stariHodin === null || r.stariHodin <= maxStari);
    return v.slice(0, 300);   // 690 řádků nikdo neprojde
  }, [prevozy, jenZiskove, maxStari]);

  // Uložit po každé změně cen nebo nastavení. Samotný zápis je odložený,
  // aby se neukládalo při každém úhozu do políčka.
  useEffect(() => {
    uloz(server, nastaveni, skladRef.current.export());
  }, [server, nastaveni, verzeCen]);

  // Tři úrovně nastavení mají vlastní klíč, ale drží se stejně jako ceny
  // zvlášť pro každý server — kdo hraje na dvou, má tam jiné stanice.
  useEffect(() => {
    ulozNastaveni(server, nastaveniApp);
  }, [server, nastaveniApp]);

  // Předvolby zobrazení. Odděleně od nastavení skenu — to je vázané na
  // herní server a synchronizuje se, tohle je vlastnost zařízení.
  useEffect(() => {
    ulozPredvolby({
      server, metrika, maxStari, jenZiskove, rezim,
      prevoz: nastaveniPrevozu, metrikaPrevozu,
    });
  }, [server, metrika, maxStari, jenZiskove, rezim, nastaveniPrevozu, metrikaPrevozu]);

  // Přepnutí serveru = jiná ekonomika. Ceny z `west` nesmí platit pro `europe`,
  // proto se sklad vymění za ten uložený pro nový server.
  const predchoziServer = useRef(server);
  useEffect(() => {
    if (predchoziServer.current === server) return;
    predchoziServer.current = server;
    prerusRef.current?.abort();

    const novy = new SkladCen();
    const ulozeno = nacti(server);
    novy.obnov(ulozeno.ceny);
    skladRef.current = novy;

    // Historie je stejně vázaná na server jako ceny — obchody z `west`
    // nevypovídají o ničem na `europe`. Musí se vyměnit spolu s cenami,
    // jinak by likvidita patřila k jiné ekonomice než čísla vedle ní.
    const novaHistorie = new SkladHistorie();
    const ulozenaHistorie = nactiUlozenouHistorii(server);
    novaHistorie.obnov(ulozenaHistorie.souhrny, ulozenaHistorie.konecOkna);
    historieRef.current = novaHistorie;

    if (ulozeno.nastaveni) setNastaveni((n) => ({ ...n, ...ulozeno.nastaveni }));
    // Poplatky stanic i dávky patří k serveru stejně jako ceny — sazba
    // z `west` nevypovídá o stanicích na `europe`.
    setNastaveniApp(nactiNastaveni(server));
    setVerzeCen((v) => v + 1);
    setStav({ druh: "necinny" });
  }, [server]);

  const s = souhrn(radky);
  const sP = souhrnPrilezitosti(prilezitosti);
  const sR = souhrnRefiningu(refiningVysledky);

  /**
   * Položky, podle kterých se vybere, které stanice v panelu nabídnout.
   *
   * U Dílny a Refiningu je to jejich seznam — nemá smysl nabízet Tavírnu
   * někomu, kdo vyrábí jen hole. U skenů je rozsah daný výběrem kategorií,
   * takže se vezme prvních pár spočítaných řádků.
   */
  const polozkyProStanice = useMemo(() => {
    if (rezim === "dilna") return dilnaKombinace.map((k) => k.polozka);
    if (rezim === "refining") return refiningKombinace.map((k) => k.polozka);
    return radky.slice(0, 200).map((r) => r.polozka);
  }, [rezim, dilnaKombinace, refiningKombinace, radky]);

  /**
   * Na kolik jízd mountu se dávka veze.
   *
   * Undefined znamená „neveze se nikam" — buď se neprodává na Black Market
   * s převozem, nebo se vyrábí rovnou v Caerleonu, kde BM je.
   */
  function jizdProMisto(v: { mesto: string; naBlackMarketu: boolean; radek: RadekSkenu }) {
    if (nastaveni.mistoProdeje !== "bm-s-prevozem") return undefined;
    if (!v.naBlackMarketu || v.mesto === "Caerleon") return undefined;
    const kg = v.radek.vysledek?.vahaVystupu;
    const nosnost = mount(VYCHOZI_MOUNT)?.kg;
    if (!kg || !nosnost) return undefined;
    return Math.ceil(kg / nosnost);
  }

  // Řádek pro detail se dohledává podle klíče v ČERSTVÝCH datech,
  // aby detail po úpravě ceny ukázal nová čísla, ne ta při otevření.
  const detail = detailKlic
    ? radky.find((r) => `${r.polozka.zaklad}#${r.enchant}` === detailKlic) ?? null
    : null;
  const detailPrilezitost = detailKlic
    ? prilezitosti.find((p) => p.klic === detailKlic) ?? null
    : null;
  const detailDilna = detailKlic
    ? dilnaVysledky.find((v) => v.klic === detailKlic) ?? null
    : null;
  const detailRefining = detailKlic
    ? refiningVysledky.find((v) => v.klic === detailKlic) ?? null
    : null;

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Albion — kde se nejvíc vydělá</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Sken refiningu. Ceny z Albion Online Data Project, herní data z commitu{" "}
            <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">{VERZE_DAT.commit}</code>.
          </p>
        </div>
        <Prihlaseni uzivatel={uzivatel} />
      </header>

      <div className="mb-4 inline-flex rounded-lg border border-slate-300 p-0.5
                      dark:border-slate-700">
        {([
          ["prilezitosti", "Nejlepší příležitosti", "co vyrobit a kde"],
          ["mesto", "Sken jednoho města", "podrobněji"],
          ["prevoz", "Převoz", "co koupit tady a prodat jinde"],
          ["dilna", "Dílna", "moje výroba"],
          ["refining", "Refining", "kde koupit, kde refinovat, kde prodat"],
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
          rezim={rezim}
          stav={stav} spustitSken={spustitSken}
          // Sken vší výbavy trvá ~46 s — bez možnosti zrušit by uživatel
          // musel čekat na něco, co si rozmyslel.
          zrusitSken={() => { prerusRef.current?.abort(); setStav({ druh: "necinny" }); }}
          zapomenoutCeny={() => {
            zapomen(server);
            skladRef.current = new SkladCen();
            // Historie jde pryč taky. Likvidita bez cen sice dává smysl,
            // ale „zahodit ceny" je pro uživatele reset — nechat po něm
            // půlku dat by bylo překvapení, ne pohodlí.
            zapomenHistorii(server);
            historieRef.current = new SkladHistorie();
            setVerzeCen((v) => v + 1);
            setStav({ druh: "necinny" });
          }}
          globalni={nastaveniApp.globalni}
          setGlobalni={(globalni) => setNastaveniApp((n) => ({ ...n, globalni }))}
          karta={nastaveniApp.karty[rezim]}
          setKarta={(k) => setNastaveniApp((n) => ({
            ...n, karty: { ...n.karty, [rezim]: k },
          }))}
          maUlozeneCeny={skladRef.current.pocet > 0}
          souhrn={s}
          // Poplatky stanic pod panelem, ne v něm: patří na vlastní úroveň
          // a nabízejí se jen ty, které daná karta opravdu používá.
          stanice={rezim === "prevoz" ? null : (
            <PanelStanic
              sazby={nastaveniApp.sazby}
              setSazby={(sazby) => setNastaveniApp((n) => ({ ...n, sazby }))}
              polozky={polozkyProStanice}
              jenRefining={rezim === "refining" ? true : undefined}
            />
          )}
        />
        {rezim === "prevoz" ? (
          <div className="space-y-3">
            <PanelPrevozu
              nastaveni={nastaveniPrevozu} setNastaveni={setNastaveniPrevozu}
              metrika={metrikaPrevozu} setMetrika={setMetrikaPrevozu}
              souhrn={souhrnPrevozu(prevozy)}
            />
            <TabulkaPrevozu radky={filtrovanePrevozy} metrika={metrikaPrevozu}
                            vychoziMesto={nastaveniPrevozu.vychoziMesto}
                            ztrataZasilek={nastaveniPrevozu.ztrataZasilek} />
          </div>
        ) : rezim === "refining" ? (
          <div className="space-y-3">
            {sR.spocitano > 0 && (
              <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-950">
                <b>{sR.ziskove}</b> ziskových z {sR.spocitano} spočítaných
                {sR.chybiCena > 0 && ` · ${sR.chybiCena} bez ceny`}
                {sR.podleMest.length > 0 && (
                  <div className="mt-1 text-xs text-slate-500">
                    Refinuje se nejčastěji v:{" "}
                    {sR.podleMest.slice(0, 3).map((m) => `${m.mesto} (${m.pocet}×)`).join(", ")}
                    {/* Kolik voleb stojí na rozdílu v šumu — ať je vidět,
                        že „nejlepší město" nemusí být jednoznačné. */}
                    {sR.tesne > 0 && ` · u ${sR.tesne} je druhé město prakticky stejné`}
                  </div>
                )}
              </div>
            )}
            <TabRefining
              vysledky={refiningVysledky} stav={refining}
              sklad={skladRef.current} davka={nastaveniKarty.pocetVyrobku}
              typNakup={typProNakup(nastaveniKarty.rezimNakupu)}
              rezimProdeje={nastaveniKarty.rezimProdeje}
              nazevPolozky={nazevPolozky}
              uprav={upravRefining}
              zafixujProdej={(klic, mesto) =>
                upravRefining(poRucniProdejniCene(refining, klic, mesto))}
              poZmeneCeny={() => setVerzeCen((v) => v + 1)}
              otevritDetail={(klic) => setDetailKlic(klic)}
            />
          </div>
        ) : rezim === "dilna" ? (
          <TabDilna
            vysledky={dilnaVysledky} stav={dilna} katalog={katalog}
            sklad={skladRef.current} davka={nastaveniKarty.pocetVyrobku}
            typNakup={typProNakup(nastaveniKarty.rezimNakupu)}
            rezimProdeje={nastaveniKarty.rezimProdeje}
            nazevPolozky={nazevPolozky}
            uprav={upravDilnu}
            poZmeneCeny={() => setVerzeCen((v) => v + 1)}
            otevritDetail={(klic) => setDetailKlic(klic)}
          />
        ) : rezim === "prilezitosti" ? (
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
            <TabPrilezitosti
              prilezitosti={filtrovanePrilezitosti.radky}
              celkemPredOrezem={filtrovanePrilezitosti.celkem}
              metrika={metrika}
              davka={nastaveniKarty.pocetVyrobku}
              mistaFiltr={mistaFiltrPrilezitosti}
              setMistaFiltr={setMistaFiltrPrilezitosti}
              otevritDetail={(p) => setDetailKlic(p.klic)}
            />
          </div>
        ) : (
          <TabulkaSkenu
            radky={filtrovane} metrika={metrika} celkem={s.celkem}
            davka={nastaveniKarty.pocetVyrobku}
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
          zobrazeneMisto={detailPrilezitost.nejlepsi.nazevMista}
          // Black Market jen vykupuje — nakupovat se na něm nedá, proto
          // se předává zvlášť jako místo prodeje, ne jako město.
          mistoProdeje={detailPrilezitost.nejlepsi.naBlackMarketu ? BLACK_MARKET : undefined}
          // Jízdy dávají smysl jen když se opravdu veze — tedy v režimu
          // s převozem a ne u Caerleonu, odkud se nikam nejede.
          jizd={jizdProMisto(detailPrilezitost.nejlepsi)}
          srovnaniMest={detailPrilezitost.vsechnaMesta.map((v) => ({
            mesto: v.mesto, nazevMista: v.nazevMista, radek: v.radek,
          }))}
          server={server}
          lokace={lokace(detailPrilezitost?.nejlepsi.mesto ?? nastaveni.mesto)}
          nastaveni={nastaveniKarty}
          sklad={skladRef.current}
          nazevPolozky={nazevPolozky}
          verzeCen={verzeCen}
          poZmeneCeny={() => setVerzeCen((v) => v + 1)}
          zavrit={() => setDetailKlic(null)}
        />
      )}

      {rezim === "mesto" && detail && (
        <DetailPolozky
          radek={detail}
          server={server}
          mistoProdeje={
            nastaveni.mistoProdeje !== "mesto"
            && lzeProdatNaBM(nastaveni.mesto, nastaveni.skupina)
              ? BLACK_MARKET : undefined
          }
          lokace={lokace(nastaveni.mesto)}
          nastaveni={nastaveniKarty}
          sklad={skladRef.current}
          nazevPolozky={nazevPolozky}
          verzeCen={verzeCen}
          // Přepočítá se CELÝ sken, ne jen detail — jedna cena ovlivní víc řádků
          // (T4 ingot je vstupem pro T5 a zároveň výstupem T4).
          poZmeneCeny={() => setVerzeCen((v) => v + 1)}
          zavrit={() => setDetailKlic(null)}
        />
      )}

      {refreshManualy && (
        <RefreshDialog
          manualy={refreshManualy}
          nazevPolozky={nazevPolozky}
          zrusit={() => setRefreshManualy(null)}
          potvrdit={(kAktualizaci) => {
            // Vybrané ruční ceny zrušit → AODP je při skenu naplní znovu.
            for (const c of kAktualizaci) {
              skladRef.current.zrusRucne(c.mesto, c.zaklad, c.enchant, c.typ);
            }
            setRefreshManualy(null);
            setVerzeCen((v) => v + 1);
            spustitSken(true);
          }}
        />
      )}

      {/* Detail refiningu — rozpad pro TU trojici měst, kterou řádek použil.
          Kdyby se předalo nastavení z ovládacího panelu, ukazoval by detail
          jiná čísla než řádek, na který uživatel klikl. */}
      {rezim === "refining" && detailRefining?.radek && (
        <DetailPolozky
          radek={detailRefining.radek}
          zobrazeneMesto={detailRefining.refining}
          server={server}
          lokace={lokace(detailRefining.refining)}
          nastaveni={{
            ...nastaveniKarty,
            mesto: detailRefining.refining,
            nakupniMesto: detailRefining.nakup,
            prodejniMesto: detailRefining.prodej,
            skupina: SUROVINY_ID,
            mistoProdeje: "mesto",
          }}
          sklad={skladRef.current}
          nazevPolozky={nazevPolozky}
          verzeCen={verzeCen}
          poZmeneCeny={() => setVerzeCen((v) => v + 1)}
          zavrit={() => setDetailKlic(null)}
        />
      )}

      {/* Detail dílny — město výroby a prodej podle efektivní konfigurace. */}
      {rezim === "dilna" && detailDilna && detailDilna.radek && (
        <DetailPolozky
          radek={detailDilna.radek}
          cestyDilny={detailDilna.cesty}
          zobrazeneMesto={detailDilna.mesto}
          mistoProdeje={detailDilna.mistoProdeje !== "mesto" ? BLACK_MARKET : undefined}
          server={server}
          lokace={lokace(detailDilna.mesto)}
          nastaveni={{
            ...nastaveniKarty, mesto: detailDilna.mesto, skupina: "zbrane",
            mistoProdeje: detailDilna.mistoProdeje,
          }}
          sklad={skladRef.current}
          nazevPolozky={nazevPolozky}
          verzeCen={verzeCen}
          poZmeneCeny={() => setVerzeCen((v) => v + 1)}
          zavrit={() => setDetailKlic(null)}
        />
      )}
    </div>
  );
}

export { METRIKY, SERVERY };
export type { RezimCeny, StavSkenu };
