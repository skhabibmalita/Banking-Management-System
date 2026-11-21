import ApiError from "../utils/ApiError.js";

export default (req, res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl.split("?")[0]}`));
