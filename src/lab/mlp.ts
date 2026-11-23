/**
 * A small multilayer perceptron for binary classification in the plane, trained in the
 * browser: tanh hidden layers, a sigmoid output, binary cross-entropy, full-batch Adam
 * with a little L2. Plain TypeScript and typed arrays; no ML library.
 */
import { random } from '../motion/random.ts';

export interface TrainStats {
  loss: number;
  accuracy: number;
}

export class MLP {
  readonly sizes: number[];
  /** Per layer l: weights[l][j * inputs + i] connects input i to unit j. */
  readonly weights: Float64Array[];
  readonly biases: Float64Array[];
  private readonly adam: { m: Float64Array; v: Float64Array }[];
  private step = 0;

  constructor(sizes: number[], seed = 1) {
    this.sizes = sizes;
    this.weights = [];
    this.biases = [];
    this.adam = [];
    const rand = random(seed);
    const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
    for (let l = 0; l < sizes.length - 1; l++) {
      const inputs = sizes[l]!;
      const outputs = sizes[l + 1]!;
      // Xavier initialisation, suited to tanh.
      const scale = Math.sqrt(2 / (inputs + outputs));
      this.weights.push(Float64Array.from({ length: inputs * outputs }, () => gaussian() * scale));
      this.biases.push(new Float64Array(outputs));
    }
    for (const params of this.parameters()) this.adam.push({ m: new Float64Array(params.length), v: new Float64Array(params.length) });
  }

  private parameters(): Float64Array[] {
    return this.weights.flatMap((w, l) => [w, this.biases[l]!]);
  }

  /** Activations of every layer for one input (the last holds the probability of class 1). */
  forward(x: number, y: number): Float64Array[] {
    const activations = [Float64Array.of(x, y)];
    for (let l = 0; l < this.weights.length; l++) {
      const input = activations[l]!;
      const w = this.weights[l]!;
      const b = this.biases[l]!;
      const out = new Float64Array(this.sizes[l + 1]!);
      const last = l === this.weights.length - 1;
      for (let j = 0; j < out.length; j++) {
        let sum = b[j]!;
        for (let i = 0; i < input.length; i++) sum += w[j * input.length + i]! * input[i]!;
        out[j] = last ? 1 / (1 + Math.exp(-sum)) : Math.tanh(sum);
      }
      activations.push(out);
    }
    return activations;
  }

  predict(x: number, y: number): number {
    const activations = this.forward(x, y);
    return activations[activations.length - 1]![0]!;
  }

  /** One full-batch Adam step on points (x, y) with labels 0 or 1. */
  train(xs: Float64Array, labels: Uint8Array, learningRate = 0.02, l2 = 1e-4): TrainStats {
    const n = labels.length;
    const grads = this.parameters().map((p) => new Float64Array(p.length));
    let loss = 0;
    let correct = 0;
    for (let k = 0; k < n; k++) {
      const activations = this.forward(xs[k * 2]!, xs[k * 2 + 1]!);
      const p = activations[activations.length - 1]![0]!;
      const label = labels[k]!;
      loss -= label ? Math.log(Math.max(p, 1e-9)) : Math.log(Math.max(1 - p, 1e-9));
      if ((p >= 0.5 ? 1 : 0) === label) correct++;

      // Backpropagation. For sigmoid + cross-entropy the output delta is simply p - label.
      let delta = Float64Array.of(p - label);
      for (let l = this.weights.length - 1; l >= 0; l--) {
        const input = activations[l]!;
        const w = this.weights[l]!;
        const gw = grads[l * 2]!;
        const gb = grads[l * 2 + 1]!;
        for (let j = 0; j < delta.length; j++) {
          gb[j]! += delta[j]!;
          for (let i = 0; i < input.length; i++) gw[j * input.length + i]! += delta[j]! * input[i]!;
        }
        if (l === 0) break;
        const previous = new Float64Array(input.length);
        for (let i = 0; i < input.length; i++) {
          let sum = 0;
          for (let j = 0; j < delta.length; j++) sum += w[j * input.length + i]! * delta[j]!;
          previous[i] = sum * (1 - input[i]! * input[i]!); // tanh'
        }
        delta = previous;
      }
    }

    // Adam.
    this.step++;
    const [beta1, beta2, epsilon] = [0.9, 0.999, 1e-8];
    const correction1 = 1 - beta1 ** this.step;
    const correction2 = 1 - beta2 ** this.step;
    this.parameters().forEach((params, index) => {
      const g = grads[index]!;
      const { m, v } = this.adam[index]!;
      const isWeight = index % 2 === 0;
      for (let i = 0; i < params.length; i++) {
        const gradient = g[i]! / Math.max(n, 1) + (isWeight ? l2 * params[i]! : 0);
        m[i] = beta1 * m[i]! + (1 - beta1) * gradient;
        v[i] = beta2 * v[i]! + (1 - beta2) * gradient * gradient;
        params[i]! -= (learningRate * (m[i]! / correction1)) / (Math.sqrt(v[i]! / correction2) + epsilon);
      }
    });
    return { loss: n ? loss / n : 0, accuracy: n ? correct / n : 0 };
  }

  get epochs(): number {
    return this.step;
  }
}
