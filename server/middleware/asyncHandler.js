// Lets controllers be async without try/catch; rejected promises reach the error handler.
export default (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
