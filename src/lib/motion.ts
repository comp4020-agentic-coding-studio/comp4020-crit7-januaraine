import gsap from "gsap";

// Single source of truth for the app's motion language (durations, easing,
// stagger) and for prefers-reduced-motion handling, so neither is duplicated
// across every place that animates something. Checked at call time (not
// cached at module load) so a user flipping the OS setting mid-session is
// respected on the very next animation.
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const DURATION = {
  micro: 0.18,
  transition: 0.25,
  entrance: 0.3,
} as const;

export const STAGGER = 0.06;
export const EASE = "power2.out";

/** Entrance for one or more elements: opacity+translateY(+small scale), staggered. */
export function entranceIn(targets: Element | Element[] | NodeListOf<Element>, opts: { stagger?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    const els = normalize(targets);
    if (els.length === 0) return resolve();
    if (prefersReducedMotion()) {
      gsap.set(els, { opacity: 1, y: 0, scale: 1 });
      return resolve();
    }
    gsap.fromTo(
      els,
      { opacity: 0, y: 12, scale: 0.98 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: DURATION.entrance,
        ease: EASE,
        stagger: opts.stagger ?? STAGGER,
        onComplete: () => resolve(),
      },
    );
  });
}

/** A single, non-repeating emphasis pulse — used to draw attention to an
 * existing card that a newly-added session now clashes with. Never loops. */
export function emphasizeOnce(target: Element | null): void {
  if (!target) return;
  if (prefersReducedMotion()) return;
  gsap.fromTo(
    target,
    { scale: 1 },
    { scale: 1.03, duration: DURATION.micro, ease: EASE, yoyo: true, repeat: 1 },
  );
}

/** Exit tween before a form submits for real — resolves when it's safe to
 * proceed with the actual (unchanged) POST/redirect. */
export function exitOut(target: Element | null): Promise<void> {
  return new Promise((resolve) => {
    if (!target) return resolve();
    if (prefersReducedMotion()) return resolve();
    gsap.to(target, {
      opacity: 0,
      scale: 0.96,
      y: -4,
      duration: DURATION.transition,
      ease: EASE,
      onComplete: () => resolve(),
    });
  });
}

/** Popover open: quick fade+translateY. Caller still owns the `hidden`
 * attribute / aria state — this only handles the visual transition. */
export function popoverIn(target: Element | null): void {
  if (!target) return;
  if (prefersReducedMotion()) {
    gsap.set(target, { opacity: 1, y: 0 });
    return;
  }
  gsap.fromTo(target, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: DURATION.micro, ease: EASE });
}

/** Popover close: quick fade out, then run `onDone` (e.g. to set `hidden`). */
export function popoverOut(target: Element | null, onDone: () => void): void {
  if (!target) return onDone();
  if (prefersReducedMotion()) {
    gsap.set(target, { opacity: 0 });
    return onDone();
  }
  gsap.to(target, { opacity: 0, y: -6, duration: DURATION.micro, ease: EASE, onComplete: onDone });
}

/** Brief "bring to front" emphasis while a conflicted card is hovered/focused.
 * Temporarily overrides the card's server-computed stacking z-index (set
 * inline by the timetable's own overlap layout), restoring the original
 * value on deactivate rather than clearing it.
 *
 * z-index only, deliberately no transform here: the card's own
 * `.clash-popover` is `position: fixed` and JS-positioned relative to the
 * viewport (see `position()` in index.astro) — putting a `transform` on an
 * ancestor of a fixed-position element makes that ancestor its containing
 * block instead of the viewport (CSS spec), which would silently break the
 * popover's on-screen placement while it's open. */
export function bringToFront(target: Element | null, active: boolean): void {
  if (!target || !(target instanceof HTMLElement)) return;
  if (active) {
    if (target.dataset.originalZIndex === undefined) {
      target.dataset.originalZIndex = target.style.zIndex;
    }
    target.style.zIndex = "100";
  } else if (target.dataset.originalZIndex !== undefined) {
    target.style.zIndex = target.dataset.originalZIndex;
  }
}

function normalize(targets: Element | Element[] | NodeListOf<Element>): Element[] {
  if (targets instanceof Element) return [targets];
  return Array.from(targets);
}
