/**
 * Project cover hover: the image ripples outward from the cursor and its red, green and
 * blue channels pull apart. Drawn on the shared hero canvas (behind the page) while the
 * HTML image steps aside (`.is-shader-active`), so it lines up exactly with the cover.
 *
 * Triggers: mouse hover on `[data-hover-shader]` (a card link), and keyboard focus on it
 * (centred ripple), so the effect is not mouse-only. Covers without an <img> are skipped.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector4,
} from 'three';
import { gsap } from '../gsap';

const vertexShader = /* glsl */ `
  uniform vec4 uRect;
  uniform vec2 uViewport;
  varying vec2 vUv;

  void main() {
    vUv = position.xy;
    vec2 p = uRect.xy + position.xy * uRect.zw;
    gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uMouse;
  uniform vec2 uSize;
  uniform float uStrength;
  uniform float uTime;
  uniform float uRadius;
  uniform float uScale;
  varying vec2 vUv;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    // Rounded corners, matching the HTML frame.
    float edge = roundedBox(vUv * uSize - uSize * 0.5, uSize * 0.5, uRadius);
    float mask = 1.0 - smoothstep(-0.5, 0.5, edge);

    // Match the HTML image's current drift scale, so nothing jumps when they swap.
    vec2 uv = (vUv - 0.5) / uScale + 0.5;

    vec2 aspect = vec2(uSize.x / uSize.y, 1.0);
    vec2 toMouse = (vUv - uMouse) * aspect;
    float dist = length(toMouse);
    vec2 dir = toMouse / max(dist, 0.0001) / aspect;

    float ripple = sin(dist * 30.0 - uTime * 5.0) * exp(-dist * 5.0);
    vec2 base = uv + dir * ripple * 0.015 * uStrength;
    vec2 split = dir * 0.012 * uStrength * exp(-dist * 2.5);

    float r = texture2D(uTexture, base + split).r;
    float g = texture2D(uTexture, base).g;
    float b = texture2D(uTexture, base - split).b;
    gl_FragColor = vec4(vec3(r, g, b) * mask, mask);
  }
`;

const ACTIVE_CLASS = 'is-shader-active';

interface Target {
  link: HTMLElement;
  frame: HTMLElement;
  media: HTMLElement;
  image: HTMLImageElement;
}

export interface HoverEffect {
  mesh: Mesh;
  /** Per frame. Returns true while the effect is visible. */
  update(time: number): boolean;
  /** Puts the HTML image back immediately (before a page snapshot, or when stopping). */
  release(): void;
}

export function createHoverEffect(viewport: Vector2, maxPixelRatio: number): HoverEffect {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const uniforms = {
    uRect: { value: new Vector4() },
    uViewport: { value: viewport },
    uTexture: { value: null as CanvasTexture | null },
    uMouse: { value: new Vector2(0.5, 0.5) },
    uSize: { value: new Vector2(1, 1) },
    uStrength: { value: 0 },
    uTime: { value: 0 },
    uRadius: { value: 8 },
    uScale: { value: 1 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    // The quad is laid out in screen pixels (y down), which flips its winding: draw both sides.
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;

  const textures = new WeakMap<HTMLImageElement, CanvasTexture>();
  const mouse = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };
  let current: Target | null = null;
  let strength = 0;
  let target = 0;
  let classApplied = false;

  /** The cover image drawn at the frame's size (object-fit: cover), as a texture. */
  function textureFor(image: HTMLImageElement, width: number, height: number): CanvasTexture {
    const ratio = Math.min(devicePixelRatio, maxPixelRatio);
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    const cached = textures.get(image);
    if (cached && Math.abs(cached.image.width - w) < 4 && Math.abs(cached.image.height - h) < 4) return cached;
    cached?.dispose();

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);

    const texture = new CanvasTexture(canvas);
    texture.flipY = false;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    textures.set(image, texture);
    return texture;
  }

  function targetFrom(el: Element | null): Target | null {
    const link = el?.closest<HTMLElement>('[data-hover-shader]');
    const frame = link?.querySelector<HTMLElement>('[data-reveal="image"], [data-parallax]');
    const media = frame?.querySelector<HTMLElement>('[data-reveal-media]');
    const image = media?.querySelector('img');
    if (!link || !frame || !media || !image?.complete || !image.naturalWidth) return null;
    return { link, frame, media, image };
  }

  function release(): void {
    current?.frame.classList.remove(ACTIVE_CLASS);
    current = null;
    classApplied = false;
    strength = 0;
    target = 0;
    mesh.visible = false;
  }

  function activate(next: Target, x: number, y: number): void {
    if (current?.link !== next.link) {
      release();
      current = next;
      const rect = next.frame.getBoundingClientRect();
      uniforms.uTexture.value = textureFor(next.image, rect.width, rect.height);
      uniforms.uRadius.value = parseFloat(getComputedStyle(next.frame).borderTopLeftRadius) || 0;
      mouse.x = x;
      mouse.y = y;
    }
    mouse.targetX = x;
    mouse.targetY = y;
    target = 1;
  }

  const localPoint = (frame: HTMLElement, clientX: number, clientY: number) => {
    const rect = frame.getBoundingClientRect();
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height] as const;
  };

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    const next = targetFrom(event.target as Element);
    if (next) activate(next, ...localPoint(next.frame, event.clientX, event.clientY));
  });
  addEventListener(
    'pointermove',
    (event) => {
      if (!current || event.pointerType !== 'mouse') return;
      [mouse.targetX, mouse.targetY] = localPoint(current.frame, event.clientX, event.clientY);
    },
    { passive: true },
  );
  document.addEventListener('pointerout', (event) => {
    if (current && !current.link.contains(event.relatedTarget as Node | null)) target = 0;
  });
  document.addEventListener('focusin', (event) => {
    const el = event.target as Element;
    if (!el.matches(':focus-visible')) return;
    const next = targetFrom(el);
    if (next) activate(next, 0.5, 0.5);
  });
  document.addEventListener('focusout', (event) => {
    if (current && !current.link.contains(event.relatedTarget as Node | null)) target = 0;
  });
  // The page is about to be captured for the transition: show the real image.
  document.addEventListener('astro:before-preparation', release);

  function update(time: number): boolean {
    if (!current) return false;
    if (!current.frame.isConnected) {
      release();
      return false;
    }
    strength += (target - strength) * 0.12;
    if (target === 0 && strength < 0.01) {
      release();
      return false;
    }
    mouse.x += (mouse.targetX - mouse.x) * 0.15;
    mouse.y += (mouse.targetY - mouse.y) * 0.15;

    const rect = current.frame.getBoundingClientRect();
    uniforms.uRect.value.set(rect.left, rect.top, rect.width, rect.height);
    uniforms.uSize.value.set(rect.width, rect.height);
    uniforms.uMouse.value.set(mouse.x, mouse.y);
    uniforms.uStrength.value = strength;
    uniforms.uTime.value = time;
    uniforms.uScale.value = Number(gsap.getProperty(current.media, 'scale')) || 1;
    mesh.visible = true;
    // Swap in the same frame the canvas first draws the cover, so there is no blank frame.
    if (!classApplied) {
      current.frame.classList.add(ACTIVE_CLASS);
      classApplied = true;
    }
    return true;
  }

  return { mesh, update, release };
}
