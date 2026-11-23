/**
 * About page: the skill chips drop into a box when it scrolls into view and can be
 * picked up and thrown around (mouse, trackpad or touch). Matter.js runs the physics;
 * the chips stay a normal HTML list that the physics only moves, so screen readers and
 * text selection see an ordinary list.
 *
 * Markup: `data-physics` on the <ul>, an optional `data-physics-hint` element shown while
 * it runs. Full motion only. Matter.js is loaded only when the box is about to appear.
 */
import type MatterNamespace from 'matter-js';
import { ScrollTrigger } from '../gsap';
import { onFrame } from '../loop';
import { definePageEffect } from '../page';

type Matter = typeof MatterNamespace;

/** Fixed physics step (ms): Matter.js is only stable with a constant step. */
const STEP = 1000 / 60;
const WALL = 400;

definePageEffect(({ reduced }) => {
  const box = document.querySelector<HTMLElement>('[data-physics]');
  if (!box || reduced) return;

  let left = false;
  let stop: (() => void) | null = null;
  ScrollTrigger.create({
    trigger: box,
    start: 'top 85%',
    once: true,
    onEnter: () => {
      void import('matter-js').then(({ default: matter }) => {
        if (!left) stop = run(matter, box);
      });
    },
  });

  return () => {
    left = true;
    stop?.();
  };
});

function run(matter: Matter, box: HTMLElement): () => void {
  const { Bodies, Body, Composite, Constraint, Engine, Sleeping } = matter;
  const chips = [...box.querySelectorAll<HTMLElement>(':scope > li')];
  const hint = box.parentElement?.querySelector<HTMLElement>('[data-physics-hint]');

  // Measure the chips in their normal layout, then hand them to the physics.
  const sizes = chips.map((chip) => ({ w: chip.offsetWidth, h: chip.offsetHeight }));
  box.classList.add('is-physics');
  if (hint) hint.hidden = false;
  for (const chip of chips) chip.dataset.cursor = 'link';

  let width = box.clientWidth;
  let height = box.clientHeight;

  const engine = Engine.create({ enableSleeping: true });
  // Floor, ceiling and sides just outside the box, rebuilt whenever the box changes size.
  let walls: MatterNamespace.Body[] = [];
  const placeWalls = () => {
    Composite.remove(engine.world, walls);
    const wall = (x: number, y: number, w: number, h: number) =>
      Bodies.rectangle(x, y, w, h, { isStatic: true, friction: 0.4 });
    walls = [
      wall(width / 2, height + WALL / 2, width * 3, WALL),
      wall(width / 2, -WALL / 2, width * 3, WALL),
      wall(-WALL / 2, height / 2, WALL, height * 3),
      wall(width + WALL / 2, height / 2, WALL, height * 3),
    ];
    Composite.add(engine.world, walls);
  };
  placeWalls();

  // Chips start scattered across the top half and fall.
  const bodies = chips.map((_, i) => {
    const { w, h } = sizes[i]!;
    return Bodies.rectangle(
      w / 2 + Math.random() * Math.max(1, width - w),
      h / 2 + Math.random() * height * 0.4,
      w,
      h,
      {
        chamfer: { radius: h / 2 },
        angle: (Math.random() - 0.5) * 0.6,
        restitution: 0.35,
        friction: 0.3,
        frictionAir: 0.015,
        density: 0.0015,
      },
    );
  });
  Composite.add(engine.world, bodies);

  const draw = () => {
    bodies.forEach((body, i) => {
      const { w, h } = sizes[i]!;
      chips[i]!.style.transform = `translate(${body.position.x - w / 2}px, ${body.position.y - h / 2}px) rotate(${body.angle}rad)`;
    });
  };
  draw();

  // ---- Dragging: a spring between the pointer and the chip; letting go throws it.
  let drag: { constraint: MatterNamespace.Constraint; chip: HTMLElement; pointerId: number } | null = null;
  const local = (event: PointerEvent) => {
    const rect = box.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onDown = (event: PointerEvent) => {
    const chip = (event.target as Element).closest('li');
    const body = chip ? bodies[chips.indexOf(chip)] : undefined;
    if (!chip || !body || drag) return;
    event.preventDefault();
    const point = local(event);
    Sleeping.set(body, false);
    const constraint = Constraint.create({
      pointA: point,
      bodyB: body,
      pointB: { x: point.x - body.position.x, y: point.y - body.position.y },
      length: 0,
      stiffness: 0.2,
      damping: 0.1,
    });
    Composite.add(engine.world, constraint);
    chip.setPointerCapture(event.pointerId);
    chip.classList.add('is-dragging');
    drag = { constraint, chip, pointerId: event.pointerId };
  };
  const onMove = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) drag.constraint.pointA = local(event);
  };
  const onUp = (event: PointerEvent) => {
    if (drag?.pointerId !== event.pointerId) return;
    Composite.remove(engine.world, drag.constraint);
    drag.chip.classList.remove('is-dragging');
    drag = null;
  };
  box.addEventListener('pointerdown', onDown);
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
  box.addEventListener('pointercancel', onUp);

  // ---- Resizing: move the walls and bring any chip left outside back in.
  const resize = new ResizeObserver(() => {
    width = box.clientWidth;
    height = box.clientHeight;
    placeWalls();
    for (const body of bodies) {
      const x = Math.min(Math.max(body.position.x, 40), width - 40);
      const y = Math.min(Math.max(body.position.y, 20), height - 20);
      if (x !== body.position.x || y !== body.position.y) Body.setPosition(body, { x, y });
      Sleeping.set(body, false);
    }
  });
  resize.observe(box);

  // ---- Simulate only while the box is on screen.
  const onScreen = ScrollTrigger.create({ trigger: box, start: 'top bottom', end: 'bottom top' });
  const stopFrames = onFrame(() => {
    if (!onScreen.isActive) return;
    Engine.update(engine, STEP);
    draw();
  });

  return () => {
    stopFrames();
    onScreen.kill();
    resize.disconnect();
    box.removeEventListener('pointerdown', onDown);
    box.removeEventListener('pointermove', onMove);
    box.removeEventListener('pointerup', onUp);
    box.removeEventListener('pointercancel', onUp);
    Composite.clear(engine.world, false);
    Engine.clear(engine);
    box.classList.remove('is-physics');
    if (hint) hint.hidden = true;
    for (const chip of chips) {
      chip.style.transform = '';
      chip.classList.remove('is-dragging');
      delete chip.dataset.cursor;
    }
  };
}
