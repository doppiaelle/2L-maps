import { router } from 'expo-router';
import { useColorScheme } from 'react-native';

import { ImportView } from '@/features/import/ImportView';
import { useImport } from '@/features/import/use-import';
import { useDraftRouteStore } from '@/features/stores';
import { newStopId } from '@/lib/route/route-id';
import { placeTextFrom } from '@/lib/route/stop-text';

/**
 * Import a list — presented over Plan, dismissed back to it
 * ([`docs/10_NAVIGATION_FLOW.md`](../../../docs/10_NAVIGATION_FLOW.md) §6).
 *
 * Composition only. `parsePaste` splits, `useImport` decides whether the model
 * is worth offering, `ImportView` renders. This file reads and hands over.
 *
 * **The stops added here carry no `place_id` yet.** The import produced address
 * *text*, and turning text into a durable key is geocoding's job — which happens
 * on Plan, through the same path that re-resolves an expired coordinate
 * ([ADR-0007](../../../docs/adr/0007-place-id-durable-coordinates-perishable.md)).
 * Inventing an id here would be a key with nothing behind it.
 */
export default function ImportScreen(): React.JSX.Element {
  const scheme = useColorScheme();
  const importState = useImport();
  const addStopToDraft = useDraftRouteStore((store) => store.addStopToDraft);

  return (
    <ImportView
      text={importState.text}
      onTextChange={importState.setText}
      candidates={importState.candidates}
      problems={importState.problems}
      canParse={importState.canParse}
      isParsing={importState.isParsing}
      onParse={importState.parse}
      onEditProblem={importState.editProblem}
      isResolving={importState.isResolving}
      failure={importState.failure}
      onAdd={() => {
        // Geocoded before anything is added. A stop's durable key is its
        // `place_id` (ADR-0007) and one added without it could not be saved,
        // handed off or re-resolved — so the import resolves first and adds
        // only what came back with a key.
        void importState.resolve().then((places) => {
          places.forEach((place, index) => {
            addStopToDraft({
              // Short and generated: an id built from the place id ran past the
              // contract's 64-character ceiling on long addresses, and import is where
              // the longest ones come from.
              id: newStopId(),
              placeId: place.placeId,
              // Left unlabelled: the resolved address is what Plan shows, and a
              // label duplicating it would be noise on every row.
              label: null,
              // The geocoder's address, kept so an imported row reads on the
              // first frame instead of waiting on `/place-details` for text the
              // import already paid for. One line, because a geocode returns a
              // formatted address rather than the two-part split autocomplete
              // gives. Perishable on the thirty-day clock (ADR-0007).
              placeText: placeTextFrom(
                { primaryText: place.address, secondaryText: '' },
                new Date(),
              ),
              note: null,
              position: index,
              entryOrder: index,
              // Not carried over from the geocode. The coordinate arrives on
              // Plan through the shared cache, which is the one path that
              // stamps a refresh date — and a coordinate without one is the
              // single case the expiry rule cannot handle.
              coordinate: null,
            });
          });

          // Stays open when nothing resolved, so the user can see why and fix
          // it. Dismissing on a failed import loses the list they pasted.
          if (places.length > 0) router.back();
        });
      }}
      onDismiss={() => {
        router.back();
      }}
      theme={scheme === 'dark' ? 'dark' : 'light'}
      testID="import-screen"
    />
  );
}
