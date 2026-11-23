/**
 * Token streaming: text appears the way a language model writes it. After a short pause
 * with a blinking caret (time to first token), the text arrives token by token at an
 * uneven pace, a little slower after punctuation. Beside the caret a small panel shows
 * the decoder's top three candidates for each step with their probabilities; the chosen
 * token is always the most likely one (greedy decoding).
 *
 * Used by reveal-lines.ts for every `[data-reveal="lines"]` element except the hero name.
 * The text is split into token spans in place (links and other markup inside are kept);
 * spans stay inline and only their opacity changes, so the text never reflows and reads
 * normally to screen readers. Once the stream is over, the caret and panel are removed and
 * the spans unwrapped, leaving the element exactly as it was.
 */
import { gsap } from '../gsap';
import { hashString, random } from '../random';
import { displayToken, tokenize } from '../tokenizer';

/** Pause before the first token, in seconds. */
const TIME_TO_FIRST_TOKEN = 0.3;
/** Average time per token, in seconds, adjusted so a long text still finishes in about 1.2 s. */
const STEP = { min: 0.028, max: 0.075, total: 1.2 };
/** Common tokens the decoder "considers" besides the ones in the text itself. */
const VOCABULARY = [' the', ' and', ' a', ' to', ' of', ' with', ' for', ' model', ' data', ' system', ' build', ' learn', ' it', ' is', 'ing', 's', ',', '.'];

interface StreamOptions {
  delay: number;
  scrollTrigger: ScrollTrigger.Vars;
}

/** Replaces the text nodes inside `el` with one span per token. Returns the spans in order. */
function wrapTokens(el: HTMLElement): HTMLElement[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);

  const spans: HTMLElement[] = [];
  for (const node of nodes) {
    if (!node.textContent?.trim()) continue;
    const fragment = document.createDocumentFragment();
    for (const token of tokenize(node.textContent)) {
      if (!token.trim()) {
        fragment.append(token);
        continue;
      }
      const span = document.createElement('span');
      span.className = 'token';
      span.textContent = token;
      fragment.append(span);
      spans.push(span);
    }
    node.replaceWith(fragment);
  }
  return spans;
}

function logitsPanel(): { panel: HTMLElement; rows: { token: HTMLElement; bar: HTMLElement; p: HTMLElement }[] } {
  const panel = document.createElement('span');
  panel.className = 'logits';
  panel.setAttribute('aria-hidden', 'true');
  const rows = [0, 1, 2].map((i) => {
    const row = document.createElement('span');
    row.className = i === 0 ? 'logits__row is-chosen' : 'logits__row';
    const token = document.createElement('span');
    token.className = 'logits__token';
    const track = document.createElement('span');
    track.className = 'logits__track';
    const bar = document.createElement('span');
    bar.className = 'logits__bar';
    track.append(bar);
    const p = document.createElement('span');
    p.className = 'logits__p';
    row.append(token, track, p);
    panel.append(row);
    return { token, bar, p };
  });
  return { panel, rows };
}

/** Sets `el` up to stream its text when its scroll trigger fires. Returns a cleanup function. */
export function streamTokens(el: HTMLElement, { delay, scrollTrigger }: StreamOptions): () => void {
  const original = el.innerHTML;
  const restorePosition = el.style.position;
  const tokens = wrapTokens(el);
  if (!tokens.length) return () => {};

  const rand = random(hashString(el.textContent ?? ''));
  const vocabulary = [...new Set([...tokens.map((t) => t.textContent!), ...VOCABULARY])];
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

  const caret = document.createElement('span');
  caret.className = 'token-caret is-waiting';
  caret.setAttribute('aria-hidden', 'true');
  const { panel, rows } = logitsPanel();
  el.append(caret, panel);

  gsap.set(tokens, { opacity: 0 });
  gsap.set(el, { visibility: 'visible' });

  /** Puts the caret just after token i (or before the first token when i is -1). */
  function placeCaret(i: number): { left: number; bottom: number } {
    const box = el.getBoundingClientRect();
    const rect = tokens[Math.max(0, i)]!.getBoundingClientRect();
    const height = rect.height * 0.78;
    const left = (i < 0 ? rect.left : rect.right) - box.left - el.clientLeft + height * 0.08;
    const top = rect.top - box.top - el.clientTop + (rect.height - height) / 2;
    // A block on body text, a slimmer bar on display headings.
    gsap.set(caret, { x: left, y: top, width: Math.max(2, Math.min(height * 0.42, 6 + height * 0.12)), height });
    return { left, bottom: top + height };
  }

  /** The decoder's top three for token i: the token itself first, two plausible others below. */
  function showLogits(i: number, at: { left: number; bottom: number }): void {
    const chosen = tokens[i]!.textContent!;
    const others = vocabulary.filter((v) => v.trim().toLowerCase() !== chosen.trim().toLowerCase());
    const pick = () => others[Math.floor(rand() * others.length)] ?? ' the';
    const p1 = 0.42 + 0.55 * Math.pow(rand(), 0.6);
    const p2 = (1 - p1) * (0.45 + 0.4 * rand());
    const p3 = Math.min(p2, (1 - p1 - p2) * (0.4 + 0.5 * rand()));
    [
      [chosen, p1],
      [pick(), p2],
      [pick(), p3],
    ].forEach(([token, p], row) => {
      rows[row]!.token.textContent = displayToken(token as string);
      rows[row]!.bar.style.transform = `scaleX(${(p as number).toFixed(3)})`;
      rows[row]!.p.textContent = (p as number).toFixed(2);
    });

    // Below the caret, kept inside the element and the window.
    const box = el.getBoundingClientRect();
    const width = panel.offsetWidth;
    const minLeft = -box.left + 8;
    const maxLeft = Math.min(el.clientWidth, innerWidth - box.left - 8) - width;
    gsap.set(panel, { x: Math.max(minLeft, Math.min(at.left - 6, maxLeft)), y: at.bottom + 8 });
  }

  const step = Math.min(STEP.max, Math.max(STEP.min, STEP.total / tokens.length));
  const timeline = gsap.timeline({ delay, scrollTrigger });
  timeline.call(() => {
    placeCaret(-1);
    caret.classList.add('is-visible');
  });

  let at = TIME_TO_FIRST_TOKEN;
  tokens.forEach((token, i) => {
    timeline.call(
      () => {
        caret.classList.remove('is-waiting');
        const position = placeCaret(i);
        showLogits(i, position);
        panel.classList.add('is-visible');
      },
      [],
      at,
    );
    timeline.to(token, { opacity: 1, duration: 0.18, ease: 'none' }, at);
    const pause = /[.,;:!?]$/.test(token.textContent!) ? 2.4 : 1;
    at += step * (0.55 + rand() * 0.9) * pause;
  });

  // Done: the panel goes, the caret blinks a few times and goes too.
  timeline.call(
    () => {
      panel.classList.remove('is-visible');
      caret.classList.add('is-waiting');
    },
    [],
    at,
  );
  timeline.call(unwrap, [], at + 1.1);

  /** Leaves the element as it was: no caret, no panel, plain text nodes again. */
  function unwrap(): void {
    caret.remove();
    panel.remove();
    for (const token of tokens) token.replaceWith(token.textContent ?? '');
    el.normalize();
    el.style.position = restorePosition;
  }

  return () => {
    timeline.kill();
    if (caret.isConnected) {
      el.innerHTML = original;
      el.style.position = restorePosition;
    }
  };
}
