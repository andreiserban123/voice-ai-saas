import { expect, test } from "@playwright/test";

test("persistent host serves voice endpoints without provider credentials", async ({ request }) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  for (const path of ["/api/telephony/twilio/voice", "/api/telephony/twilio/status",
    "/api/telephony/twilio/dial-ended", "/api/voice/openai"]) {
    expect((await request.post(path)).status()).toBe(503);
    const get = await request.get(path);
    expect(get.status()).toBe(405);
    expect(get.headers().allow).toBe("POST");
    expect((await request.post(`${path}?unexpected=1`)).status()).toBe(400);
  }
});
