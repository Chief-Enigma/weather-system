type WindowKey = string; // `${stationId}:${windowStart}`

interface Acc {
  stationId: string;
  windowStart: number;
  windowEnd: number;
  tempSum: number;
  humSum: number;
  humCount: number;
  count: number;
}

const windows = new Map<WindowKey, Acc>();

function floorToMinute(epochMs: number) {
  return Math.floor(epochMs / 60000) * 60000;
}

export function aggregateOnTheFly(m: {
  stationId: string;
  sourceTimestamp: number;
  temperature: number;
  humidity: number | null;
}) {
  const ws = floorToMinute(m.sourceTimestamp);
  const we = ws + 60_000;
  const key = `${m.stationId}:${ws}`;
  let acc = windows.get(key);
  if (!acc) {
    acc = {
      stationId: m.stationId,
      windowStart: ws,
      windowEnd: we,
      tempSum: 0,
      humSum: 0,
      humCount: 0,
      count: 0,
    };
    windows.set(key, acc);
  }

  acc.tempSum += m.temperature;
  acc.count += 1;
  if (m.humidity !== null && !Number.isNaN(m.humidity)) {
    acc.humSum += m.humidity;
    acc.humCount += 1;
  }
  return acc;
}
