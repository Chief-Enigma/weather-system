import Database from "better-sqlite3";

export interface DbMeasurement {
  stationId: string;
  seqNo: number;
  sourceTimestamp: number;
  temperature: number;
  humidity: number | null;   // NaN kommt als null rein
  pressure: number;
  isRaining: number;         // 0/1
  humidityStatus: "active" | "suspended";
}

const db = new Database(process.env.DB_FILE || "central.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stationId TEXT NOT NULL,
  seqNo INTEGER NOT NULL,
  sourceTimestamp INTEGER NOT NULL,
  temperature REAL NOT NULL,
  humidity REAL,
  pressure REAL NOT NULL,
  isRaining INTEGER NOT NULL,
  humidityStatus TEXT NOT NULL,
  UNIQUE(stationId, seqNo)
);
`);

const insertStmt = db.prepare(`
INSERT OR IGNORE INTO measurements
(stationId, seqNo, sourceTimestamp, temperature, humidity, pressure, isRaining, humidityStatus)
VALUES (@stationId, @seqNo, @sourceTimestamp, @temperature, @humidity, @pressure, @isRaining, @humidityStatus)
`);

export function save(m: DbMeasurement) {
  return insertStmt.run(m);
}

// ...bestehender Code oben bleibt...

db.exec(`
CREATE TABLE IF NOT EXISTS aggregates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stationId TEXT NOT NULL,
  windowStart INTEGER NOT NULL, -- epoch ms (inkl. Minute, Sekunden=0)
  windowEnd   INTEGER NOT NULL, -- windowStart + 60_000
  avgTemperature REAL,
  avgHumidity REAL,
  count INTEGER NOT NULL,
  UNIQUE(stationId, windowStart)
);
`);

const upsertAggStmt = db.prepare(`
INSERT INTO aggregates
(stationId, windowStart, windowEnd, avgTemperature, avgHumidity, count)
VALUES (@stationId, @windowStart, @windowEnd, @avgTemperature, @avgHumidity, @count)
ON CONFLICT(stationId, windowStart) DO UPDATE SET
  avgTemperature=excluded.avgTemperature,
  avgHumidity=excluded.avgHumidity,
  count=excluded.count
`);

export function upsertAggregate(a: {
  stationId: string;
  windowStart: number;
  windowEnd: number;
  avgTemperature: number | null;
  avgHumidity: number | null;
  count: number;
}) {
  return upsertAggStmt.run(a);
}