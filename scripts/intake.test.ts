import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { callerIntakeSchema } from "../src/modules/calls/schemas";
import { bookingInputSchema } from "../src/modules/appointments/schemas";

test("a business can take a booking without industry-specific fields", () => {
  const booking = bookingInputSchema.parse({
    serviceId: randomUUID(),
    startsAt: "2026-10-01T10:00:00+03:00",
    confirmedByCaller: true,
    caller: { name: " Ana Popescu ", phone: "+40722123456", issue: "Consultație inițială" },
  });
  assert.equal(booking.caller.name, "Ana Popescu");
  assert.deepEqual(booking.caller.details, {});
});

test("intake preserves context from different businesses", () => {
  for (const details of [
    { treatment: "Tuns", preferredStylist: "Ștefan" },
    { appointmentType: "Consultație", firstVisit: true },
    { subject: "Consultanță", participants: 3 },
    { make: "Dacia", model: "Logan" },
  ]) {
    const caller = callerIntakeSchema.parse({ name: "Ana", phone: "+40722123456", issue: "Programare", details });
    assert.deepEqual(caller.details, details);
  }
});

test("intake rejects invalid or oversized details and still requires caller confirmation", () => {
  const caller = { name: "Ana", phone: "+40722123456", issue: "Programare" };
  for (const details of [[], "text", { value: Infinity }, { note: "a".repeat(8001) }]) {
    assert.equal(callerIntakeSchema.safeParse({ ...caller, details }).success, false);
  }
  assert.equal(bookingInputSchema.safeParse({
    serviceId: randomUUID(), startsAt: "2026-10-01T10:00:00+03:00", caller, confirmedByCaller: false,
  }).success, false);
});
