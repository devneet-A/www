/**
 * Query-string validation for route handlers. Anything that ends up in an
 * upstream URL must be checked first, so these throw a 400 ApiError.
 */
import "server-only";
import { ApiError } from "./http";

export function intParam(params: URLSearchParams, name: string, opts: { min?: number; max?: number } = {}): number {
  const raw = params.get(name) ?? "";
  if (!/^\d{1,7}$/.test(raw)) throw new ApiError(`${name} must be a number`, 400, "openf1");
  const value = Number(raw);
  if ((opts.min !== undefined && value < opts.min) || (opts.max !== undefined && value > opts.max)) {
    throw new ApiError(`${name} is out of range`, 400, "openf1");
  }
  return value;
}
