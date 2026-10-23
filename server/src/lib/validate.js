import { badRequest } from './errors.js';

// Parse `data` with a zod schema or throw a 400 with field errors.
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Invalid input', result.error.flatten().fieldErrors);
  }
  return result.data;
}
