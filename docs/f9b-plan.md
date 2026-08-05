# F9b — plán a oponentura: účty a synchronizace dat

Datum: 2026-08-05
Cíl: **jeden účet, svá data na kterémkoli zařízení** — pro Mirka
a nejvýš 4 další lidi.

**Stav: 🟡 NÁVRH — čeká na Mirkovo schválení.** V kódu zatím nic změněno.

---

## Zadání

| Požadavek | Zdroj |
|---|---|
| Přihlášený uživatel vidí svá data na jakémkoli zařízení | Mirek, 2026-08-05 |
| Nejvýš 5 uživatelů, spíš méně | Mirek, 2026-08-05 |
| Zdarma | Mirek, 2026-08-05 |
| Později přenositelné na Wedos VPS | Mirek, 2026-08-05 |
| Firebase jako platforma | Mirek, 2026-08-05 |
| Přihlášení přes Google (bez hesel) | doporučeno, čeká na potvrzení |

---

## Co to mění na dosavadních rozhodnutích

Obojí je vědomá změna, ne přehlédnutí. Zapíše se do
[architektura-rozhodnuti.md](architektura-rozhodnuti.md).

### R7 — „žádné účty" → **přehodnoceno podle vlastní podmínky**

R7 si stanovilo spouštěč: *„Přehodnotit, až by kalkulačka měla mít víc
uživatelů než Mirka a potřebovala je rozlišovat."* Ten nastal.

Co z R7 **platí dál**: kalkulačka zůstává **samostatný nástroj**. Žádné
napojení na Samvio SSO, žádné sdílení uživatelů s ekosystémem. Přidáváme
vlastní přihlášení, ne členství v marketplace.

### R6 — „až databáze bude, PostgreSQL" → **odchylka: Firestore**

R6 předpokládalo PostgreSQL podle precedentu ekosystému a jako spouštěč
uvádělo upozornění (F10). Spouštěč je jiný (sdílení nástroje) a volba
databáze taky. Důvod odchylky:

- PostgreSQL vyžaduje **server, který někdo provozuje** — zálohy, aktualizace,
  dohled. To je u nástroje pro 5 lidí nepoměr.
- Firestore běží bez našeho serveru a bez nasazovacího řetězu navíc.
- Precedent ekosystému (PostgreSQL + Coolify) je platný pro **Samvio se
  zákaznickými daty**. Tady jde o herní nastavení pěti známých lidí.

Odchylka je **ohraničená vrstvou adaptéru** (viz Přenositelnost) — nestává
se z ní trvalý závazek vůči Google.

---

## Architektura — kdo co dělá

| Vrstva | Kdo | Poznámka |
|---|---|---|
| Web aplikace | GitHub Pages | beze změny |
| Herní data | `hra.json` v repozitáři | beze změny |
| Tržní ceny | AODP, přímo z prohlížeče | beze změny |
| Výpočty | prohlížeč (`jadro/`) | beze změny |
| Rychlé úložiště | `localStorage` | **zůstává** — zdroj pravdy za běhu |
| Přihlášení | Firebase Authentication | nové |
| Synchronizace | Firestore | nové |

**Klíčové:** `localStorage` se neruší. Firestore je **kopie navíc**, ne
náhrada. Aplikace musí fungovat bez přihlášení i bez sítě přesně jako dnes.

### Vrstva adaptéru — jediné místo, které zná Firebase

Nový soubor `web/src/stav/sync.ts` s úzkým rozhraním:

```ts
prihlas() / odhlas() / kdoJePrihlasen()
nactiZeSerever(): Promise<Balicek | null>
ulozNaServer(b: Balicek): Promise<VysledekZapisu>
```

Zbytek aplikace o Firebase nesmí vědět. Import `firebase/*` je povolený
**jen** v tomto souboru — kontrolovatelné grepem.

---

## Datový model

**Jeden dokument na uživatele.** Žádné tabulky, žádné vztahy.

```
/uzivatele/{email}     ← e-mail malými písmeny
{
  verze: 1,
  aktualizovano: <čas serveru>,
  zarizeni: "náhodné id prohlížeče",
  data: {
    dilna:      { klice, konfig, override, zdrojCen },
    presety:    [...],
    nastaveni:  { west: {...}, europe: {...}, east: {...} },
    rucniCeny:  { west: [...], europe: [...], east: [...] }
  }
}
```

### Co se synchronizuje a co ne

| Data | Synchronizovat? | Proč |
|---|---|---|
| Seznam položek v dílně, konfigurace, presety | ✅ | vlastní práce uživatele |
| **Ručně zadané ceny** | ✅ | vlastní práce, dnes se nikdy nezahazují |
| Nastavení skenu (město, focus, premium…) | ✅ | drobné, ale otravné zadávat znovu |
| Stažené ceny z AODP | ❌ | objemné, zastarají za hodiny, jedním klikem znovu |
| Historie obchodů (souhrny) | ❌ | totéž, navíc stovky kB |

Tím dokument zůstane v řádu kilobajtů — což je předpoklad pro to, aby se
dal ukládat celý najednou a nemusel se řešit po částech.

**Ceny a nastavení jsou per server** (`west` / `europe` / `east`) — dnes je
to v klíči úložiště ([uloziste.ts:51](../web/src/stav/uloziste.ts:51)) a
dokument to musí zachovat, jinak by se ceny ze serverů smíchaly.

---

## Bezpečnost

### Pravidla na straně Firebase (ne v aplikaci)

Kód je veřejný, takže cokoli vynucené jen v aplikaci je vynucené jen naoko.
Pravidla Firestore musí říct:

1. zápis i čtení **jen přihlášenému**
2. **jen na svůj vlastní dokument** (`{email}` == e-mail přihlášeného)
3. **jen pro e-mail na seznamu povolených**

Seznam povolených bude **dokument v databázi** (`/config/povoleni`), ne
napevno v pravidlech — přidání šestého člověka pak nevyžaduje zásah do
pravidel v konzoli.

### Negativní testy — bez nich není ochrana prokázaná

Podle pravidel projektu se testuje to, co má selhat:

| Scénář | Očekávání |
|---|---|
| Nepřihlášený čte cizí dokument | ❌ odmítnuto |
| Nepřihlášený zapisuje | ❌ odmítnuto |
| Přihlášený čte **cizí** dokument | ❌ odmítnuto |
| Přihlášený zapisuje do **cizího** dokumentu | ❌ odmítnuto |
| Přihlášený **mimo seznam** čte/zapisuje svůj dokument | ❌ odmítnuto |
| Kdokoli zapisuje do `/config/povoleni` | ❌ odmítnuto |
| Povolený uživatel čte a zapisuje svůj dokument | ✅ povoleno |

Ověřuje se emulátorem Firebase lokálně, ne až v ostrém provozu.

---

## Chování aplikace

### Bez přihlášení
Beze změny. Nikdo není nucen se registrovat.

### Po přihlášení — pořadí je zásadní
1. **Nejdřív se čte ze serveru**, teprve pak se smí zapisovat.
2. Když na serveru **nic není** → nabídnout nahrání toho, co je v prohlížeči.
3. Když na serveru **něco je** a lokálně taky → uživatel rozhodne
   (*ponechat serverové / nahradit mými*), nic se nepřepíše samo.
4. Automatické ukládání se zapne **až po prvním úspěšném načtení**.

### Ukládání
- odklad 2 s po poslední změně (aby posuvník negeneroval zápis na každý krok)
- **navíc uložení při zavírání stránky** (`visibilitychange`) — jinak se
  poslední změny ztratí
- při výpadku sítě se zápis odloží; `localStorage` mezitím drží pravdu

### Odhlášení
Lokální data **se nemažou** (jinak by uživatel přišel o rozdělanou práci).
Nabídne se dobrovolné „vymazat data z tohoto prohlížeče" — pro případ
cizího počítače.

---

## Souběh dvou zařízení

Každý dokument nese čas poslední změny a id zařízení. Zápis proběhne
v transakci: přečti → porovnej → zapiš. Když je na serveru novější verze
od jiného zařízení, **zápis se neprovede** a uživatel dostane volbu.
Tiché „kdo poslední, ten vyhrál" se nepoužije — u ručně zadaných cen by
znamenalo tichou ztrátu práce.

---

## Verzování dat

Dokument nese `verze`. Na rozdíl od `localStorage`, kde se data při změně
formátu **zahazují** ([uloziste.ts:25](../web/src/stav/uloziste.ts:25)),
se serverová data zahazovat nesmí — jsou to hodiny cizí práce. Každá
budoucí změna tvaru s sebou ponese převodní krok při čtení.

**Starý klient nesmí přepsat nový formát:** když aplikace načte dokument
s vyšší verzí, než umí, přejde do režimu „jen čtení" a vyzve k obnovení
stránky.

---

## Export a import

Tlačítko **„Stáhnout všechna má data"** (soubor JSON) a odpovídající import.
Pár řádků kódu, ale je to pojistka proti závislosti na jednom dodavateli
i proti chybě v synchronizaci.

---

## Přenositelnost na Wedos

Tři opatření, bez kterých by přenositelné nebylo:

1. **Adaptér** `sync.ts` — přechod znamená přepsat jeden soubor.
2. **Klíč = e-mail**, ne vnitřní identifikátor Firebase. Po přesunu jde
   poznat, čí data jsou čí. Daň: změna e-mailu = nový záznam (u 5 lidí
   přijatelné, u tisíce by to bylo špatné rozhodnutí).
3. **Export** — data se dají vzít a nahrát jinam bez součinnosti Google.

Co se **nepřenese**: samotné přihlašování přes Google by se na novém serveru
muselo zřídit znovu. Data ano, identity ne.

---

## Kvóty a náklady

Bezplatný tarif Spark: 50 000 čtení/den, 20 000 zápisů/den,
125 000 přihlášení/měsíc, 1 GB dat.

Odhad pro 5 lidí: každý ~20 zápisů a ~10 čtení denně → **~100 zápisů denně**,
tedy 0,5 % denní kvóty. Dokument v řádu kilobajtů → 0,001 % místa.
Rezerva je několik řádů. Náklady: **0 Kč**.

---

## Co to zavírá a neuzavírá do budoucna

**Nezavírá F10 (hlídání a upozornění).** Firebase sice pro serverové funkce
vyžaduje placený tarif Blaze (nutná platební karta), ale F10 se dá udělat
**zdarma přes naplánovaný úkol v GitHub Actions**, který běží i se zavřeným
prohlížečem. Volba Firebase nás tedy do placeného tarifu nenutí.

---

## Harmonogram

| Krok | Kdo | Co |
|---|---|---|
| 0 | **Mirek** | založí projekt ve Firebase, **region `europe-west3` (Frankfurt)** |
| 1 | **Mirek** | zapne přihlášení Google, povolí doménu `mirek-modrak.github.io` |
| 2 | Claude | adaptér `sync.ts` + přihlašovací tlačítko, zatím bez synchronizace |
| 3 | Claude | pravidla Firestore + **negativní testy** na emulátoru |
| 4 | Claude | čtení ze serveru, sloučení při prvním přihlášení |
| 5 | Claude | ukládání s odkladem, souběh dvou zařízení, offline fronta |
| 6 | Claude | export/import do souboru |
| 7 | Claude | proklikání celého toku + zápis změn R6/R7 do dokumentace |

Po každém kroku zastávka a ukázka. Krok 0 a 1 musí udělat Mirek —
zakládání účtů a přihlašování za něj dělat nesmím.

⚠️ **Region databáze nejde po založení změnit.** Špatná volba = založit
projekt znovu.

---

# Oponentura — nalezené vady

Plán výše je **druhá verze**. Tohle jsou vady nalezené v první verzi;
u každé je uvedeno, jak se změnil **samotný návrh**, ne jen popis rizika.

### 1. 🔴 Nový telefon by smazal data na serveru

První verze po přihlášení uložila lokální stav na server. Na novém
zařízení je `localStorage` **prázdný** → první přihlášení na mobilu by
přepsalo všechno prázdnem. Klasická tichá ztráta dat.

**Změna návrhu:** pořadí je pevně dané — nejdřív čtení ze serveru,
automatické ukládání se zapíná **až po prvním úspěšném načtení**.
Sloučení dvou neprázdných stavů rozhoduje uživatel.

### 2. 🔴 Seznam povolených jen v aplikaci = žádná ochrana

První verze měla pět e-mailů zapsaných v kódu aplikace. Kód je po
zveřejnění repozitáře veřejný a hlavně: cokoli v prohlížeči jde obejít.
Kdokoli s Google účtem by se dostal k datům.

**Změna návrhu:** seznam je vynucený **v pravidlech Firestore**, a to
jako dokument v databázi — jinak by přidání člověka znamenalo ruční
zásah do pravidel v konzoli, což by Mirek dělat nechtěl a nedělal.

### 3. 🔴 „Kdo poslední, ten vyhrál" by tiše mazal ruční ceny

První verze prostě zapisovala. Dvě zařízení (počítač + mobil) by se
navzájem přepisovala a ručně zadané ceny — v projektu výslovně chráněná
data, která se nikdy nezahazují — by mizely bez varování.

**Změna návrhu:** zápis v transakci s porovnáním času a id zařízení;
při konfliktu se **nezapisuje** a rozhoduje uživatel.

### 4. 🟡 Odklad zápisu ztrácí poslední změny — a platí to **i dnes**

Odklad 500 ms v [uloziste.ts:31](../web/src/stav/uloziste.ts:31) znamená,
že zavření záložky do půl vteřiny po zadání ruční ceny tu cenu zahodí.
Se serverem by se stejná díra jen zopakovala.

**Změna návrhu:** uložení i při `visibilitychange`. Doplní se **zároveň
pro localStorage** — je to existující vada, ne nový požadavek.

### 5. 🟡 E-mail jako klíč naráží na velká písmena

`Mirek@Firma.cz` a `mirek@firma.cz` by v Firestore byly **dva různé
dokumenty** — uživatel by podle způsobu přihlášení viděl jednou svá data
a jednou prázdno. V ekosystému už tahle chyba jednou nastala
(`email-case-insensitivity-fix-plan.md` v Samvio).

**Změna návrhu:** e-mail se před použitím jako klíč normalizuje na malá
písmena, a to na jednom místě v adaptéru. Totéž v pravidlech.

### 6. 🟡 Míchání serverů west / europe / east

První verze ukládala ceny a nastavení jako jeden balík. Dnešní úložiště
je ale dělené podle herního serveru — sloučením by cena z `west` platila
pro `europe`. To je věcná chyba ve výpočtu, ne kosmetika.

**Změna návrhu:** dokument drží ceny i nastavení **oddělené podle serveru**.

### 7. 🟡 GDPR: dokument v EU, identita ne

První verze tvrdila „data zůstanou v EU". Přesné to není: **Firestore**
region zvolit lze (Frankfurt), ale **Firebase Authentication** ukládá
identity globálně a region se u něj nevybírá.

**Změna návrhu:** do plánu patří krátká informace o zpracování údajů
(jaké údaje, kde, jak je smazat) a funkce „smazat můj účet a data".
Netvrdit, že vše zůstává v EU.

### 8. 🟡 Runaway zápis by vyčerpal denní kvótu

Odhad 100 zápisů denně platí, dokud se někde neobjeví smyčka
(uložení → přerenderování → uložení). Při chybě by 20 000 zápisů padlo
za minuty a synchronizace by do půlnoci přestala fungovat.

**Změna návrhu:** pojistka v adaptéru — nejvýš 1 zápis za 5 s a strop
zápisů na relaci; při překročení se přestane ukládat na server
a ohlásí se to. `localStorage` funguje dál.

### 9. 🟢 Odhlášení na cizím počítači

První verze odhlášení neřešila. Smazat lokální data by bylo špatně
(ztráta rozdělané práce), nesmazat taky (data zůstanou na cizím stroji).

**Změna návrhu:** odhlášení nemaže nic, ale nabídne dobrovolné
„vymazat data z tohoto prohlížeče".

---

## Co by se mohlo pokazit, i kdyby tohle fungovalo správně

Nejpravděpodobnější zdroj potíží nejsou peníze ani výpadky Firebase,
ale **pravidla přístupu**. Ve výchozím stavu bývá databáze buď otevřená
komukoli, nebo zavřená i vlastníkovi — a obojí se pozná pozdě. Proto je
krok 3 (pravidla + negativní testy) zařazený **před** jakoukoli
synchronizací dat, ne za ni.

Druhá věc: závislost na Google jako dodavateli. Ošetřena adaptérem,
klíčováním e-mailem a exportem — ale úplně nezmizí.
