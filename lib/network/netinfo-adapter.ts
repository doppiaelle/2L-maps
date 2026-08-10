import NetInfo from '@react-native-community/netinfo';

import type { ConnectivityPort } from './connectivity';

/**
 * NetInfo behind the port.
 *
 * The only module in the app that imports it (`CLAUDE.md` §0 rule 2), and it
 * does nothing but narrow: two fields out of a state object that also carries
 * cellular generation, SSID, carrier name and signal strength. None of those are
 * the product's business, and several of them are the sort of thing that ends up
 * in a crash breadcrumb by accident (`CLAUDE.md` §9 rule 7).
 *
 * There is no test beside this file because there is nothing here to decide —
 * `connectivityOf` makes every judgement and is tested exhaustively without a
 * radio.
 */
export function createConnectivityPort(): ConnectivityPort {
  return {
    subscribe: (listener) =>
      NetInfo.addEventListener((state) => {
        listener({
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
        });
      }),

    current: async () => {
      const state = await NetInfo.fetch();
      return {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
      };
    },
  };
}
