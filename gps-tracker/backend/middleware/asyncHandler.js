/**
 * Express 4 does not forward rejected promises from async handlers, so every
 * async route is wrapped in this helper.
 *
 *   router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;
