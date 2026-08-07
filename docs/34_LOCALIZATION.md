# 34 — Localization

> **Status:** Approved
> **Owner:** Design + Architecture
> **Last reviewed:** 2026-08-06
> **Related:** [`07_DESIGN_SYSTEM.md`](07_DESIGN_SYSTEM.md) · [`26_APP_STORE.md`](26_APP_STORE.md) · [`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)

---

## 1. Purpose

This document specifies how the product handles languages, units, formats and region-specific
behaviour. The launch market is Italy, with English as the second language and the development
default.

Localization here is not only translation. Address formats, distance units, time formats and
the legally-mandated wording of the subscription disclosure all vary by locale, and two of those
carry compliance weight.

## 2. Goals

1. Ship Italian and English at launch, both first-class.
2. Keep all user-facing strings out of components from the first commit.
3. Format distances, durations, dates and addresses correctly per locale.
4. Ensure legally-required subscription wording is correct in every shipped language.
5. Keep layouts intact under the length variation translation introduces.

**Non-goals.** No RTL support in the MVP. No community translation pipeline.

## 3. Responsibilities

| Concern | Owner | Notes |
|---|---|---|
| String catalogue | Engineering | No literal user-facing string in any component |
| Italian copy | Product owner | Native speaker; the primary market |
| Legal wording | Product owner + [`32`](32_LEGAL_COMPLIANCE.md) | Compliance-bearing, not marketing copy |
| Format correctness | Engineering | Platform APIs, never manual formatting |

---

## 4. Text diagrams

### Locale resolution

```
  device locale
       │
       ├── it-* ────────▶ Italian  ─┐
       │                             ├─▶ metric units, 24-hour clock,
       ├── en-* ────────▶ English ──┤    dd/MM/yyyy, comma decimal (IT)
       │                             │
       └── anything else ─▶ English ─┘

  Users may override the language in Settings. Units and formats
  follow the LOCALE, not the language: an English-speaking user
  in Italy gets kilometres and a 24-hour clock, because that is
  what the road signs say.
```

### What varies

```
  TRANSLATED           FORMATTED            NEVER TOUCHED
  ──────────           ─────────            ─────────────
  interface copy       distance             user's own labels
  error messages       duration             user's own notes
  paywall wording ⚠    dates and times      addresses from Google
  store listings       numbers              place_id
  legal text ⚠         address display

  ⚠ = compliance-bearing. Reviewed, not machine-translated.
```

---

## 5. Languages

| Language | Status | Notes |
|---|---|---|
| **Italian** | Primary market | Product owner is the native reviewer |
| **English** | Development default; fallback for every other locale | Also the source language for the catalogue |

**Development is in English.** Keys are semantic (`route.optimize.action`), never
English-string-as-key — an English-keyed catalogue makes copy changes look like code changes and
breaks every translation when a word is adjusted.

**A missing Italian string falls back to English and fails CI.** Silent fallback in production
would ship a mixed-language interface that looks broken.

---

## 6. Units and formats

Units follow the **locale**, not the chosen language, because units describe the physical world
the user is driving through. An English-speaking user in Italy sees kilometres.

| Value | Italy / metric locales | Imperial locales |
|---|---|---|
| Distance, < 1 km | `850 m` | `0.5 mi` |
| Distance, ≥ 1 km | `34,2 km` (comma decimal) | `21.3 mi` |
| Duration, < 1 h | `48 min` | `48 min` |
| Duration, ≥ 1 h | `1h 12min` | `1h 12m` |
| Time | `14:30` (24-hour) | `2:30 PM` |
| Date | `07/08/2026` | `08/07/2026` |
| Currency | `9,99 €` | `$9.99` |

**Formatting uses platform APIs**, never manual string assembly. Italian decimal commas,
day-first dates and 24-hour clocks are all handled correctly by `Intl`; hand-rolled formatting
gets them wrong in ways that look like bugs to a native reader.

**Distances round sensibly:** under 1 km to the nearest 10 m, above to one decimal place.
`34,237 km` is false precision on a road route and reads as unconsidered.

### Address display

Addresses come from Google already formatted for their locale and are **displayed as returned**.
The app does not reassemble address components — Italian addresses put the number after the
street (`Via Roma 12`), and reformatting would introduce errors in exactly the data the user
relies on most.

The user's own label always takes precedence in the row; the formatted address appears beneath
it ([`09_COMPONENT_LIBRARY.md`](09_COMPONENT_LIBRARY.md)).

---

## 7. Compliance-bearing copy

Two areas are **not** ordinary interface copy and are reviewed as legal text.

### The paywall

Trial length, price after trial, renewal period and cancellation method must be unambiguous in
every shipped language ([`20_SUBSCRIPTIONS.md`](20_SUBSCRIPTIONS.md),
[`26_APP_STORE.md`](26_APP_STORE.md)). Guideline 3.1.2 is enforced on the reviewed language, and
Italian users see Italian.

An imprecise translation here is a rejection risk (C12) and a consumer-law exposure (C16) — not
a copy quality issue.

### Terms, privacy and withdrawal

The Codice del Consumo and Directive 2011/83/EU require clear pre-contractual information and a
right of withdrawal ([`32_LEGAL_COMPLIANCE.md`](32_LEGAL_COMPLIANCE.md)). Italian wording is
authoritative for Italian users.

**Neither is machine-translated, and neither is edited without review.** A change to the paywall
copy in one language requires reviewing all languages together.

---

## 8. Layout under translation

Italian runs roughly **15–25% longer than English** for interface copy. Two places in this
product are tight enough to break:

1. **The primary action** — a fixed-height, full-width control. Labels are chosen short in both
   languages (`Optimize` / `Ottimizza`, `Start` / `Avvia`).
2. **Uppercase micro-labels** — `label-sm` at 11 pt with +8% tracking. Italian equivalents are
   verified to fit, and are abbreviated where necessary (`TAPPE` rather than `FERMATE`).

Every screen is verified in both languages **at Dynamic Type 200%**, which is where length
variation and type scaling compound.

---

## 9. Edge cases

| # | Condition | Expected behaviour |
|---|---|---|
| 1 | Device locale is neither IT nor EN | English interface, locale-correct units and formats |
| 2 | User overrides language to English in Italy | English copy, **metric units, 24-hour clock** |
| 3 | Missing translation key | English fallback at runtime; **CI failure** at build |
| 4 | Italian string overflows the primary action | Caught by layout test; the string is shortened, not truncated |
| 5 | Address contains characters absent from the font | System font fallback |
| 6 | User label in a third language | Displayed verbatim, never translated or transliterated |
| 7 | Locale changes while the app is open | Interface re-renders; user content is untouched |
| 8 | Pluralisation: 1 stop vs 2 stops | ICU plural rules; never a hand-written conditional |
| 9 | Distance exactly 1,000 m | Displayed as `1,0 km`, not `1000 m` |
| 10 | Store listing language versus app language | Independent; both maintained |

## 10. Error handling

| Failure | Result | Fallback |
|---|---|---|
| Translation key missing | CI build failure | English at runtime |
| Formatting throws on an unexpected locale | Logged; English format used | English |
| Legal copy differs between languages | **Release blocked** | None — must be resolved |
| Text overflows in one language | Layout test failure | Shortened copy, never truncation |

## 11. Best practices

1. **No user-facing string in a component**, from the first commit. Retrofitting is far more
   expensive.
2. **Semantic keys**, never English strings as keys.
3. **Platform formatting APIs only.** Manual formatting gets Italian conventions wrong.
4. **Units follow the locale, language follows the preference.**
5. **Never reformat a Google-supplied address.**
6. **Never translate user content.**
7. **ICU plurals**, never hand-written conditionals.
8. **Review compliance copy in all languages together**, as one change.

## 12. Checklist

- [ ] No literal user-facing strings in components.
- [ ] Every key present in both catalogues; missing keys fail CI.
- [ ] Units, dates, times and numbers verified against Italian conventions by a native reader.
- [ ] Addresses displayed exactly as returned by Google.
- [ ] Paywall copy reviewed for compliance in both languages.
- [ ] Terms and withdrawal wording reviewed in both languages.
- [ ] Every screen verified in both languages at Dynamic Type 200%.
- [ ] Primary action labels verified to fit in both languages.
- [ ] ICU plurals used throughout.
- [ ] Store listings prepared in both languages.

## 13. Roadmap

| Phase | Scope | Trigger |
|---|---|---|
| MVP | Italian and English; metric and imperial formatting | — |
| 1.x | Spanish or German, driven by store analytics | Install data from a second market |
| 2.0 | Localised store screenshots per market | Market expansion |
| 3.0 | RTL support | A market requiring it |

## 14. Decision log

| Date | Change | Reason | Author |
|---|---|---|---|
| 2026-08-06 | Italian and English at launch | Italy is the launch market; English is the development default and global fallback | Product owner |
| 2026-08-06 | Units follow locale, not language | Units describe the road, not the reader | Design |
| 2026-08-06 | Google addresses displayed verbatim | Reassembly introduces errors in the data users most rely on | Architecture |
| 2026-08-06 | Paywall and legal copy treated as compliance artefacts | C12 and C16 are review and consumer-law risks, not copy quality issues | Product owner |

## 15. Rationale

Localization is specified from the first commit rather than retrofitted because the cost curve
is steep and one-directional. Extracting strings from a finished codebase is mechanical but
enormous; writing them into a catalogue from the start costs almost nothing.

Separating units from language is the decision most likely to be implemented wrongly by default.
Most frameworks bind them together, so an English-language user in Italy would see miles — which
is actively harmful when every road sign is in kilometres. The rule is that units describe the
physical world the user is driving through, and language describes the reader.

Treating the paywall and legal copy as compliance artefacts rather than interface copy reflects
where the actual risk sits. A slightly awkward button label costs nothing; an imprecise Italian
rendering of the renewal terms is simultaneously an App Review rejection (C12) and a consumer-law
exposure (C16). Those strings get a different process from the rest.

Displaying Google's formatted addresses verbatim is a small rule with outsized value. Address
conventions vary in ways that are easy to get subtly wrong — Italian street numbers follow the
street name, and an app that reversed them would look broken to every Italian user while
appearing fine in testing to anyone else.

## 16. Rejected alternatives

| Alternative | Attraction | Why rejected |
|---|---|---|
| Italian only at launch | Focused; less to maintain; matches the market | English is the development default and the fallback for every other locale; shipping without it means an unusable app outside Italy |
| English only, localise later | Fastest to ship | The launch market is Italy. An Italian professional will not adopt an English-only tool, and the paywall must be in Italian for compliance |
| English strings as translation keys | Readable in code; no key invention | Every copy change becomes a key change, breaking all translations |
| Units bound to language | Simpler; one setting | An English-speaking user in Italy would see miles while every road sign shows kilometres |
| Reassembling addresses from components | Consistent formatting; full control | Introduces errors in exactly the data users depend on, and varies by country |
| Machine translation with review | Cheaper; faster to add languages | Acceptable for interface copy, not for the paywall and legal text where precision carries legal weight |
