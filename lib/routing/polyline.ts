import type { LatLng } from '@/lib/geo/haversine';

/**
 * Google's encoded polyline format.
 *
 * Decoding happens once, when the optimization result arrives, and the output is
 * memoised. Decoding per render is the second most common cause of map jank in
 * this class of app (docs/24_PERFORMANCE.md), and a 25-stop route's polyline is
 * long enough that it shows.
 *
 * The format stores each coordinate as a signed offset from the previous one,
 * scaled by 1e5, zig-zag encoded, then split into 5-bit chunks written as ASCII
 * with 0x3f added and the continuation bit set on all but the last.
 */

const PRECISION = 1e5;

/**
 * Decode an encoded polyline into coordinates.
 *
 * Returns an empty array for empty input. Malformed input decodes as far as it
 * can rather than throwing: a partially drawn route is a better failure than a
 * blank map with an exception behind it, and the caller has no way to repair the
 * string anyway.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const latResult = decodeValue(encoded, index);
    if (latResult === null) break;
    index = latResult.nextIndex;
    latitude += latResult.value;

    const lngResult = decodeValue(encoded, index);
    if (lngResult === null) break;
    index = lngResult.nextIndex;
    longitude += lngResult.value;

    points.push({ latitude: latitude / PRECISION, longitude: longitude / PRECISION });
  }

  return points;
}

interface DecodedValue {
  readonly value: number;
  readonly nextIndex: number;
}

/** Read one zig-zag encoded varint. Returns null when the string ends mid-value. */
function decodeValue(encoded: string, start: number): DecodedValue | null {
  let result = 0;
  let shift = 0;
  let index = start;

  for (;;) {
    if (index >= encoded.length) return null;
    const charCode = encoded.charCodeAt(index);
    index += 1;
    const chunk = charCode - 63;
    if (chunk < 0) return null;
    result |= (chunk & 0x1f) << shift;
    if (chunk < 0x20) break;
    shift += 5;
    // A value never needs more than six 5-bit chunks; more means corruption, and
    // continuing would shift past 32 bits and silently produce nonsense.
    if (shift > 30) return null;
  }

  // Zig-zag: the low bit is the sign, so odd values are negative.
  const value = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
  return { value, nextIndex: index };
}

/**
 * Encode coordinates into the polyline format.
 *
 * Present so the decoder can be tested against a round trip rather than against
 * hand-written fixtures whose provenance nobody can check later.
 */
export function encodePolyline(points: readonly LatLng[]): string {
  let previousLat = 0;
  let previousLng = 0;
  let output = '';

  for (const point of points) {
    const lat = Math.round(point.latitude * PRECISION);
    const lng = Math.round(point.longitude * PRECISION);
    output += encodeValue(lat - previousLat);
    output += encodeValue(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }

  return output;
}

function encodeValue(value: number): string {
  let shifted = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (shifted >= 0x20) {
    output += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
    shifted >>= 5;
  }
  output += String.fromCharCode(shifted + 63);
  return output;
}
