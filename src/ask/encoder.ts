/**
 * The question encoder: all-MiniLM-L6-v2 (quantised, about 23 MB), the model the site's
 * content was embedded with, running in the visitor's browser through transformers.js.
 * The question never leaves the browser.
 *
 * transformers.js is loaded from the jsDelivr CDN at a pinned version rather than
 * installed from npm, which would pull its native ONNX runtime into every install and
 * build. The model comes from the Hugging Face hub; both are cached by the browser.
 */

// jsDelivr's /+esm build rewrites the library's own imports (onnxruntime-web) to CDN URLs.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/+esm';

type Extractor = (text: string, options: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;

interface ProgressEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

interface Transformers {
  pipeline(
    task: 'feature-extraction',
    model: string,
    options: { dtype: 'q8'; progress_callback?: (event: ProgressEvent) => void },
  ): Promise<Extractor>;
}

export type Encoder = (text: string) => Promise<number[]>;

let loading: Promise<Encoder> | null = null;

/**
 * Starts (once) loading the encoder. `onProgress` receives the share of the model's bytes
 * downloaded so far (0 to 1), when the browser reports it.
 */
export function loadEncoder(model: string, onProgress?: (share: number) => void): Promise<Encoder> {
  loading ??= (async () => {
    const transformers = (await import(/* @vite-ignore */ TRANSFORMERS_URL)) as Transformers;
    const files = new Map<string, { loaded: number; total: number }>();
    const extract = await transformers.pipeline('feature-extraction', model, {
      dtype: 'q8',
      progress_callback: (event) => {
        if (event.status !== 'progress' || !event.file || !event.total) return;
        files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
        const all = [...files.values()];
        onProgress?.(all.reduce((s, f) => s + f.loaded, 0) / all.reduce((s, f) => s + f.total, 0));
      },
    });
    return async (text: string) => Array.from((await extract(text, { pooling: 'mean', normalize: true })).data);
  })();
  // A failed load (offline, blocked CDN) can be retried with the next question.
  loading.catch((error: unknown) => {
    console.warn('[ask] The encoder could not load; using keyword search.', error);
    loading = null;
  });
  return loading;
}
