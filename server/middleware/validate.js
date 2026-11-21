// validate({ body, query, params }) with Zod schemas. Replaces the request parts with the parsed
// (trimmed, coerced, unknown-key-stripped) values so controllers only see validated data.
export default function validate(schemas) {
  return (req, res, next) => {
    try {
      for (const part of ["params", "query", "body"]) {
        if (schemas[part]) req[part] = schemas[part].parse(req[part] ?? {});
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
