# F12 — Dílna: koupit, vyrobit, nebo enchantovat?

**Zadání (Mirek, 2026-09-15):** *„V dílně bych rád měl v přehledu cenu jak za
výrobu ze surovin, tak z enchantování, s tím že bych cenu run mohl nastavit
stejně jako u surovin. Pak bych viděl, zde je levnější koupit, vyrobit nebo
enchantovat a za kolik."*

**Upřesnění (tamtéž):**
- Zisk a marže se počítají z **nejlevnější** ze tří cest. Koupit hotový kus
  je plnohodnotná cesta.
- Enchant vede **vždy od vyrobeného .0 kusu**: .0 → runy → .1 → duše → .2
  → relikvie → .3. Nikdy „vyrob .1 a dej na .2", nikdy „kup .1/.0".
- Zapnutý focus musí zlevnit i cestu enchantem (vyrábí se .0).

---

## 1. Dnešní stav

| Kde | Co umí | Co chybí |
|---|---|---|
| Tabulka Dílny | výroba ze surovin (`spocitatSken` → `spocitat`) | nákup hotového, enchant |
| Panel „Ceny surovin" | suroviny z receptu položky | runy, duše, relikvie; suroviny .0 kusu |
| Ceny z „30denní medián" | položka + suroviny receptu | runy, .0 kus, suroviny .0 |
| Detail položky (sekce řetězu) | koupit / vyrobit / enchantovat | **necommitnuté**; enchant hledá min na každém stupni (≠ Mirkovo pravidlo) |
| Stahování cen Dílny | už bere runy a nižší stupně | — (necommitnuté, `potrebnaIdsZ`) |

---

## 2. Model — tři cesty, jedna tržba

Všechny částky **na jeden kus**, dávka `pocetVyrobku` jako dnes. Ceny vstupů
se kupují ve **městě výroby** typem ceny podle „Nákup" (jako dnes).
`f = 1 + setupFee`, když se nakupuje přes buy order, jinak `f = 1`.

| Cesta | Náklad / ks | Focus / ks |
|---|---|---|
| **Koupit** | `cena hotového .e × f` | 0 |
| **Vyrobit** | `spocitat(.e).nakladyCelkem / dávka` — beze změny | focus receptu .e |
| **Enchantovat** | `spocitat(.0).nakladyCelkem / dávka + Σ(k=1..e) Σ runy_k × cena × f` | focus receptu **.0** |

- Enchant: **bez return rate** na runy, **bez poplatku stanice**, **bez focusu**
  za samotné přisypání (ověřeno Mirkem 2026-09-06). Poplatek stanice
  a return rate se uplatní jen na výrobu .0 — stejně jako ve hře.
- Cesta enchantem existuje jen pro `e ≥ 1`, když data mají `vylepseni`
  pro **každý** stupeň 1..e a položka má recept na .0.
- **Tržba** (`trzbaCista`) je pro všechny cesty stejná → vytáhne se z
  `spocitat` do samostatné funkce, aby šla spočítat i tehdy, když chybí
  ceny surovin (dnes se bez nich řádek ukončí dřív, než se tržba spočítá).
- **Vítěz** = nejnižší náklad z cest, které mají všechny ceny.
  Při shodě: koupit → vyrobit → enchantovat (stejně jako řetěz v detailu).
- Metriky vítěze: `zisk = (trzbaCista − naklad) × dávka`, `marze = zisk / naklady`,
  `ziskNaFocus = focus > 0 ? zisk / focus : null` (u nákupu tedy „—"),
  `ziskNaKg` beze změny (váha výrobku), „podezřelá marže" z vítěze.

### Kde to žije

- **Jádro** — nový `jadro/src/cesty.ts`: čistá funkce `spocitatCesty(...)`.
  Důvod: herní matematika patří do jádra se zlatými vektory, ne do UI
  (precedent: `retezec.ts`, F11 §4).
- `jadro/src/vypocet.ts` — jen vytažení tržby do `spocitatTrzbu`. `spocitat`
  ji volá, čísla se nesmí změnit (hlídají existující testy).
- **`spocitatSken` se NEMĚNÍ.** Používají ho Příležitosti, Sken i Refining;
  změna tam by jim tiše přepsala čísla.

---

## 3. Změny v kódu

| # | Soubor | Změna |
|---|---|---|
| 0 | (git) | commit rozpracované práce na řetězu — **jen s Mirkovým OK** |
| 1 | `jadro/src/vypocet.ts` | vytáhnout `spocitatTrzbu` (bez změny čísel) |
| 2 | `jadro/src/cesty.ts` + test | tři cesty, vítěz, metriky |
| 3 | `jadro/src/retezec.ts` + test | cesta enchantem v detailu podle pravidla „vždy z vyrobeného .0" |
| 4 | `web/src/stav/dilna.ts` + test | `VysledekDilny.cesty`; „nejlevnější město" vybírá podle zisku vítěze; medián doplní runy, .0 kus a suroviny .0; `surovinyDilny` vrátí i suroviny .0 a zvlášť runy |
| 5 | `web/src/stav/filtrDilny.ts` + test | háček pro zisk, aby „jen ziskové" a řazení četly vítěze (Refining háček nepoužije → beze změny) |
| 6 | `web/src/stav/sloupceDilny.ts` | `naklad` → `koupit`, `vyrobit`, `enchantovat` (řaditelné) |
| 7 | `web/src/ui/TabulkaDilny.tsx` | tři buňky, vítěz zeleně; u zisku štítek cesty; „—" s titulkem proč (nelze / chybí cena X) |
| 8 | `web/src/ui/PanelSurovin.tsx` | druhá skupina „Runy, duše, relikvie" |
| 9 | `web/src/ui/DetailPolozky.tsx` | u detailu z Dílny věta „Tabulka počítá z cesty: enchant" nad rozpadem výroby |

---

## 4. Oponentura — nalezené defekty a jak změnily návrh

1. **Filtr „jen ziskové" čte `radek.vysledek.zisk` natvrdo** (`filtrDilny.ts`).
   Položka zisková jen přes enchant by se schovala. → krok 5, háček.
2. **Řádek bez cen surovin skončí v `spocitatSken` dřív, než spočítá tržbu.**
   Položka, kterou jde jen koupit a doenchantovat, by zůstala „chybí cena".
   → tržba vytažena do jádra (§2), cesty se počítají nezávisle na řádku skenu.
3. **Nejlevnější město vybírá podle zisku výroby.** Vybralo by město, kde
   se nejlíp vyrábí, ne kde je nejlepší výsledek. → krok 4.
4. **30denní medián runy nezná** → enchant by v tom režimu byl vždy „—",
   bez vysvětlení. → krok 4 + titulek „chybí cena".
5. **Nekonzistentní poplatky:** detail (řetěz) nepočítá setup fee nákupu,
   tabulka ano. Kdyby cesta koupit/runy fee neměla a výroba ano, enchant
   by vycházel uměle levně. → v tabulce `f` na všech nákupech (§2).
   Detail zůstává odlišný — viz §5.
6. **Rozpad v detailu ukazuje výrobu, tabulka zisk z enchantu** → uživatel
   uvidí dvě různá čísla bez vysvětlení. → krok 9.
7. **Uložené řazení `naklad` přestane existovat.** → `jePlatneRazeni` už
   neznámé řazení nahradí výchozím; doplnit test.
8. **Nové sloupce se objeví i u stávajícího uložení** (ukládá se seznam
   skrytých). Tabulka zešíří o 2 sloupce. Záměr projektu, přijato.
9. **Focus zapnutý:** zlevní výrobu .e i .0 → obě cesty se přepočítají.
   Kontrolní test: s focusem musí enchant klesnout přesně o úsporu na .0.

Concurrency / atomicita: jen lokální výpočet, žádný nový zápis.
Security: žádné nové vstupy kromě existujícího `PoleCeny`.
Schéma uložených dat (`StavDilny`, sync přes Firestore): **beze změny**.
Operational: stahování má pár ID navíc (≤ 15 run + .0 kusy), dávkování URL
v `aodp.ts` to rozdělí; odhad nejvýš o jeden dotaz víc.

### Co by se mohlo pokazit, i kdyby tohle fungovalo správně?

Vyhraje „koupit" s krásnou marží, ale na trhu je toho kusu jen pár kusů za
tu cenu — Likvidita měří prodejní stranu, ne nákupní. A enchant .4:
data mají vylepšení jen na .1–.3, takže u .4 je enchant vždy „—".

---

## 4b. Ochrana uložených dat — tvrdá pravidla

Mirek (2026-09-15): *„Současná data, především ručně zadaná, mi zůstanou
zachována? To je pro mě extrémně důležité."*

- **Nezvyšovat `VERZE` v `uloziste.ts`** a neměnit tvar `UlozenaCena`,
  `NastaveniSkenu`, `StavDilny` ani `DataBalicku` (sync). Jiná verze formátu
  = uložené ceny se při načtení zahodí.
- Ceny run se ukládají jako běžné ruční ceny (`zdroj: "rucne"`) do téhož
  skladu → stejná ochrana i synchronizace.
- **Regresní test:** snímek úložiště v dnešním formátu (ruční ceny + dílna)
  se po změnách načte beze ztráty.
- Mění se jen předvolba sloupců (`albion:sloupce-dilny:v1`) — zobrazení, ne data.
- Proklikání na localhostu s přihlášením zapisuje do **stejného Firestore**
  jako ostrá verze → před testem záloha a testovat bez úprav ručních cen,
  nebo je po testu vrátit.
- Žádný push / nasazení bez Mirkova pokynu.

---

## 5. Známé mezery (vědomě mimo rozsah)

- **Detail vs. tabulka se můžou lišit v číslech.** Řetěz v detailu zvažuje
  i vlastní refining surovin a nepočítá setup fee. Zapsat do `todo.md`.
- **Cena „koupit hotové" není v tabulce editovatelná** — jde přepsat v detailu.
- **.3 → .4** — ověřit ve hře, jestli povýšení existuje a čím.

---

## 6. Postup a ověření

Krok 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9, po každém `npm test`
a `npm run kontrola`.

**Zlaté vektory (ručně spočítané):** enchant .2 = výroba .0 + runy + duše;
setup fee u orderu; chybí runa → enchant null, ostatní cesty žijí; .0 a .4
bez cesty; shoda nákladů → koupit; focus zlevní .0; koupit → `ziskNaFocus` null.

**UI (povinné):** proklikat přes dev server — přidat T4 sekeru .0/.1/.2,
v panelu ručně zadat ceny run, zkontrolovat sloupce a zvýraznění vítěze,
zapnout focus → čísla se změní, seřadit podle zisku, zapnout „jen ziskové".
Riziko: přihlašovací zeď (F9c) může proklikání zablokovat — pak to napíšu
a pošlu Mirkovi scénář k ručnímu proklikání.
