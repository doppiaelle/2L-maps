import { splitAddressBook, type AddressBookEntry } from './address-book';
import { COORDINATE_MAX_AGE_DAYS } from '@/types';

/**
 * The address book is the cost lever, so the tests that matter are about what
 * stays reusable — including after the purge has taken the coordinates that made
 * it readable.
 */

const NOW = new Date('2026-08-09T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const entry = (overrides: Partial<AddressBookEntry> = {}): AddressBookEntry => ({
  placeId: 'place-a',
  label: null,
  formattedAddress: 'Via Borgo Palazzo 137, Bergamo BG, Italy',
  useCount: 1,
  lastUsedAt: daysAgo(1),
  ...overrides,
});

describe('the two sections', () => {
  it('puts what was used lately in Recent', () => {
    const book = splitAddressBook([entry({ lastUsedAt: daysAgo(2) })], NOW);
    expect(book.recent).toHaveLength(1);
    expect(book.saved).toHaveLength(0);
  });

  it('puts what was not in Saved, still reusable', () => {
    // Past the window the coordinates have been purged anyway, so the split also
    // happens to divide "instant" from "may need one lookup".
    const book = splitAddressBook(
      [entry({ lastUsedAt: daysAgo(COORDINATE_MAX_AGE_DAYS + 1) })],
      NOW,
    );
    expect(book.recent).toHaveLength(0);
    expect(book.saved).toHaveLength(1);
  });

  it('orders Recent by when, because that is the question it answers', () => {
    const book = splitAddressBook(
      [
        entry({ placeId: 'old', lastUsedAt: daysAgo(5), useCount: 99 }),
        entry({ placeId: 'new', lastUsedAt: daysAgo(1), useCount: 1 }),
      ],
      NOW,
    );
    expect(book.recent.map((option) => option.placeId)).toEqual(['new', 'old']);
  });

  it('orders Saved by how often, because that is a different question', () => {
    // A driver looking in Recent means "the one from this morning"; a driver
    // looking in Saved means "the depot".
    const book = splitAddressBook(
      [
        entry({ placeId: 'rare', lastUsedAt: daysAgo(40), useCount: 1 }),
        entry({ placeId: 'depot', lastUsedAt: daysAgo(60), useCount: 30 }),
      ],
      NOW,
    );
    expect(book.saved.map((option) => option.placeId)).toEqual(['depot', 'rare']);
  });

  it('treats a never-stamped row as old rather than as fresh', () => {
    // Guessing upward would pin it to the top of Recent for ever.
    const book = splitAddressBook([entry({ lastUsedAt: null })], NOW);
    expect(book.saved).toHaveLength(1);
  });
});

describe('after the purge has run', () => {
  it('keeps an entry the user named, even with no address left', () => {
    // The label is user content and is never purged. It is the whole reason a
    // named place stays usable across the thirty-day boundary (ADR-0007).
    const book = splitAddressBook([entry({ label: 'Depot', formattedAddress: null })], NOW);
    expect(book.recent[0]?.primaryText).toBe('Depot');
  });

  it('does not offer an entry with nothing readable left', () => {
    // A blank row in a picker is not an option, it is a guess.
    const book = splitAddressBook([entry({ label: null, formattedAddress: null })], NOW);
    expect(book.recent).toHaveLength(0);
    expect(book.saved).toHaveLength(0);
  });

  it('does not treat whitespace as a name', () => {
    const book = splitAddressBook([entry({ label: '   ', formattedAddress: null })], NOW);
    expect(book.recent).toHaveLength(0);
  });
});

describe('how a row reads', () => {
  it('lets the user’s own name carry the row, with the address beneath it', () => {
    // They wrote "Depot" because the street is not how they think about it —
    // and the address stays visible so two places called "Warehouse" are still
    // distinguishable.
    const book = splitAddressBook([entry({ label: 'Depot' })], NOW);
    expect(book.recent[0]?.primaryText).toBe('Depot');
    expect(book.recent[0]?.secondaryText).toContain('Via Borgo Palazzo 137');
  });

  it('splits an unnamed address at the street, the way Places does', () => {
    const book = splitAddressBook([entry()], NOW);
    expect(book.recent[0]?.primaryText).toBe('Via Borgo Palazzo 137');
    expect(book.recent[0]?.secondaryText).toBe('Bergamo BG, Italy');
  });

  it('copes with an address that has no comma in it', () => {
    const book = splitAddressBook([entry({ formattedAddress: 'Piazza Vecchia' })], NOW);
    expect(book.recent[0]?.primaryText).toBe('Piazza Vecchia');
    expect(book.recent[0]?.secondaryText).toBe('');
  });
});
