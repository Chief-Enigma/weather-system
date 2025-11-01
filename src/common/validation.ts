import type { Measurement } from "./types";

export function isInRange(m: Measurement): string | null {
  if (m.temperature < -60 || m.temperature > 60) return "temp out of range";
  if (!Number.isNaN(m.humidity) && (m.humidity < 0 || m.humidity > 100)) return "humidity out of range";
  if (m.pressure < 870 || m.pressure > 1100) return "pressure out of range";
  return null;
}

export function enforceIdempotencyKey(m: Measurement) {
  return `${m.stationId}:${m.seqNo}`;
}
