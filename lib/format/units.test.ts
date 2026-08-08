import { arrivalTime, formatDistance, formatDuration, formatTime, usesImperial } from './units';

/**
 * Units follow the locale, never the language (docs/34_LOCALIZATION.md §7). The
 * case that proves the rule is `en-IT`: an English interface in Italy, where the
 * roads are signed in kilometres.
 *
 * Node's full ICU is required for these to be meaningful. `Intl` with a reduced
 * dataset silently falls back to English formatting, which would make the Italian
 * assertions pass for the wrong reason — so the first test checks the environment
 * rather than assuming it.
 */

describe('the test environment has the locale data these assertions need', () => {
  it('formats Italian decimals with a comma', () => {
    // If this fails, every Italian assertion below is meaningless rather than
    // wrong, and the fix is the ICU build, not the code.
    expect(new Intl.NumberFormat('it-IT').format(1.5)).toBe('1,5');
  });
});

describe('usesImperial', () => {
  it('is driven by region, not language', () => {
    expect(usesImperial('en-IT')).toBe(false);
    expect(usesImperial('it-IT')).toBe(false);
    expect(usesImperial('en-US')).toBe(true);
    expect(usesImperial('es-US')).toBe(true);
  });

  it('treats the UK as imperial for road distance', () => {
    // Metric for nearly everything, imperial on road signs. A driver in London
    // expects miles even though they buy petrol in litres.
    expect(usesImperial('en-GB')).toBe(true);
  });

  it('falls back to metric for an unparseable locale', () => {
    expect(usesImperial('not-a-locale-!!')).toBe(false);
    expect(usesImperial('')).toBe(false);
  });
});

describe('formatDistance — metric', () => {
  it('uses metres below a kilometre, rounded to the nearest 10', () => {
    expect(formatDistance(847, 'it-IT')).toBe('850 m');
    expect(formatDistance(12, 'it-IT')).toBe('10 m');
    expect(formatDistance(0, 'it-IT')).toBe('0 m');
  });

  it('uses kilometres with an Italian decimal comma above a kilometre', () => {
    // Hand-rolled formatting produces "34.2 km" here, which reads as a defect to
    // an Italian user rather than as a rounding choice.
    expect(formatDistance(34_237, 'it-IT')).toBe('34,2 km');
  });

  it('rounds to one decimal place, not to the metre', () => {
    // 34,237 km would be false precision: the underlying figure is not accurate
    // to the metre on a road route.
    expect(formatDistance(34_237, 'it-IT')).not.toContain('237');
  });

  it('switches unit exactly at 1000 m', () => {
    // No thousands separator at 1000: Italian CLDR sets minimumGroupingDigits to
    // 2, so grouping starts at 10.000 rather than 1.000. Hand-rolled formatting
    // would insert one here and look subtly foreign to an Italian reader.
    expect(formatDistance(999, 'it-IT')).toBe('1000 m');
    expect(formatDistance(1000, 'it-IT')).toBe('1,0 km');
  });

  it('gives an English-speaking user in Italy kilometres and a decimal comma', () => {
    // The case the whole rule exists for — and CLDR goes further than the rule
    // asks: en-IT carries European number conventions, so the separator is a
    // comma even though the language is English. Deferring to Intl gets this
    // right for free; a language-keyed lookup table would not.
    expect(formatDistance(34_237, 'en-IT')).toBe('34,2 km');
    expect(formatDistance(34_237, 'en-US')).toBe('21.3 mi');
  });
});

describe('formatDistance — imperial', () => {
  it('uses feet below a thousand and miles above', () => {
    expect(formatDistance(100, 'en-US')).toBe('330 ft');
    expect(formatDistance(34_237, 'en-US')).toBe('21.3 mi');
  });

  it('gives an Italian-speaking user in the US miles', () => {
    expect(formatDistance(34_237, 'it-US')).toBe('21,3 mi');
  });
});

describe('formatDistance — invalid input', () => {
  it.each([NaN, Infinity, -1, -0.5])('renders %p as an em dash rather than nonsense', (value) => {
    // A distance that cannot be computed must not render as "NaN km", which reads
    // as a crash the user cannot act on.
    expect(formatDistance(value, 'it-IT')).toBe('—');
  });
});

describe('formatDuration', () => {
  it('shows whole minutes below an hour', () => {
    expect(formatDuration(2_880)).toBe('48 min');
    expect(formatDuration(59)).toBe('1 min');
    expect(formatDuration(29)).toBe('0 min');
  });

  it('shows hours and minutes above an hour', () => {
    expect(formatDuration(4_320)).toBe('1h 12min');
    expect(formatDuration(7_200)).toBe('2h');
  });

  it('switches at exactly 60 minutes', () => {
    expect(formatDuration(3_540)).toBe('59 min');
    expect(formatDuration(3_600)).toBe('1h');
  });

  it('never shows seconds', () => {
    // A route ETA accurate to the second is a claim the traffic model cannot
    // support, and is unreadable at a glance while driving.
    expect(formatDuration(4_337)).not.toMatch(/\d+\s*s\b/);
  });

  it.each([NaN, Infinity, -60])('renders %p as an em dash', (value) => {
    expect(formatDuration(value)).toBe('—');
  });
});

describe('formatTime', () => {
  const noon = new Date('2026-08-07T12:30:00.000Z');

  it('uses a 24-hour clock in Italy', () => {
    expect(formatTime(noon, 'it-IT', 'UTC')).toBe('12:30');
  });

  it('uses a 12-hour clock in the US', () => {
    // An ETA shown in the wrong hour cycle is ambiguous by twelve hours, which is
    // worse than showing no ETA.
    expect(formatTime(noon, 'en-US', 'UTC')).toMatch(/12:30\s?PM/i);
  });

  it('renders an invalid date as an em dash', () => {
    expect(formatTime(new Date('nonsense'), 'it-IT')).toBe('—');
  });
});

describe('arrivalTime', () => {
  it('adds the duration to the departure', () => {
    const departure = new Date('2026-08-07T09:00:00.000Z');
    expect(arrivalTime(departure, 4_320).toISOString()).toBe('2026-08-07T10:12:00.000Z');
  });

  it('does not mutate the departure it was given', () => {
    const departure = new Date('2026-08-07T09:00:00.000Z');
    arrivalTime(departure, 3_600);
    expect(departure.toISOString()).toBe('2026-08-07T09:00:00.000Z');
  });

  it('crosses midnight correctly', () => {
    const departure = new Date('2026-08-07T23:30:00.000Z');
    expect(arrivalTime(departure, 3_600).toISOString()).toBe('2026-08-08T00:30:00.000Z');
  });
});
