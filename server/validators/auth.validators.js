import { z } from 'zod';

// bcrypt only reads the first 72 bytes, so longer passwords are rejected instead of silently truncated.
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((v) => Buffer.byteLength(v) <= 72, 'Password is too long (72 bytes max)')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letters and numbers');

export const emailField = z.string().trim().toLowerCase().email('Enter a valid email address').max(120);

export const nameField = z.string().trim().min(2, 'Enter your full name').max(80);
export const phoneField = z.string().trim().regex(/^\+?[0-9 ]{10,14}$/, 'Enter a 10 to 14 digit phone number');
export const addressField = z.string().trim().min(8, 'Enter your full address').max(200);

const adult = (d) => {
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return d <= limit;
};

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  phone: phoneField,
  dob: z.coerce.date({ invalid_type_error: 'Enter a valid date' }).refine(adult, 'You must be at least 18 years old'),
  address: addressField,
  password,
});

// Login does not enforce the password policy, so older passwords keep working.
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password').max(200),
});

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: password })
  .refine((v) => v.currentPassword !== v.newPassword, { path: ['newPassword'], message: 'Choose a different password' });
