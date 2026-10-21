// Exact PHP oracle: the PHP reference's OWN inputs and formula, kept apart from every other ticker's pipeline. Nothing here is a calibration for any other ticker
// and nothing in the product imports it for a non-PHP symbol. tests/zone-calibration.test.mjs compares these constants with app/php-reference/index.html.
export const PHP_SNAPSHOT = Object.freeze({
  ticker: 'PHP',
  QHIGH: Object.freeze({ '2025Q3': 34792, '2025Q4': 35183, '2026Q1': 41047, '2026Q2': 41633, '2026Q3': 49400, '2026Q4': 51900 }),
  TD: Object.freeze({ p50n: 0.22, p75n: 0.2675, p50c: 0.2505, p75c: 0.324 }),
});
export function phpLevels(peak) {
  const T = PHP_SNAPSHOT.TD;
  return { n50: peak * (1 - T.p50n), n75: peak * (1 - T.p75n), c50: peak * (1 - T.p50c), c75: peak * (1 - T.p75c) };
}
