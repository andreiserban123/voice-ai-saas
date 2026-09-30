import { z } from "zod";

export const phoneNumberSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use an E.164 phone number, such as +40722123456.");

export const vehicleSchema = z.object({
  make: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  registration: z.string().trim().min(1).max(30).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
});

export type Vehicle = z.infer<typeof vehicleSchema>;

/** Construct only after membership verification or verified inbound-number routing. */
export type TenantContext = Readonly<{ companyId: string }>;
