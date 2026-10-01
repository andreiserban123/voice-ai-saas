import { z } from "zod";

export const phoneNumberSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use an E.164 phone number, such as +40722123456.");

// Optional business-specific context, such as a preferred practitioner or
// appointment type. No industry-specific fields are required by core intake.
export const requestDetailsSchema = z.record(z.string().min(1).max(100), z.json())
  .refine((details) => JSON.stringify(details).length <= 8000, "Request details must fit within 8000 characters.");

export type RequestDetails = z.infer<typeof requestDetailsSchema>;

/** Construct only after membership verification or verified inbound-number routing. */
export type TenantContext = Readonly<{ companyId: string }>;
