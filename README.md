# Albion kalkulačka

Nástroj pro výpočet čistého zisku v Albion Online — refining, crafting
a převoz. Cílem je odpovědět na otázku **„kde se právě teď nejvíc vydělá?"**

---

## Rychlý start

```bash
npm install
npm run dev
```

Otevře se na `http://localhost:5180`. Vyber město, klikni na
**Stáhnout ceny a spočítat** — do pár vteřin uvidíš pořadí toho,
co se právě teď nejvíc vyplatí refinovat.

```bash
npm test        # 241 testů
npm run build   # produkční build
```

Prototyp (starší, ale funkční): [prototyp.html](prototyp.html) otevři dvojklikem.
Nic se neinstaluje.

---

## Struktura

```
jadro/          herní matematika — čisté funkce, BEZ závislostí
  src/          typy, identita položek, bonusy, recepty, výpočet
  data/         hra.json — vygenerovaná herní data (VERZOVÁNO)
  test/         zlaté vektory
web/            aplikace — React + Vite + Tailwind
  src/data/     načtení herních dat, klient AODP
  src/stav/     sklad cen, logika skenu
  src/ui/       ovládací panel, tabulka
nastroje/       generátor herních dat z ao-bin-dumps
docs/           průzkum, architektura, funkční specifikace
prototyp.html   samostatný prototyp refiningu
```

**Proč je jádro oddělené:** herní vzorce jsou subtilní a jediné místo, kde
tichá chyba znehodnotí úplně všechno. Oddělené jádro jde otestovat bez
klikání a použije ho webová aplikace i (později) služba na pozadí — takže
vzorce existují jen jednou.

---

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | vývojový server na portu 5180 |
| `npm test` | zlaté vektory (241 testů) |
| `npm run kontrola` | typová kontrola |
| `npm run build` | produkční build |
| `npm run generuj` | **znovu stáhne herní data** z ao-bin-dumps |

### Kdy spustit `npm run generuj`

Jen když vyjde herní patch, který mění receptury nebo konstanty.
**Není součástí buildu** — vygenerovaný `hra.json` je v repozitáři, aby
šlo sestavit aplikaci offline a výpadek GitHubu neshodil nasazení.

Po regeneraci **vždy spusť testy**. Zlaté vektory odhalí, jestli se změnila
čísla, se kterými počítáme. Když spadnou, něco se změnilo ve hře —
není to důvod „opravit test".

Generátor zapisuje SHA commitu do `hra.json`, takže jde kdykoli dohledat,
z jakých dat výsledek vznikl.

---

## Zdroje dat

| Co | Odkud | Poznámka |
|---|---|---|
| Receptury, bonusy, konstanty | [ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps) | data přímo z klienta hry |
| Tržní ceny a historie | [Albion Online Data Project](https://www.albion-online-data.com/) | crowdsourcované — **mohou být stará** |

⚠️ Ceny z AODP sbírají hráči vlastním klientem, takže existují jen pro to,
co si někdo nedávno otevřel v tržnici. Každá cena nese časovou značku
a ta se **musí** kontrolovat.

---

## Dokumentace

| Dokument | O čem je |
|---|---|
| [funkcni-specifikace.md](docs/funkcni-specifikace.md) | co to má umět — scénáře S1–S9 |
| [architektura-rozhodnuti.md](docs/architektura-rozhodnuti.md) | 12 rozhodnutí a jejich zdůvodnění |
| [architektura.md](docs/architektura.md) | vrstvy a datový model |
| [vyzkum-01-mechaniky.md](docs/vyzkum-01-mechaniky.md) | herní mechaniky, daně, bonusy |
| [vyzkum-02-herni-data.md](docs/vyzkum-02-herni-data.md) | receptury z herních dat |
| [vyzkum-03-konstanty.md](docs/vyzkum-03-konstanty.md) | konstanty z `gamedata.xml` |
| [f1-plan.md](docs/f1-plan.md) … [f8-plan.md](docs/f8-plan.md) | plány a oponentury jednotlivých fází |
| [todo.md](docs/todo.md) | otevřené otázky |

---

## Stav

| Fáze | Co | Stav |
|---|---|---|
| F1 | `jadro/` + zlaté vektory + generátor | ✅ hotovo |
| F2 | web — sken surovin | ✅ hotovo |
| F3 | detail položky (proklik ze skenu) | ✅ hotovo |
| F4 | sken předmětů po kategoriích | ✅ hotovo |
| F5 | nejlepší příležitosti napříč všemi městy | ✅ hotovo |
| F6 | graf ceny a objemu v čase | ✅ hotovo |
| F7 | převoz: srovnání měst, zisk/kg, nosnost mountu | ✅ hotovo |
| F8 | koupit vs. vyrobit | ✅ hotovo |
| F9 | nasazení na VPS | ← další |
| F10 | hlídání a upozornění | |
