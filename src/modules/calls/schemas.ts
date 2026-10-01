import { z } from "zod";
import { phoneNumberSchema, requestDetailsSchema } from "@/lib/validation";

export const callerIntakeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: phoneNumberSchema,
  details: requestDetailsSchema.default({}),
  issue: z.string().trim().min(1).max(4000),
});

export type CallerIntake = z.infer<typeof callerIntakeSchema>;
