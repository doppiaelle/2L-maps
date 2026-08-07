/**
 * React Native Testing Library v13 registers its matchers on import, so no
 * extend-expect entry point is needed.
 *
 * The clock is mocked, never the function under test (CLAUDE.md §5). Coordinate
 * expiry is a 30-day boundary (ADR-0007), so tests that touch it set a
 * deterministic now rather than relying on the wall clock.
 */
import '@testing-library/react-native';
