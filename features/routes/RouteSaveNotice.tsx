import { Pressable, Text, View } from 'react-native';

import { colours, radius, space } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { SaveFailure } from '@/lib/supabase/routes-adapter';

export interface RouteSaveNoticeProps {
  readonly failure: SaveFailure;
  readonly isSaving: boolean;
  onRetry: () => void;
  readonly theme: ThemeName;
}

/** A compact, actionable acknowledgement that the route is still local. */
export function RouteSaveNotice({
  failure,
  isSaving,
  onRetry,
  theme,
}: RouteSaveNoticeProps): React.JSX.Element {
  const palette = colours[theme];

  return (
    <View
      style={{
        marginTop: space.space3,
        paddingHorizontal: space.space3,
        paddingVertical: space.space2,
        borderRadius: radius.radiusMd,
        borderWidth: 1,
        borderColor: palette.danger,
        backgroundColor: palette.dangerSubtle,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.space2,
      }}
      accessibilityRole="alert"
      testID="route-save-notice"
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: '700' }}>
          Route saved on this phone
        </Text>
        <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
          {saveFailureMessage(failure)}
        </Text>
      </View>
      <Pressable
        onPress={onRetry}
        disabled={isSaving}
        accessibilityRole="button"
        accessibilityLabel="Retry saving route to History"
        accessibilityState={{ disabled: isSaving }}
        style={{ minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        testID="route-save-retry"
      >
        <Text style={{ color: palette.danger, fontSize: 13, fontWeight: '700' }}>
          {isSaving ? 'Saving…' : 'Retry'}
        </Text>
      </Pressable>
    </View>
  );
}

function saveFailureMessage(failure: SaveFailure): string {
  switch (failure.kind) {
    case 'offline':
      return 'History will update when the connection returns.';
    case 'unknown-place':
      return 'One address must be refreshed before History can sync.';
    case 'not-permitted':
      return 'Sign in again to sync this route to History.';
    case 'illegal-transition':
      return 'This saved route is already in a later state.';
    default:
      return 'History could not be updated just now.';
  }
}
