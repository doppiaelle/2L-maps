/* eslint-disable @typescript-eslint/no-explicit-any -- see the note below. */
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

/**
 * `react-native-maps` under Jest.
 *
 * The SDK is a native module: under Jest there is no native side, so importing
 * the real package renders nothing and any imperative call throws. Mocking the
 * map is explicitly allowed and expected — mock the network, mock the map, mock
 * the clock, never the function under test (`CLAUDE.md` §5). This is also half
 * of why `<AppMap>` exists at all ([ADR-0005](../docs/adr/0005-map-engine-and-route-preview.md)):
 * one mockable seam instead of a native dependency reaching into every screen.
 *
 * Every component here renders a host `View` carrying its props, so a test can
 * assert **what was asked of the SDK** — the polyline's colour and dash, the
 * marker coordinates, the Map ID — rather than what a screenshot looks like.
 * Those are the facts the facade is responsible for, and they are invisible to
 * any other kind of test.
 *
 * `any` is disabled for this file alone. A mock's job is to accept whatever the
 * real component's prop types accept, and restating those types here would
 * duplicate the SDK's surface — the exact coupling the facade removes.
 */

const passthrough = (testID: string) =>
  function Mock(props: any) {
    return (
      <View testID={testID} {...props}>
        {props.children}
      </View>
    );
  };

export interface MockMapHandle {
  fitToCoordinates: (coordinates: unknown, options: unknown) => void;
  animateCamera: (camera: unknown, options?: unknown) => void;
  setCamera: (camera: unknown) => void;
  takeSnapshot: (options: unknown) => Promise<string>;
}

/** The calls the component made, so a test can assert the camera was fitted with
 *  the padding the sheet needs rather than merely that a map rendered. */
export const mapCalls: {
  fitToCoordinates: { coordinates: unknown; options: unknown }[];
  animateCamera: { camera: unknown; options: unknown }[];
  setCamera: unknown[];
  snapshots: number;
} = { fitToCoordinates: [], animateCamera: [], setCamera: [], snapshots: 0 };

export function resetMapCalls(): void {
  mapCalls.fitToCoordinates = [];
  mapCalls.animateCamera = [];
  mapCalls.setCamera = [];
  mapCalls.snapshots = 0;
}

const MapView = forwardRef<MockMapHandle, any>(function MapView(props, ref) {
  useImperativeHandle(ref, () => ({
    fitToCoordinates: (coordinates: unknown, options: unknown) => {
      mapCalls.fitToCoordinates.push({ coordinates, options });
    },
    animateCamera: (camera: unknown, options?: unknown) => {
      mapCalls.animateCamera.push({ camera, options });
    },
    setCamera: (camera: unknown) => {
      mapCalls.setCamera.push(camera);
    },
    takeSnapshot: () => {
      mapCalls.snapshots += 1;
      return Promise.resolve('data:image/png;base64,mock');
    },
  }));

  return (
    <View testID="map-view" {...props}>
      {props.children}
    </View>
  );
});

export const Marker = passthrough('map-marker');
export const Polyline = passthrough('map-polyline');
export const Callout = passthrough('map-callout');

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = undefined;

export default MapView;
