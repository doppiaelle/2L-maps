import type { Point } from './projection';

export interface SceneryRoad {
  readonly id: string;
  readonly from: Point;
  readonly to: Point;
  readonly isArterial: boolean;
  readonly opacity: number;
}

export interface SceneryBlock {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly opacity: number;
}

export interface SceneryArea extends SceneryBlock {
  readonly kind: 'building' | 'park' | 'square';
  readonly blockId: string;
}

export interface SceneryLabel {
  readonly id: string;
  readonly text: string;
  readonly point: Point;
  readonly rotation: number;
  readonly kind: 'road' | 'place';
  readonly opacity: number;
}

export interface Scenery {
  readonly roads: readonly SceneryRoad[];
  readonly blocks: readonly SceneryBlock[];
  readonly areas: readonly SceneryArea[];
  readonly labels: readonly SceneryLabel[];
}

export const SCENERY_MAX_SPAN_METRES = 60_000;
export const FALLOFF = 0.52;
export const MAX_ROADS = 130;
export const MAX_BLOCKS = 80;
export const MAX_AREAS = 130;
export const MAX_LABELS = 24;

const EMPTY: Scenery = { roads: [], blocks: [], areas: [], labels: [] };
const CORRIDOR = 48;
const CROSS_REACH = 96;
const MIN_SEGMENT = 12;
const ROAD_NAMES = [
  'Via Centrale',
  'Corso Verde',
  'Viale Roma',
  'Via Manzoni',
  'Corso Italia',
  'Via Garibaldi',
  'Viale Europa',
  'Via del Mercato',
  'Strada Nord',
  'Via delle Poste',
] as const;

export interface SceneryInputs {
  readonly path: readonly Point[];
  readonly size: { readonly width: number; readonly height: number };
  readonly seed: string;
  readonly metresPerPoint?: number;
}

/**
 * Builds an anonymous town from the route outwards.
 *
 * The route is the spine: two connected service roads follow it, cross streets
 * join those roads, the resulting cells become blocks, and buildings are kept
 * inside those blocks. Nothing is sprayed independently across the viewport.
 */
export function sceneryFor({ path, size, seed, metresPerPoint }: SceneryInputs): Scenery {
  if (size.width <= 0 || size.height <= 0 || path.length < 2) return EMPTY;
  const diagonal = Math.hypot(size.width, size.height);
  if (metresPerPoint !== undefined && diagonal * metresPerPoint > SCENERY_MAX_SPAN_METRES)
    return EMPTY;

  const route = resamplePath(path, 13);
  if (route.length < 2) return EMPTY;

  const random = seededRandom(seed);
  const falloff = diagonal * FALLOFF;
  const roads: SceneryRoad[] = [];
  const blocks: SceneryBlock[] = [];
  const areas: SceneryArea[] = [];
  const labels: SceneryLabel[] = [];

  for (let index = 0; index < route.length - 1; index += 1) {
    const from = route[index];
    const to = route[index + 1];
    if (from === undefined || to === undefined) continue;
    const vector = unitVector(from, to);
    if (vector.length < MIN_SEGMENT) continue;
    const normal = { x: -vector.y, y: vector.x };
    const localWidth = CORRIDOR * (0.84 + random() * 0.28);
    const leftFrom = add(from, normal, localWidth);
    const leftTo = add(to, normal, localWidth);
    const rightFrom = add(from, normal, -localWidth);
    const rightTo = add(to, normal, -localWidth);
    const opacity = fade(distanceToPath(midpoint(from, to), path), falloff);

    pushRoad(
      roads,
      `left-${index}`,
      leftFrom,
      leftTo,
      index % 3 === 0,
      fade(distanceToPath(midpoint(leftFrom, leftTo), path), falloff),
    );
    pushRoadLabel(labels, `left-${index}`, leftFrom, leftTo, seed, index, 0.34);
    pushRoad(
      roads,
      `right-${index}`,
      rightFrom,
      rightTo,
      index % 3 === 0,
      fade(distanceToPath(midpoint(rightFrom, rightTo), path), falloff),
    );
    pushRoadLabel(labels, `right-${index}`, rightFrom, rightTo, seed, index + 3, 0.28);

    // Cross streets connect both route-following roads and continue one block
    // beyond them, so the network reads as a city rather than as rails.
    if (index === 0 || index % 2 === 0) {
      pushRoad(
        roads,
        `cross-${index}`,
        add(from, normal, -CROSS_REACH),
        add(from, normal, CROSS_REACH),
        index % 4 === 0,
        opacity,
      );
      pushRoadLabel(
        labels,
        `cross-${index}`,
        add(from, normal, -CROSS_REACH),
        add(from, normal, CROSS_REACH),
        seed,
        index + 7,
        0.24,
      );
    }

    const segmentLength = vector.length;
    const blockLength = Math.max(18, segmentLength - 14);
    const blockDepth = Math.max(18, localWidth - 14);
    const angle = (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
    const centre = midpoint(from, to);

    for (const side of [-1, 1] as const) {
      if (blocks.length >= MAX_BLOCKS) break;
      const blockCentre = add(centre, normal, side * (localWidth / 2));
      if (!isNearCanvas(blockCentre, size)) continue;
      const block: SceneryBlock = {
        id: `block-${index}-${side}`,
        x: blockCentre.x - blockLength / 2,
        y: blockCentre.y - blockDepth / 2,
        width: blockLength,
        height: blockDepth,
        rotation: angle,
        opacity: Math.max(0.16, opacity * 0.72),
      };
      blocks.push(block);

      const roll = random();
      if (roll < 0.14) {
        areas.push(areaInside(block, `park-${index}-${side}`, 'park', 0.78, 0.72));
        continue;
      }
      if (roll < 0.23) {
        areas.push(areaInside(block, `square-${index}-${side}`, 'square', 0.68, 0.62));
        continue;
      }

      // Two or three anonymous building masses, aligned with and contained by
      // their block. Their shared parent geometry is what prevents floating
      // rectangles and makes the street hierarchy legible at a glance.
      const count = blockLength > 70 ? 3 : 2;
      for (let building = 0; building < count && areas.length < MAX_AREAS; building += 1) {
        const fraction = (building + 0.5) / count;
        const width = Math.max(10, (block.width / count) * 0.64);
        const height = Math.max(9, block.height * (0.46 + random() * 0.22));
        const localX = block.x + block.width * fraction;
        const localY = block.y + block.height / 2 + (random() - 0.5) * block.height * 0.12;
        areas.push({
          id: `building-${index}-${side}-${building}`,
          blockId: block.id,
          kind: 'building',
          x: localX - width / 2,
          y: localY - height / 2,
          width,
          height,
          rotation: angle,
          opacity: Math.max(0.2, opacity * (0.68 + random() * 0.2)),
        });
      }
    }
  }

  const last = route[route.length - 1];
  const previous = route[route.length - 2];
  if (last !== undefined && previous !== undefined) {
    const vector = unitVector(previous, last);
    const normal = { x: -vector.y, y: vector.x };
    pushRoad(
      roads,
      'cross-last',
      add(last, normal, -CROSS_REACH),
      add(last, normal, CROSS_REACH),
      true,
      1,
    );
    pushRoadLabel(
      labels,
      'cross-last',
      add(last, normal, -CROSS_REACH),
      add(last, normal, CROSS_REACH),
      seed,
      99,
      0.22,
    );
  }

  return {
    roads: roads.slice(0, MAX_ROADS),
    blocks,
    areas: areas.slice(0, MAX_AREAS),
    labels: labels.slice(0, MAX_LABELS),
  };
}

function areaInside(
  block: SceneryBlock,
  id: string,
  kind: SceneryArea['kind'],
  widthScale: number,
  heightScale: number,
): SceneryArea {
  const width = block.width * widthScale;
  const height = block.height * heightScale;
  return {
    id,
    blockId: block.id,
    kind,
    x: block.x + (block.width - width) / 2,
    y: block.y + (block.height - height) / 2,
    width,
    height,
    rotation: block.rotation,
    opacity: Math.min(1, block.opacity + 0.2),
  };
}

function pushRoad(
  into: SceneryRoad[],
  id: string,
  from: Point,
  to: Point,
  isArterial: boolean,
  opacity: number,
): void {
  if (into.length >= MAX_ROADS || opacity <= 0.02) return;
  into.push({ id, from, to, isArterial, opacity });
}

function pushRoadLabel(
  into: SceneryLabel[],
  id: string,
  from: Point,
  to: Point,
  seed: string,
  salt: number,
  opacity: number,
): void {
  if (into.length >= MAX_LABELS || opacity <= 0.02) return;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 42) return;

  const name = ROAD_NAMES[Math.abs(hashString(`${seed}:${salt}:${id}`)) % ROAD_NAMES.length];
  if (name === undefined) return;
  into.push({
    id: `label-${id}`,
    text: name,
    point: midpoint(from, to),
    rotation: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
    kind: 'road',
    opacity,
  });
}

function resamplePath(path: readonly Point[], maximum: number): Point[] {
  if (path.length <= maximum) return [...path];
  return Array.from({ length: maximum }, (_, index) => {
    const position = (index * (path.length - 1)) / (maximum - 1);
    const low = Math.floor(position);
    const high = Math.min(path.length - 1, Math.ceil(position));
    const a = path[low] ?? path[0] ?? { x: 0, y: 0 };
    const b = path[high] ?? a;
    const t = position - low;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

function unitVector(from: Point, to: Point): { x: number; y: number; length: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 0, y: 0, length: 0 } : { x: dx / length, y: dy / length, length };
}

function add(point: Point, vector: Point, amount: number): Point {
  return { x: point.x + vector.x * amount, y: point.y + vector.y * amount };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function dominantBearing(path: readonly Point[]): number {
  const first = path[0];
  const last = path[path.length - 1];
  if (first === undefined || last === undefined) return 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

export function distanceToPath(point: Point, path: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if (a !== undefined && b !== undefined) best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function fade(distance: number, falloff: number): number {
  return falloff <= 0 ? 0 : Math.max(0, Math.min(1, 1 - distance / falloff));
}

function isNearCanvas(point: Point, size: { width: number; height: number }): boolean {
  return (
    point.x > -CROSS_REACH &&
    point.x < size.width + CROSS_REACH &&
    point.y > -CROSS_REACH &&
    point.y < size.height + CROSS_REACH
  );
}

export function seededRandom(seed: string): () => number {
  const hash = hashString(seed);
  let state = hash === 0 ? 0x9e3779b9 : hash;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
