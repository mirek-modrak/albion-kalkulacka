/**
 * Generátor herních dat z ao-data/ao-bin-dumps.
 *
 * NESPOUŠTÍ SE PŘI BUILDU. Výsledný jadro/data/hra.json je verzovaný v repu,
 * aby šlo sestavit aplikaci offline a výpadek GitHubu neshodil nasazení.
 * Regenerace je vědomý krok:  npm run generuj
 *
 * Ochrany (viz docs/f1-plan.md):
 *  - data se berou z PŘIPNUTÉHO commitu, ne z master (vada 5)
 *  - XML se parsuje skutečným parserem, ne regulárními výrazy (vada 4)
 *  - zapisuje se do dočasného souboru, ověří a teprve pak přejmenuje (vada 3)
 */

import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const ZDE = dirname(fileURLToPath(import.meta.url));
const CIL = join(ZDE, "..", "jadro", "data", "hra.json");

/**
 * Připnutá verze herních dat.
 *
 * `null` = vzít aktuální špičku větve master a její SHA si POZNAMENAT.
 * Konkrétní SHA = stáhnout přesně tu verzi.
 *
 * Proč to tak je: bez připnutí by se čísla změnila pod rukama při patchi
 * a nikdo by nevěděl proč. Zapsané SHA umožní kdykoli zrekonstruovat,
 * z jakých dat výsledek vznikl.
 *
 * Po každé změně spustit testy — zlaté vektory odhalí, co se změnilo.
 */
const PRIPNUTE_SHA = null;

const VETEV = "master";

/** Zjistí SHA, ze kterého se bude stahovat. */
async function zjistiSha() {
  if (PRIPNUTE_SHA) return PRIPNUTE_SHA;
  const odpoved = await fetch(
    `https://api.github.com/repos/ao-data/ao-bin-dumps/commits/${VETEV}`,
    { headers: { Accept: "application/vnd.github.sha" } },
  );
  if (!odpoved.ok) throw new Error(`nelze zjistit SHA: HTTP ${odpoved.status}`);
  return (await odpoved.text()).trim();
}

/** Suroviny, u kterých se return rate NEUPLATNÍ. Viz vada 6 — neověřeno. */
const NEVRATNE = [/ARTEFACT/, /_RUNE$/, /_SOUL$/, /_RELIC$/, /JOURNAL/];

const jeVratna = (id) => !NEVRATNE.some((v) => v.test(id));

/** Rozbalí prvek, který parser podle počtu výskytů vrátí jako objekt nebo pole. */
const jakoPole = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

const cislo = (x, vychozi = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : vychozi;
};

async function stahni(sha, soubor) {
  const odpoved = await fetch(`https://raw.githubusercontent.com/ao-data/ao-bin-dumps/${sha}/${soubor}`);
  if (!odpoved.ok) throw new Error(`${soubor}: HTTP ${odpoved.status}`);
  const text = await odpoved.text();
  console.log(`  ${soubor}: ${(text.length / 1024 / 1024).toFixed(1)} MB`);
  return text;
}

function vytvorParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    // Necháváme hodnoty jako řetězce a převádíme je sami — automatický převod
    // by z "0.1125" nebo z ID typu "T4_1" udělal nečekané věci.
    parseAttributeValue: false,
  });
}

/** Vstupy jedné varianty receptu. */
function prectiVstupy(pozadavky) {
  return jakoPole(pozadavky["craftresource"]).map((r) => {
    const id = r["@uniquename"];
    const enchant = cislo(r["@enchantmentlevel"], 0);
    // Suroviny nesou enchant v ID (_LEVELn) i v atributu. Základ chceme čistý.
    const pripona = `_LEVEL${enchant}`;
    const zaklad = enchant > 0 && id.endsWith(pripona) ? id.slice(0, -pripona.length) : id;
    return { zaklad, enchant, pocet: cislo(r["@count"], 1), vratna: jeVratna(id) };
  });
}

function prectiVarianty(pozadavky, enchant) {
  return jakoPole(pozadavky).map((p) => {
    const vstupy = prectiVstupy(p);
    return {
      enchant,
      vstupy,
      pocetVyrobenych: cislo(p["@amountcrafted"], 1),
      focus: cislo(p["@craftingfocus"], 0),
      cas: cislo(p["@time"], 0),
      // Nenulový u transmutace (T4 ruda → T5 ruda = 781 silver).
      // Bez něj by transmutace vypadala zadarmo.
      silver: cislo(p["@silver"], 0),
      sFactionTokenem: vstupy.some((v) => v.zaklad.includes("FACTION")),
    };
  });
}

/** Vylepšení hotového předmětu runou / duší / relikvií. */
function prectiVylepseni(ench) {
  const pozadavky = ench["upgraderequirements"];
  if (!pozadavky) return null;
  const vstupy = jakoPole(pozadavky["upgraderesource"]).map((r) => ({
    zaklad: r["@uniquename"],
    enchant: 0,
    pocet: cislo(r["@count"], 1),
    vratna: false, // runy/duše/relikvie se nevracejí
  }));
  if (vstupy.length === 0) return null;
  return { naEnchant: cislo(ench["@enchantmentlevel"], 0), vstupy };
}

function zpracujPolozku(prvek, druh) {
  const zaklad = prvek["@uniquename"];
  if (!zaklad) return null;

  // Enchantované SUROVINY jsou samostatné položky — nezpracováváme je zvlášť,
  // patří k základní položce jako varianta (viz identita.ts).
  const enchantVIdu = /_LEVEL(\d)$/.exec(zaklad);

  const varianty = prectiVarianty(
    prvek["craftingrequirements"],
    enchantVIdu ? cislo(enchantVIdu[1]) : cislo(prvek["@enchantmentlevel"], 0),
  );

  // Výbava: enchanty jsou vnořené prvky s vlastními recepturami.
  // POZOR: jsou obalené v <enchantments>, ne přímo pod položkou.
  const vylepseni = [];
  const obal = prvek["enchantments"];
  for (const ench of jakoPole(obal?.["enchantment"] ?? prvek["enchantment"])) {
    const uroven = cislo(ench["@enchantmentlevel"], 0);
    varianty.push(...prectiVarianty(ench["craftingrequirements"], uroven));
    const v = prectiVylepseni(ench);
    if (v) vylepseni.push(v);
  }

  if (varianty.length === 0) return null;

  return {
    zaklad: enchantVIdu ? zaklad.slice(0, enchantVIdu.index) : zaklad,
    enchantZIdu: enchantVIdu ? cislo(enchantVIdu[1]) : 0,
    druh,
    tier: cislo(prvek["@tier"], 0),
    vaha: cislo(prvek["@weight"], 0),
    itemValue: cislo(prvek["@itemvalue"], 0),
    kategorie: prvek["@craftingcategory"] ?? prvek["@shopsubcategory1"] ?? null,
    varianty,
    vylepseni,
  };
}

function zpracujPolozky(items) {
  const koren = items["items"];
  const podleZakladu = new Map();

  const zdroje = [
    ["simpleitem", "surovina"],
    ["weapon", "vybava"],
    ["equipmentitem", "vybava"],
  ];

  for (const [prvek, druh] of zdroje) {
    for (const p of jakoPole(koren[prvek])) {
      const zpracovana = zpracujPolozku(p, druh);
      if (!zpracovana) continue;

      const existujici = podleZakladu.get(zpracovana.zaklad);
      if (existujici) {
        // Enchantovaná surovina — přilep její varianty k základní položce.
        existujici.varianty.push(...zpracovana.varianty);
        existujici.maxEnchant = Math.max(existujici.maxEnchant, zpracovana.enchantZIdu);
        continue;
      }

      podleZakladu.set(zpracovana.zaklad, {
        zaklad: zpracovana.zaklad,
        druh: zpracovana.druh,
        tier: zpracovana.tier,
        vaha: zpracovana.vaha,
        itemValue: zpracovana.itemValue,
        kategorie: zpracovana.kategorie,
        maxEnchant: Math.max(
          zpracovana.enchantZIdu,
          ...zpracovana.varianty.map((v) => v.enchant),
        ),
        varianty: zpracovana.varianty,
        vylepseni: zpracovana.vylepseni,
      });
    }
  }

  // Enchantovaná surovina mohla dorazit dřív než základní → dopočítat maxEnchant.
  for (const p of podleZakladu.values()) {
    p.maxEnchant = Math.max(p.maxEnchant, ...p.varianty.map((v) => v.enchant));
  }

  return [...podleZakladu.values()];
}

/**
 * clusterid → jméno města.
 * V herních datech jsou lokace jen čísly. Jména musí odpovídat tomu,
 * co používá AODP v parametru `locations`, jinak by se ceny nespárovaly.
 */
const MESTA_PODLE_ID = {
  "0000": "Thetford",
  "1000": "Lymhurst",
  "2000": "Bridgewatch",
  "3004": "Martlock",
  "4000": "Fort Sterling",
  "3003": "Caerleon",
  "5000": "Brecilien",
};

/**
 * Herní názvy položek z `formatted/items.txt`.
 *
 * Formát řádku:  `   12: T5_MAIN_SWORD    : Expert's Broadsword`
 *
 * Bereme tenhle soubor (1,1 MB) místo `localization.xml` (70 MB) —
 * obsahuje totéž, co potřebujeme, a je 60× menší.
 *
 * Bez názvů by aplikace ukazovala syrová ID typu `T4_2H_DUALSWORD`,
 * což je pro uživatele nečitelné.
 */
function zpracujNazvy(text) {
  const nazvy = new Map();
  for (const radek of text.split("\n")) {
    // Rozdělit jen na první dvě dvojtečky — název sám může obsahovat další.
    const prvni = radek.indexOf(":");
    if (prvni === -1) continue;
    const druhy = radek.indexOf(":", prvni + 1);
    if (druhy === -1) continue;

    const id = radek.slice(prvni + 1, druhy).trim();
    const nazev = radek.slice(druhy + 1).trim();
    if (id && nazev) nazvy.set(id, nazev);
  }
  return nazvy;
}

function zpracujLokace(cm) {
  const koren = cm["craftingmodifiers"];
  const lokace = [];

  for (const l of jakoPole(koren["craftinglocation"])) {
    const modifikatory = {};
    for (const m of jakoPole(l["craftingmodifier"])) {
      modifikatory[m["@name"]] = cislo(m["@value"], 0);
    }

    const clusterId = l["@clusterid"];
    const mesto = clusterId ? MESTA_PODLE_ID[clusterId] : undefined;

    lokace.push({
      // Města dostanou jméno použitelné vůči AODP, ostatní popisný identifikátor.
      nazev: mesto
        ?? clusterId
        ?? `${l["@continent"] ?? "?"}_${l["@biome"] ?? "?"}_${l["@clusterquality"] ?? "?"}`,
      typ: mesto ? "mesto" : l["@continent"] === "OUTLANDS" ? "hideout" : "jine",
      refiningBonus: cislo(l["refiningbonus"]?.["@value"], 0),
      craftingBonus: cislo(l["craftingbonus"]?.["@value"], 0),
      modifikatory,
    });
  }
  return lokace;
}

/**
 * Projde celý strom a zavolá `test` na každý uzel.
 * Vrátí první nenulový výsledek.
 *
 * Struktura gamedata.xml je hluboká a mezi patchi se přeskupuje.
 * Hledání podle obsahu to přežije, pevná cesta typu a.b.c.d ne.
 */
function najdiVeStromu(uzel, test) {
  if (uzel == null || typeof uzel !== "object") return undefined;

  const vysledek = test(uzel);
  if (vysledek !== undefined) return vysledek;

  for (const hodnota of Object.values(uzel)) {
    if (Array.isArray(hodnota)) {
      for (const polozka of hodnota) {
        const v = najdiVeStromu(polozka, test);
        if (v !== undefined) return v;
      }
    } else if (typeof hodnota === "object") {
      const v = najdiVeStromu(hodnota, test);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

/** Najde <... name="jmeno" value="…"/> kdekoli ve stromu. */
function pojmenovanaHodnota(koren, jmeno) {
  return najdiVeStromu(koren, (u) => (u["@name"] === jmeno ? u["@value"] : undefined));
}

function zpracujKonstanty(gd) {
  const koren = gd["gamedata"];

  // <ActionFocus><CraftingEfficiency bonus="0.59"/></ActionFocus> → 59
  const focusBonus = najdiVeStromu(koren, (u) => {
    const ce = u["CraftingEfficiency"];
    return ce?.["@bonus"] !== undefined ? cislo(ce["@bonus"]) * 100 : undefined;
  });

  return {
    setupFee: cislo(pojmenovanaHodnota(koren, "setupfee"), 0.025),
    danNormalni: cislo(pojmenovanaHodnota(koren, "transactiontax"), 0.08),
    // Premiová sazba v gamedata.xml NENÍ — drží se jako konfigurovatelná.
    danPremium: 0.04,
    minimalniDan: cislo(pojmenovanaHodnota(koren, "minimumtax"), 1),
    blackMarketSetupFee: cislo(pojmenovanaHodnota(koren, "smugglersetupfee"), 0.015),
    bonusFocus: focusBonus ?? 59,
    // V herních datech není, pochází z vývojářského postu (Lands Awakened).
    nutritionKoeficient: 0.1125,
  };
}

/** Ověření, že vygenerovaná data dávají smysl. Chrání před tichým rozbitím. */
function overit(data) {
  const chyby = [];

  const najdi = (zaklad) => data.polozky.find((p) => p.zaklad === zaklad);

  if (data.polozky.length < 1000) chyby.push(`málo položek: ${data.polozky.length}`);
  if (data.lokace.length < 5) chyby.push(`málo lokací: ${data.lokace.length}`);

  const t5bar = najdi("T5_METALBAR");
  if (!t5bar) chyby.push("chybí T5_METALBAR");
  else {
    const zakladni = t5bar.varianty.find((v) => v.enchant === 0 && !v.sFactionTokenem);
    if (!zakladni) chyby.push("T5_METALBAR nemá základní variantu");
    else {
      const ruda = zakladni.vstupy.find((v) => v.zaklad === "T5_ORE");
      if (ruda?.pocet !== 3) chyby.push(`T5_METALBAR má mít 3× T5_ORE, má ${ruda?.pocet}`);
      if (zakladni.focus !== 94) chyby.push(`T5_METALBAR focus má být 94, je ${zakladni.focus}`);
    }
    if (t5bar.itemValue !== 32) chyby.push(`T5_METALBAR itemValue má být 32, je ${t5bar.itemValue}`);
    if (t5bar.maxEnchant !== 4) chyby.push(`T5_METALBAR maxEnchant má být 4, je ${t5bar.maxEnchant}`);
  }

  // Transmutace (surovina na vyšší tier) stojí silver — bez něj by
  // vypadala zadarmo a řetězový výpočet by ji chybně doporučoval.
  const ruda = najdi("T5_ORE");
  if (ruda) {
    const v = ruda.varianty.find((x) => x.enchant === 0);
    if (!v) chyby.push("T5_ORE nemá variantu pro enchant 0");
    else if (v.silver <= 0) chyby.push(`transmutace T5_ORE má stát silver, má ${v.silver}`);
  }

  const kamen = najdi("T5_STONEBLOCK");
  if (kamen && kamen.maxEnchant !== 0) chyby.push(`kámen nemá mít enchant, má ${kamen.maxEnchant}`);

  // Bez názvů by aplikace ukazovala syrová ID — nečitelné.
  const bezNazvu = data.polozky.filter((p) => !p.nazev).length;
  if (bezNazvu > data.polozky.length * 0.1) {
    chyby.push(`${bezNazvu} položek bez názvu (formát items.txt se změnil?)`);
  }

  const mec = najdi("T5_MAIN_SWORD");
  if (!mec) chyby.push("chybí T5_MAIN_SWORD");
  else {
    if (!mec.nazev) chyby.push("T5_MAIN_SWORD nemá název");
    if (mec.druh !== "vybava") chyby.push("T5_MAIN_SWORD má být vybava");
    if (mec.kategorie !== "sword") chyby.push(`T5_MAIN_SWORD kategorie má být sword, je ${mec.kategorie}`);

    const zakladni = mec.varianty.find((v) => v.enchant === 0);
    const bar = zakladni?.vstupy.find((v) => v.zaklad === "T5_METALBAR");
    if (bar?.pocet !== 16) chyby.push(`T5_MAIN_SWORD má mít 16× T5_METALBAR, má ${bar?.pocet}`);

    // Tyhle dvě kontroly chyběly a propustily chybu s obalem <enchantments>.
    for (const e of [1, 2, 3]) {
      if (!mec.varianty.some((v) => v.enchant === e)) {
        chyby.push(`T5_MAIN_SWORD nemá variantu pro enchant ${e} (obal <enchantments>?)`);
      }
    }
    if (mec.vylepseni.length === 0) {
      chyby.push("T5_MAIN_SWORD nemá cesty vylepšení (runa/duše/relikvie)");
    }
  }

  // Bez jmen měst by se ceny z AODP nespárovaly s bonusy lokací.
  for (const mesto of ["Thetford", "Lymhurst", "Bridgewatch", "Martlock", "Fort Sterling", "Caerleon"]) {
    if (!data.lokace.some((l) => l.nazev === mesto)) chyby.push(`chybí lokace ${mesto}`);
  }
  const thetford = data.lokace.find((l) => l.nazev === "Thetford");
  if (thetford) {
    if (Math.abs(thetford.refiningBonus - 0.18) > 1e-9) chyby.push("Thetford refiningBonus != 0.18");
    if (Math.abs((thetford.modifikatory.ore ?? 0) - 0.4) > 1e-9) chyby.push("Thetford ore modifikátor != 0.40");
  }

  if (Math.abs(data.konstanty.setupFee - 0.025) > 1e-9) chyby.push("setupFee != 0.025");
  if (Math.abs(data.konstanty.bonusFocus - 59) > 1e-9) chyby.push("bonusFocus != 59");

  return chyby;
}

async function hlavni() {
  const sha = await zjistiSha();
  console.log(`Generuji herní data z ao-bin-dumps`);
  console.log(`  commit: ${sha}${PRIPNUTE_SHA ? " (připnuto)" : ` (špička ${VETEV})`}`);

  const [items, cm, gd, nazvyText] = await Promise.all([
    stahni(sha, "items.xml"),
    stahni(sha, "craftingmodifiers.xml"),
    stahni(sha, "gamedata.xml"),
    stahni(sha, "formatted/items.txt"),
  ]);

  console.log("  parsuji …");
  const parser = vytvorParser();
  const nazvy = zpracujNazvy(nazvyText);

  const polozky = zpracujPolozky(parser.parse(items));
  for (const p of polozky) p.nazev = nazvy.get(p.zaklad) ?? null;

  const bezNazvu = polozky.filter((p) => !p.nazev).length;
  if (bezNazvu > 0) console.log(`  bez názvu: ${bezNazvu} položek`);

  const data = {
    commit: sha,
    vygenerovano: new Date().toISOString(),
    konstanty: zpracujKonstanty(parser.parse(gd)),
    lokace: zpracujLokace(parser.parse(cm)),
    polozky,
  };

  console.log(`  položek: ${data.polozky.length}, lokací: ${data.lokace.length}`);

  const chyby = overit(data);
  if (chyby.length > 0) {
    console.error("\nOVĚŘENÍ SELHALO — data se NEZAPÍŠÍ:");
    for (const ch of chyby) console.error(`  ✗ ${ch}`);
    process.exit(1);
  }
  console.log("  ověření prošlo");

  // Atomický zápis: dočasný soubor → přejmenování.
  await mkdir(dirname(CIL), { recursive: true });
  const docasny = `${CIL}.tmp`;
  await writeFile(docasny, JSON.stringify(data), "utf8");
  await rename(docasny, CIL);

  const { size } = await import("node:fs").then((fs) => fs.promises.stat(CIL));
  console.log(`\nHotovo: ${CIL} (${(size / 1024).toFixed(0)} kB)`);
}

hlavni().catch((e) => {
  console.error("\nCHYBA:", e.message);
  process.exit(1);
});
