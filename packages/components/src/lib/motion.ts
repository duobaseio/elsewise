/**
 * The `ease-out-expo` curve of `styles.css`, for motion.
 */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * The transition of one element swapping for another, for a `MotionConfig` around the `AnimatePresence`.
 */
export const SWAP_TRANSITION = {
  duration: 0.15,
  ease: EASE_OUT_EXPO,
  opacity: { duration: 0.15, ease: 'linear' },
} as const;

/**
 * How an element enters and leaves as it swaps for another, spread on a `motion` element in an `AnimatePresence`.
 */
export const SWAP = {
  initial: { opacity: 0, scale: 0.9, filter: 'blur(2px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } },
  exit: { opacity: 0, scale: 0.9, filter: 'blur(2px)' },
} as const;
