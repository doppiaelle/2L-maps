#!/usr/bin/env node
/**
 * Build the coastline the wide view is drawn on.
 *
 * **Committed, because the asset it produces is committed.** A generated file in
 * the repository with no script beside it is a file nobody can regenerate and
 * nobody dares change; this is how `assets/geo/land.json` was made, and running
 * it again must produce the same bytes.
 *
 * Source: Natural Earth 1:110m land polygons, from the project's own vector
 * repository. **Public domain** — the dataset's `LICENSE.md` says "No permission
 * is needed to use Natural Earth. Crediting the authors is unnecessary." — which
 * is why nothing at runtime attributes it and no licence travels with the app
 * beyond the copy kept next to the asset for the record.
 *
 * Why this host: `naciscdn.org` is blocked by this environment's egress proxy
 * and `raw.githubusercontent.com` is not. Both serve the same dataset.
 *
 * Usage: `node scripts/build-landmass.mjs`
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
const LICENCE_SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/LICENSE.md';

const OUT_DIR = path.join(process.cwd(), 'assets', 'geo');
const OUT_FILE = path.join(OUT_DIR, 'land.json');
const LICENCE_FILE = path.join(OUT_DIR, 'LICENSE-natural-earth.md');

/**
 * Degrees below which two points are the same point.
 *
 * About 5.5 km at the equator. The coastline is drawn at national scale and
 * above — a four-stop route across Italy is roughly 900 km across a 390-point
 * canvas, so one point is about 2.3 km and this tolerance is at the edge of
 * visible. Simplifying harder loses Italy's own shape; simplifying less carries
 * bytes nobody can see.
 */
const TOLERANCE = 0.05;

/** Decimal places kept. Two is about 1 km, which is finer than the tolerance
 *  above and is what keeps the file from carrying seventeen digits of noise. */
const PRECISION = 2;

/** The ceiling this asset is allowed to cost the bundle. Beyond it the answer is
 *  a coarser dataset, not a bigger budget (`CLAUDE.md` §6). */
const MAX_BYTES = 150_000;

async function main() {
  const [geojson, licence] = await Promise.all([fetchJson(SOURCE), fetchText(LICENCE_SOURCE)]);

  const rings = [];
  for (const feature of geojson.features ?? []) {
    for (const ring of ringsOf(feature.geometry)) {
      const simplified = simplify(ring, TOLERANCE).map(([lng, lat]) => [round(lng), round(lat)]);
      // A ring needs three distinct corners to enclose anything. Simplification
      // can reduce a small island below that, and an unclosable ring renders as
      // a stray line across the sea.
      if (simplified.length >= 4) rings.push(simplified);
    }
  }

  // `[lng, lat]` pairs rather than objects: the same numbers at a third of the
  // bytes, and `lib/map/landmass.ts` is the only reader.
  const payload = JSON.stringify({ tolerance: TOLERANCE, rings });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, `${payload}\n`, 'utf8');
  await writeFile(LICENCE_FILE, licence, 'utf8');

  const bytes = Buffer.byteLength(payload, 'utf8');
  const summary = `${rings.length} rings, ${(bytes / 1024).toFixed(1)} KB`;

  if (bytes > MAX_BYTES) {
    throw new Error(
      `${summary} exceeds the ${(MAX_BYTES / 1024).toFixed(0)} KB budget. ` +
        'Raise TOLERANCE rather than the budget.',
    );
  }

  process.stdout.write(`assets/geo/land.json — ${summary}\n`);
}

function ringsOf(geometry) {
  if (geometry === null || geometry === undefined) return [];
  // Only the outer ring of each polygon. A hole in a landmass is a lake, and at
  // this scale a lake is a few points wide — it costs bytes and reads as an
  // artefact rather than as water.
  if (geometry.type === 'Polygon') return geometry.coordinates.slice(0, 1);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) => polygon[0]).filter(Boolean);
  }
  return [];
}

/**
 * Ramer–Douglas–Peucker, in degrees.
 *
 * `lib/map/simplify.ts` does the same thing for the route, in canvas points, and
 * is deliberately not reused: it takes `{x, y}` and this takes `[lng, lat]`, and
 * bending one to fit the other would put a build-time concern into a module the
 * app ships. Twenty lines duplicated is cheaper than that coupling
 * (`CLAUDE.md` §12 rule 4).
 */
function simplify(points, tolerance) {
  if (points.length <= 2) return points;

  let index = 0;
  let furthest = 0;
  const [first] = points;
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicular(points[i], first, last);
    if (distance > furthest) {
      furthest = distance;
      index = i;
    }
  }

  if (furthest <= tolerance) return [first, last];

  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

function perpendicular(point, from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - from[0], point[1] - from[1]);

  const t = Math.max(
    0,
    Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / lengthSquared),
  );
  return Math.hypot(point[0] - (from[0] + t * dx), point[1] - (from[1] + t * dy));
}

function round(value) {
  const factor = 10 ** PRECISION;
  return Math.round(value * factor) / factor;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return response.text();
}

await main();
