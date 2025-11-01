export type HumidityStatus = "active" | "suspended";
export interface Measurement {
  stationId: string;
  seqNo: number;
  sourceTimestamp: number; 
  temperature: number;
  humidity: number; // NaN wenn suspended
  pressure: number;
  isRaining: boolean;
  humidityStatus: HumidityStatus;
}
