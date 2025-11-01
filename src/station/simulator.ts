import type { Measurement } from "../common/types";

export class StationSimulator {
  private seqNo = 0;
  private humiditySuspended = false;
  private rainHoldoffCycles = 0; // Hysterese Zähler
  private tempIntervalMs = 5000; // Standard 5s
  private lowPressureStreak = 0; // für Regel B

  constructor(private stationId: string) {}

  private now() { return Date.now(); }

  private randomTemp() { return 15 + (Math.random() * 10 - 5); }
  private randomHumidity() { return 40 + Math.random() * 40; }
  private randomPressure() { return 960 + Math.random() * 80; }
  private detectRain(pressure: number) {
    // simple Heuristik: 15% Regen, etwas wahrscheinlicher bei tiefem Druck
    const base = 0.15 + (pressure < 980 ? 0.1 : 0);
    return Math.random() < base;
  }

  public next(): Measurement {
    const pressure = this.randomPressure();
    const isRaining = this.detectRain(pressure);

    // Regel A: Regen → Feuchte pausieren + Hysterese 3 Zyklen nach Regenende
    if (isRaining) {
      this.humiditySuspended = true;
      this.rainHoldoffCycles = 3;
    } else if (this.humiditySuspended) {
      if (this.rainHoldoffCycles > 0) this.rainHoldoffCycles -= 1;
      if (this.rainHoldoffCycles === 0) this.humiditySuspended = false;
    }

    // Regel B: Low Pressure Boost
    if (pressure < 950) this.lowPressureStreak += 1; else this.lowPressureStreak = 0;
    this.tempIntervalMs = this.lowPressureStreak > 0 ? 2000 : 5000;

    const humidity = this.humiditySuspended ? Number.NaN : this.randomHumidity();

    return {
      stationId: this.stationId,
      seqNo: ++this.seqNo,
      sourceTimestamp: this.now(),
      temperature: this.randomTemp(),
      humidity,
      pressure,
      isRaining,
      humidityStatus: this.humiditySuspended ? "suspended" : "active",
    };
  }

  public currentTempIntervalMs() { return this.tempIntervalMs; }
}
