/**
 * `@vercel/analytics` in tests: the package ships untransformed ES modules, and tests must
 * never send analytics anyway. `track` is a mock (assert on it, or `jest.mock` your own);
 * `<Analytics />` renders nothing.
 */
export const track = jest.fn();
export function Analytics(): null {
  return null;
}
