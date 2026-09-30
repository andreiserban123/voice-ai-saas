import { z } from "zod";

export const companyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  timezone: z.string().default("Europe/Bucharest").refine((value) => {
    try { new Intl.DateTimeFormat("ro-RO", { timeZone: value }); return true; }
    catch { return false; }
  }, "Expected an IANA timezone"),
  locale: z.literal("ro-RO").default("ro-RO"),
});

const localTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const businessHoursInputSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  opensAt: localTime,
  closesAt: z.union([localTime, z.literal("24:00")]),
}).refine((hours) => hours.opensAt < hours.closesAt, {
  message: "Closing time must follow opening time; split overnight hours across days.",
  path: ["closesAt"],
});
