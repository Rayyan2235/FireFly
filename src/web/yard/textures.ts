import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

// Procedural surface textures, drawn once into canvases. No downloaded image assets.

function make(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1], srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
}

/** Deterministic noise so every reload draws the same surface. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const cache = new Map<string, CanvasTexture>();
const once = (key: string, f: () => CanvasTexture) => cache.get(key) ?? (cache.set(key, f()), cache.get(key)!);

/** Worn asphalt: fine aggregate grain, faint tyre polish, a few dark patches. */
export const asphalt = () =>
  once('asphalt', () =>
    make(
      512,
      512,
      (g) => {
        const r = rng(7);
        g.fillStyle = '#1b1d20';
        g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 26000; i++) {
          const v = 18 + r() * 34;
          g.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
          g.fillRect(r() * 512, r() * 512, 1 + r() * 1.6, 1 + r() * 1.6);
        }
        for (let i = 0; i < 14; i++) {
          const x = r() * 512;
          const y = r() * 512;
          const grad = g.createRadialGradient(x, y, 0, x, y, 20 + r() * 50);
          grad.addColorStop(0, 'rgba(8,9,10,0.35)');
          grad.addColorStop(1, 'rgba(8,9,10,0)');
          g.fillStyle = grad;
          g.fillRect(0, 0, 512, 512);
        }
      },
      [14, 12],
    ),
  );

/** Concrete dock apron: lighter, with saw-cut joints every slab. */
export const concrete = () =>
  once('concrete', () =>
    make(
      256,
      256,
      (g) => {
        const r = rng(11);
        g.fillStyle = '#3a3c3f';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 9000; i++) {
          const v = 48 + r() * 26;
          g.fillStyle = `rgba(${v},${v},${v + 2},0.7)`;
          g.fillRect(r() * 256, r() * 256, 1.4, 1.4);
        }
        g.strokeStyle = 'rgba(14,15,16,0.85)';
        g.lineWidth = 2;
        g.strokeRect(1, 1, 254, 254);
      },
      [10, 2],
    ),
  );

/** Corrugated metal cladding: vertical ribs with soft shading. */
export const cladding = () =>
  once('cladding', () =>
    make(
      128,
      64,
      (g) => {
        const grad = g.createLinearGradient(0, 0, 128, 0);
        for (let k = 0; k <= 8; k++) {
          grad.addColorStop(k / 8, k % 2 ? '#3d4249' : '#2d3137');
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 64);
      },
      [58, 1],
    ),
  );

/** Sectional overhead door: horizontal panels with grooves. */
export const doorPanels = () =>
  once('door', () =>
    make(
      64,
      128,
      (g) => {
        g.fillStyle = '#9aa0a8';
        g.fillRect(0, 0, 64, 128);
        for (let y = 0; y < 128; y += 21) {
          g.fillStyle = '#6e747c';
          g.fillRect(0, y, 64, 2);
          g.fillStyle = '#b4bac1';
          g.fillRect(0, y + 2, 64, 1);
        }
      },
      [1, 1],
    ),
  );

/** Dry-van trailer side: aluminium skin with vertical posts. */
export const trailerSkin = () =>
  once('trailer', () =>
    make(
      256,
      64,
      (g) => {
        g.fillStyle = '#e4e6e9';
        g.fillRect(0, 0, 256, 64);
        for (let x = 0; x < 256; x += 16) {
          g.fillStyle = '#c4c8cd';
          g.fillRect(x, 0, 2, 64);
          g.fillStyle = '#f4f5f6';
          g.fillRect(x + 2, 0, 1, 64);
        }
        g.fillStyle = '#b9bdc3';
        g.fillRect(0, 0, 256, 3);
        g.fillRect(0, 61, 256, 3);
      },
      [1, 1],
    ),
  );
