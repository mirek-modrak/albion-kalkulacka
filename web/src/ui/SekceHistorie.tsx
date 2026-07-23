import { useEffect, useState } from "react";
import { aodpId, type Enchant, type HerniPolozka } from "@albion/jadro";
import type { Server } from "../data/aodp";
import { odchylkaOdPrumeru, trend, ziskejHistorii, type HistorieMesta } from "../stav/historie";
import { GrafHistorie } from "./GrafHistorie";
import { cislo, procenta } from "./format";

interface Props {
  polozka: HerniPolozka;
  enchant: Enchant;
  mesto: string;
  server: Server;
  /** Aktuální cena z order booku — pro srovnání s 30denním průměrem. */
  aktualniCena: number | null;
}

type Stav =
  | { druh: "nacitam" }
  | { druh: "hotovo"; data: HistorieMesta }
  | { druh: "chyba"; zprava: string };

export function SekceHistorie(p: Props) {
  const [stav, setStav] = useState<Stav>({ druh: "nacitam" });

  useEffect(() => {
    // Zrušit, když uživatel zavře detail dřív, než dotaz doběhne.
    const rizeni = new AbortController();
    setStav({ druh: "nacitam" });

    const id = aodpId({ zaklad: p.polozka.zaklad, enchant: p.enchant }, p.polozka.druh);

    ziskejHistorii(p.server, id, [p.mesto], rizeni.signal)
      .then((vsechna) => {
        const data = vsechna.find((h) => h.mesto === p.mesto);
        if (data) setStav({ druh: "hotovo", data });
        else setStav({ druh: "chyba", zprava: "Pro tohle město nejsou data." });
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setStav({ druh: "chyba", zprava: e instanceof Error ? e.message : String(e) });
      });

    return () => rizeni.abort();
  }, [p.polozka.zaklad, p.enchant, p.mesto, p.server, p.polozka.druh]);

  if (stav.druh === "nacitam") {
    return <p className="py-3 text-sm text-slate-500">Načítám 30denní historii…</p>;
  }
  if (stav.druh === "chyba") {
    return <p className="py-3 text-sm text-slate-500">{stav.zprava}</p>;
  }

  const h = stav.data;
  const odchylka = p.aktualniCena !== null
    ? odchylkaOdPrumeru(p.aktualniCena, h.prumernaCena)
    : null;
  const trend7 = trend(h.dny, 7);
  const trend30 = trend(h.dny, 30);

  return (
    <>
      <GrafHistorie dny={h.dny} popis={`Vývoj ceny a objemu v ${p.mesto} za 30 dní`} />

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <Udaj popis="Průměrná cena"
              hodnota={h.prumernaCena !== null ? cislo(h.prumernaCena) : "—"} />
        {/* Objem je nejcennější údaj — marže bez objemu je past. */}
        <Udaj popis="Denní objem"
              hodnota={h.prumernyObjem !== null ? cislo(h.prumernyObjem) : "—"}
              zvyraznit />
        <Udaj popis="Trend 7 dní" hodnota={trend7 !== null ? seZnamenkemProcenta(trend7) : "—"}
              barva={trend7 !== null ? barvaTrendu(trend7) : undefined} />
        <Udaj popis="Trend 30 dní" hodnota={trend30 !== null ? seZnamenkemProcenta(trend30) : "—"}
              barva={trend30 !== null ? barvaTrendu(trend30) : undefined} />
      </div>

      {odchylka !== null && (
        <p className={`mt-2 text-xs ${Math.abs(odchylka) > 1
          ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}`}>
          Aktuální cena je {odchylka >= 0 ? "o " : "o "}
          {procenta(Math.abs(odchylka), 0)} {odchylka >= 0 ? "nad" : "pod"} 30denním průměrem
          {Math.abs(odchylka) > 1 && " — takový rozdíl bývá chyba v datech, ne příležitost"}
        </p>
      )}

      <p className="mt-2 text-xs text-slate-500">
        {/* Musí být jasné, že tohle nejsou tytéž ceny jako ve výpočtu. */}
        Graf ukazuje <b>průměr uskutečněných obchodů</b>, výpočet výše počítá
        s cenou z order booku. Jsou to jiná čísla.
        {h.dniSData < 30 && ` Data jsou jen za ${h.dniSData} z 30 dní.`}
      </p>
    </>
  );
}

function seZnamenkemProcenta(n: number): string {
  return `${n >= 0 ? "+" : ""}${cislo(n * 100, 1)} %`;
}

function barvaTrendu(n: number): string {
  if (Math.abs(n) < 0.02) return "text-slate-500";
  return n > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

function Udaj({ popis, hodnota, barva, zvyraznit }: {
  popis: string; hodnota: string; barva?: string; zvyraznit?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{popis}</div>
      <div className={`font-semibold ${barva ?? ""} ${zvyraznit ? "text-base" : ""}`}>
        {hodnota}
      </div>
    </div>
  );
}
