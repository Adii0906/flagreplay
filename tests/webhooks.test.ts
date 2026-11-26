import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyFlagsmithSignature, webhookToEvent } from "@/lib/webhooks";

describe("webhooks", () => {
  it("validates the Flagsmith HMAC signature", () => {
    const body = JSON.stringify({ event_type: "FLAG_UPDATED" });
    const sig = createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(verifyFlagsmithSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyFlagsmithSignature(body, sig, "other")).toBe(false);
    expect(verifyFlagsmithSignature(body, null, "s3cret")).toBe(false);
    expect(verifyFlagsmithSignature(body + " ", sig, "s3cret")).toBe(false);
  });

  it("turns FLAG_UPDATED payloads into timeline events using only provided fields", () => {
    const e = webhookToEvent("1", "2026-11-23T00:00:00Z", {
      event_type: "FLAG_UPDATED",
      data: {
        changed_by: "dev@example.com",
        timestamp: "2026-11-22T10:00:00Z",
        new_state: { enabled: false, feature: { name: "new_checkout" } },
        previous_state: { enabled: true, feature: { name: "new_checkout" } },
      },
    });
    expect(e).toMatchObject({ actor: "dev@example.com", timestamp: "2026-11-22T10:00:00Z", source: "flagsmith_webhook" });
    expect(e!.details).toEqual([{ field: "enabled", old: true, new: false }]);
    expect(webhookToEvent("2", "t", {})).toBeNull();
  });
});
