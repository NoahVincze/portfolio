/**
 * Toy 2D datasets for the MLP playground, in [-1, 1]². Seeded, so a dataset looks the
 * same every time it is picked.
 */
import { random } from '../motion/random.ts';

export type DatasetName = 'moons' | 'circles' | 'spiral' | 'xor';

export interface Dataset {
  /** x, y per point. */
  points: number[];
  /** 0 or 1 per point. */
  labels: number[];
}

export const DATASETS: { name: DatasetName; label: string }[] = [
  { name: 'moons', label: 'Moons' },
  { name: 'circles', label: 'Circles' },
  { name: 'spiral', label: 'Spiral' },
  { name: 'xor', label: 'XOR' },
];

export function makeDataset(name: DatasetName, count = 140, noise = 0.08): Dataset {
  const rand = random(name.length * 7919 + count);
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
  const points: number[] = [];
  const labels: number[] = [];
  const add = (x: number, y: number, label: number) => {
    points.push(Math.max(-0.98, Math.min(0.98, x + gaussian() * noise)), Math.max(-0.98, Math.min(0.98, y + gaussian() * noise)));
    labels.push(label);
  };
  for (let i = 0; i < count; i++) {
    const label = i % 2;
    const t = rand();
    switch (name) {
      case 'moons': {
        // The classic two half-moons: (cos t, sin t) and (1 - cos t, 0.5 - sin t), centred and scaled.
        const angle = Math.PI * t;
        const [x, y] = label ? [1 - Math.cos(angle), 0.5 - Math.sin(angle)] : [Math.cos(angle), Math.sin(angle)];
        add((x - 0.5) * 0.6, (y - 0.25) * 0.9, label);
        break;
      }
      case 'circles': {
        const angle = 2 * Math.PI * t;
        const r = label ? 0.3 : 0.75;
        add(Math.cos(angle) * r, Math.sin(angle) * r, label);
        break;
      }
      case 'spiral': {
        const r = 0.12 + 0.8 * t;
        const angle = 3.2 * Math.PI * t + label * Math.PI;
        add(Math.cos(angle) * r, Math.sin(angle) * r, label);
        break;
      }
      case 'xor': {
        const x = rand() * 1.8 - 0.9;
        const y = rand() * 1.8 - 0.9;
        points.push(x, y);
        labels.push(x * y > 0 ? 1 : 0);
        break;
      }
    }
  }
  return { points, labels };
}
