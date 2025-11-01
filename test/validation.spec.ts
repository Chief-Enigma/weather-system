import { describe, it, expect } from "vitest";
import { isInRange } from "../src/common/validation";

describe("validation", () => {
  it("rejects extreme temperature", () => {
    const m:any = {temperature:100, humidity:50, pressure:1000};
    expect(isInRange(m)).toBe("temp out of range");
  });
});
