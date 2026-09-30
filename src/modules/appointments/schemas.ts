import { z } from "zod";
import { callerIntakeSchema } from "@/modules/calls/schemas";

// Tool input excludes tenant/call IDs. The authenticated session supplies those.
// End time is calculated server-side from the configured service duration.
export const bookingInputSchema = z.object({
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  caller: callerIntakeSchema,
  confirmedByCaller: z.literal(true),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;
