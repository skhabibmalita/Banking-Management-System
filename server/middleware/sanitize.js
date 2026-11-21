// Strips MongoDB operator injection ("$gt", "$where", dotted keys) and prototype-pollution keys
// from body, query and params before any controller sees them.
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (key.startsWith("$") || key.includes(".") || BAD_KEYS.has(key)) delete value[key];
      else value[key] = clean(value[key]);
    }
  }
  return value;
}

export default function sanitize(req, res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
}
