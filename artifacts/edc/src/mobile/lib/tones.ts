/**
 * Direction-of-travel tones: ahead, slipping, stalled.
 *
 * Distinct from `semantic-colors.ts`, which owns health, risk and outcome —
 * those say what a deal *is*, these say which way it is *moving*, and the
 * three sites that show movement (the week-over-week delta, the velocity mark
 * on a roster card, the days-over-benchmark figure in Analytics) each invented
 * their own copy of the same three classes.
 *
 * 700 in light mode rather than 600. Measured against a white card at 13px,
 * `text-emerald-600` scored 3.44:1 and `text-orange-600` 3.60:1 — both under
 * AA's 4.5 for body text, and both invisible as a problem until something
 * computed them. 700 clears it in every pairing the shell puts them in. Dark
 * mode stays at 400, which was never close to failing.
 */
export const TONE_AHEAD = "text-emerald-700 dark:text-emerald-400";
export const TONE_SLIPPING = "text-orange-700 dark:text-orange-400";
export const TONE_STALLED = "text-red-700 dark:text-red-400";
