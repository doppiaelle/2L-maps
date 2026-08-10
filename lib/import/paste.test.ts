import { parsePaste } from './paste';

/**
 * The import that works with no model, no key and no network.
 *
 * A driver's day usually arrives as a list, and a list needs splitting rather
 * than understanding. The tests below are mostly about the shapes real lists
 * come in — spreadsheet columns, numbered lists, a message with the addresses
 * buried in prose — and about never inventing an address from a line that could
 * not be read.
 */

describe('splitting a pasted list', () => {
  it('takes one address per line', () => {
    const result = parsePaste('Via Roma 1, Bergamo\nVia Milano 22, Bergamo');
    expect(result.candidates.map((c) => c.text)).toEqual([
      'Via Roma 1, Bergamo',
      'Via Milano 22, Bergamo',
    ]);
  });

  it('splits a spreadsheet column pasted with semicolons', () => {
    const result = parsePaste('Via Roma 1, Bergamo; Via Milano 22, Bergamo');
    expect(result.candidates).toHaveLength(2);
  });

  it('joins the columns of a tab-separated row into one address', () => {
    // A paste out of Excel puts the street, the postcode and the town in
    // separate columns, and all three belong to the same stop.
    const result = parsePaste('Via Roma 1\t24121\tBergamo');
    expect(result.candidates[0]?.text).toBe('Via Roma 1, 24121, Bergamo');
  });

  it('strips the list markers a pasted list is full of', () => {
    const result = parsePaste(
      '1. Via Roma 1, Bergamo\n- Via Milano 22, Bergamo\n• Via Po 3, 24100',
    );
    expect(result.candidates.map((c) => c.text)).toEqual([
      'Via Roma 1, Bergamo',
      'Via Milano 22, Bergamo',
      'Via Po 3, 24100',
    ]);
  });

  it('ignores blank lines rather than counting them as failures', () => {
    const result = parsePaste('Via Roma 1, Bergamo\n\n\nVia Milano 22, Bergamo\n');
    expect(result.candidates).toHaveLength(2);
    expect(result.needsParsing).toBe(false);
  });

  it('keeps the original position, so a correction points at the right line', () => {
    const result = parsePaste('Via Roma 1, Bergamo\nVia Milano 22, Bergamo');
    expect(result.candidates.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe('what is not an address', () => {
  it('drops a line with no number in it', () => {
    // A name, a heading or a note. An address has a street number, a postcode,
    // or both.
    const result = parsePaste('Consegne di martedì\nVia Roma 1, Bergamo');
    expect(result.candidates.map((c) => c.text)).toEqual(['Via Roma 1, Bergamo']);
  });

  it('drops a fragment too short to be a place', () => {
    const result = parsePaste('24121\nVia Roma 1, Bergamo');
    expect(result.candidates).toHaveLength(1);
  });

  it('drops a sentence, which is what a paragraph split on newlines produces', () => {
    const prose =
      'Ciao potresti passare domani mattina presto a ritirare il pacco che ho lasciato dal vicino grazie mille';
    const result = parsePaste(`${prose}\nVia Roma 1, Bergamo`);
    expect(result.candidates.map((c) => c.text)).toEqual(['Via Roma 1, Bergamo']);
  });
});

describe('when a split is the wrong tool', () => {
  it('says so for prose, rather than reporting most of it unreadable', () => {
    // "22 of your 25 lines could not be read" is worse than not having tried.
    // Above this threshold the screen offers the model instead.
    const result = parsePaste(
      [
        'Ciao Marco come stai spero tutto bene volevo chiederti un favore',
        'domani mattina se puoi passare in negozio verso le nove',
        'poi ti mando gli altri indirizzi appena li ho',
        'Via Roma 1, Bergamo',
      ].join('\n'),
    );
    expect(result.needsParsing).toBe(true);
  });

  it('does not say so for a clean list', () => {
    const result = parsePaste(
      'Via Roma 1, Bergamo\nVia Milano 22, Bergamo\nVia Po 3, 24100 Torino',
    );
    expect(result.needsParsing).toBe(false);
  });

  it('does not say so for an empty paste', () => {
    // Nothing to parse is not a reason to offer a paid parse.
    expect(parsePaste('').needsParsing).toBe(false);
  });
});

describe('duplicates and the ceiling', () => {
  it('removes the same address typed twice, and says it did', () => {
    // A user who pasted thirty rows and got twenty-eight stops needs to be told
    // why, rather than left counting.
    const result = parsePaste('Via Roma 1, Bergamo\nvia roma 1 bergamo');
    expect(result.candidates).toHaveLength(1);
    expect(result.duplicates).toEqual(['via roma 1 bergamo']);
  });

  it('keeps a genuine repeat visit distinct from a duplicate row', () => {
    // Two deliveries to different numbers on the same street is a real day.
    const result = parsePaste('Via Roma 1, Bergamo\nVia Roma 2, Bergamo');
    expect(result.candidates).toHaveLength(2);
  });

  it('names what is over the plan ceiling instead of cutting it silently', () => {
    const lines = Array.from({ length: 5 }, (_, index) => `Via Roma ${index + 1}, Bergamo`);
    const result = parsePaste(lines.join('\n'), 3);

    expect(result.candidates).toHaveLength(3);
    expect(result.overflow).toEqual(['Via Roma 4, Bergamo', 'Via Roma 5, Bergamo']);
  });

  it('applies the plan’s ceiling, not the product’s', () => {
    // A free user is stopped at their own limit rather than at a number that
    // belongs to somebody else's subscription (ADR-0015).
    const lines = Array.from({ length: 20 }, (_, index) => `Via Roma ${index + 1}, Bergamo`);
    expect(parsePaste(lines.join('\n'), 15).candidates).toHaveLength(15);
  });
});
