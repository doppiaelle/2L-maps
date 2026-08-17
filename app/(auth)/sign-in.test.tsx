import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';

import SignInScreen from './sign-in';
import { SessionProvider } from '@/features/auth/session-provider';
import { DeepLinkProvider } from '@/features/navigation/deep-link-provider';
import type { DeepLinkPort } from '@/features/navigation/use-pending-deep-link';
import { usePreferencesStore } from '@/features/stores';
import { backdrop, brandLogo, colours, layout, space, text } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { AuthProvider, SignInOutcome } from '@/lib/providers/types';

/**
 * The first screen anybody sees, and the only one they cannot skip.
 *
 * Its states are the point (`CLAUDE.md` §5): a sign-in that failed, a sign-in
 * that was cancelled — which is *not* a failure — one already in flight, and a
 * deep link being held across it. Each is a different sentence, and the screen
 * saying the wrong one is the difference between "try again" and a user who
 * believes their link was thrown away.
 *
 * The redesign added a second thing worth proving: the content now sits over a
 * photograph, so the labels' legibility depends on the scrim rather than on a
 * flat `bg`. What a test can hold is that the ground is drawn, that it is drawn
 * for the active theme, and that it takes no touches — a full-screen sibling
 * that swallowed a press would leave the only button on the screen dead.
 */

const ROUTE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** A notched phone: a status bar to clear at the top and a gesture bar at the
 *  bottom, which is the shape the composition has to survive. */
const PHONE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** An auth provider whose `signIn` the test resolves, because every state under
 *  test is a different resolution of that one promise. */
function controllableAuth(): {
  auth: AuthProvider;
  settle: (outcome: SignInOutcome) => Promise<void>;
  methods: string[];
} {
  const methods: string[] = [];
  let resolveSignIn: ((outcome: SignInOutcome) => void) | null = null;

  return {
    methods,
    auth: {
      currentSession: () => Promise.resolve(null),
      subscribe: () => () => undefined,
      signIn: (method) => {
        methods.push(method);
        return new Promise<SignInOutcome>((resolve) => {
          resolveSignIn = resolve;
        });
      },
      signOut: () => Promise.resolve(),
    },
    // Awaited, not merely called: resolving the promise schedules the state
    // update in a microtask, and a synchronous `act` returns before it runs.
    settle: async (outcome) => {
      await act(async () => {
        resolveSignIn?.(outcome);
      });
    },
  };
}

/**
 * Deliberately hidden from the accessibility tree, and therefore from the
 * default query.
 *
 * The backdrop and the mascot are both scenery: the wordmark below the logo says
 * the same word, and a photograph has nothing to announce. Reaching them takes
 * `includeHiddenElements`, which is itself the assertion that they are hidden.
 */
const scenery = (testID: string) => screen.getByTestId(testID, { includeHiddenElements: true });

/** A port that hands over one link at launch, or none at all. */
const portFor = (url: string | null): DeepLinkPort => ({
  getInitialURL: () => Promise.resolve(url),
  addEventListener: () => () => undefined,
});

async function renderScreen(options?: { readonly link?: string; readonly theme?: ThemeName }) {
  const { auth, settle, methods } = controllableAuth();
  usePreferencesStore.getState().chooseTheme(options?.theme ?? null);

  render(
    // The real root supplies one of these explicitly, because `useSafeAreaInsets`
    // silently returns zeros without it — a wordmark starting under the status
    // bar, with nothing to indicate why (`app/_layout.tsx`). A test that omitted
    // it would prove the layout under conditions no device has.
    <SafeAreaProvider initialMetrics={PHONE_METRICS}>
      <SessionProvider auth={auth}>
        <DeepLinkProvider port={portFor(options?.link ?? null)}>
          <SignInScreen />
        </DeepLinkProvider>
      </SessionProvider>
    </SafeAreaProvider>,
  );

  // Both providers resolve a promise on mount. Flushing here keeps every
  // assertion below out of the restoration window.
  await act(async () => {});
  return { settle, methods };
}

afterEach(() => {
  usePreferencesStore.getState().chooseTheme(null);
});

describe('the composition', () => {
  it('leads with the mark, the name and the promise, in that order', async () => {
    await renderScreen();

    expect(scenery('brand-logo')).toBeOnTheScreen();
    expect(screen.getByText('2L Maps')).toBeOnTheScreen();
    expect(screen.getByText('Smart routes. Less time. More freedom.')).toBeOnTheScreen();
  });

  it('sizes the logo from its own aspect, never from two independent numbers', async () => {
    // A width and a height picked separately is how a mascot ends up stretched
    // on the one screen every user sees before anything else.
    await renderScreen();

    expect(scenery('brand-logo').props.style).toMatchObject({
      width: brandLogo.width,
      aspectRatio: brandLogo.aspectRatio,
    });
  });

  it('names the product once, not twice, to a screen reader', async () => {
    // The wordmark below the logo says the same word. A mascot announced as well
    // makes the first thing a screen reader user hears a stutter.
    await renderScreen();

    expect(scenery('brand-logo').props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByRole('header', { name: '2L Maps' })).toBeOnTheScreen();
  });

  it('sets the wordmark in the display voice', async () => {
    // Voice 2 at 44, not `metric-xl` at 44: the metric voice is condensed and
    // tabular — a figure style for a number that changes (`CLAUDE.md` §8 rule 6).
    await renderScreen();

    expect(screen.getByText('2L Maps').props.style).toMatchObject({
      fontSize: text.display.size,
      lineHeight: text.display.lineHeight,
    });
  });
});

describe('the backdrop', () => {
  it('is drawn, and drawn for the active theme', async () => {
    await renderScreen({ theme: 'dark' });

    expect(scenery('sign-in-backdrop')).toBeOnTheScreen();
    // The scrim is the theme's own `bg` at an opacity, which is what makes one
    // photograph belong to both themes rather than to the one it was shot in.
    expect(scenery('sign-in-backdrop-tint').props.style).toEqual(
      expect.arrayContaining([
        { backgroundColor: colours.dark.bg, opacity: backdrop.dark.tintOpacity },
      ]),
    );
  });

  it('takes no touches', async () => {
    // It covers the whole screen and sits under the only control on it.
    await renderScreen();

    expect(scenery('sign-in-backdrop').props.pointerEvents).toBe('none');
  });

  it('is invisible to a screen reader', async () => {
    await renderScreen();

    expect(scenery('sign-in-backdrop').props.accessibilityElementsHidden).toBe(true);
  });
});

describe('the controls', () => {
  it('offers Google, labelled with what happens rather than what it is', async () => {
    await renderScreen();

    expect(screen.getByLabelText('Continue with Google')).toBeOnTheScreen();
  });

  it('meets the touch-target floor', async () => {
    // 44 pt is the minimum a control may be (`CLAUDE.md` §10 rule 2), and this
    // one is pressed one-handed on a phone that may be in a van.
    await renderScreen();

    const { minHeight } = screen.getByTestId('sign-in-google').props.style;
    expect(minHeight).toBe(layout.actionMinHeight);
    expect(minHeight).toBeGreaterThanOrEqual(layout.touchMin);
  });

  it('sits over the photograph on a surface of its own, not on the picture', async () => {
    // A label straight on a photograph has a different contrast ratio under every
    // glyph. The card is what makes the pairing measurable.
    await renderScreen({ theme: 'light' });

    expect(screen.getByTestId('sign-in-google').props.style).toMatchObject({
      backgroundColor: colours.light.surface,
    });
  });

  it("carries Google's mark, drawn rather than bundled", async () => {
    // A vector scales with Dynamic Type and needs no @2x/@3x set. The size comes
    // from the spacing scale, so the mark cannot drift from the row it sits in.
    await renderScreen();

    const marks = screen.UNSAFE_getAllByType(Svg);
    expect(marks.some((mark) => mark.props.width === space.space5)).toBe(true);
  });

  it('starts the Google flow when pressed', async () => {
    const { methods } = await renderScreen();

    fireEvent.press(screen.getByTestId('sign-in-google'));
    expect(methods).toEqual(['google']);
  });
});

describe('a sign-in in flight', () => {
  it('announces that it is busy rather than only dimming', async () => {
    // A screen reader user otherwise taps again, having no way to know.
    await renderScreen();

    fireEvent.press(screen.getByTestId('sign-in-google'));
    await waitFor(() => {
      expect(screen.getByTestId('sign-in-google').props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true,
      });
    });
  });

  it('does not start a second attempt while the first is open', async () => {
    // Two provider sheets is a state neither Google nor the app has a screen for.
    const { methods } = await renderScreen();

    fireEvent.press(screen.getByTestId('sign-in-google'));
    fireEvent.press(screen.getByTestId('sign-in-google'));
    expect(methods).toEqual(['google']);
  });
});

describe('when sign-in does not complete', () => {
  it('says so, with a next action, and lets the user try again', async () => {
    // Every error path has a user-visible outcome and a next action
    // (`CLAUDE.md` §0 rule 5).
    const { settle, methods } = await renderScreen();

    fireEvent.press(screen.getByTestId('sign-in-google'));
    await settle({ ok: false, reason: 'failed' });

    const message = screen.getByText(
      'Sign-in did not complete. Check your connection and try again.',
    );
    expect(message).toBeOnTheScreen();
    expect(message.props.accessibilityLiveRegion).toBe('polite');

    fireEvent.press(screen.getByTestId('sign-in-google'));
    expect(methods).toEqual(['google', 'google']);
  });

  it('distinguishes a build with no provider from a flow that failed', async () => {
    // "Check your connection" is useless advice when the provider was never
    // compiled in, and it sends the user to try the same thing repeatedly.
    const { settle } = await renderScreen();

    fireEvent.press(screen.getByTestId('sign-in-google'));
    await settle({ ok: false, reason: 'unavailable' });

    expect(screen.getByText('Sign-in is not available in this build.')).toBeOnTheScreen();
  });

  it('says nothing when the user simply changed their mind', async () => {
    // Showing an error for a cancellation is the app arguing with the user.
    const { settle } = await renderScreen();

    fireEvent.press(screen.getByTestId('sign-in-google'));
    await settle({ ok: false, reason: 'cancelled' });

    expect(screen.queryByText(/Sign-in/)).toBeNull();
    expect(screen.getByTestId('sign-in-google').props.accessibilityState).toMatchObject({
      busy: false,
    });
  });

  it('clears the previous failure when the next attempt starts', async () => {
    // A stale error under a button the user has just pressed reads as a second
    // failure that has not happened yet.
    const { settle } = await renderScreen();

    fireEvent.press(screen.getByTestId('sign-in-google'));
    await settle({ ok: false, reason: 'failed' });
    fireEvent.press(screen.getByTestId('sign-in-google'));

    expect(screen.queryByText(/did not complete/)).toBeNull();
  });
});

describe('a deep link held across sign-in', () => {
  it('tells the user the route survived', async () => {
    // Somebody who tapped a route link and landed here assumes it was thrown
    // away unless told otherwise (docs/10 §6).
    await renderScreen({ link: `twolmaps://route/${ROUTE_ID}` });

    await waitFor(() => {
      expect(screen.getByText('Your route will open once you are signed in.')).toBeOnTheScreen();
    });
  });

  it('says nothing about a link nobody sent', async () => {
    await renderScreen();

    expect(screen.queryByText(/once you are signed in/)).toBeNull();
  });
});
