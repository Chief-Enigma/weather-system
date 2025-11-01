import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackageDefinition, credentials, Client } from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { StationSimulator } from "./simulator";
import { logger } from "../common/logger";
import type { Measurement } from "../common/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const protoPath = path.resolve(__dirname, "../../proto/ingest.proto");
const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const grpcObj = loadPackageDefinition(packageDef);
const ingest = (grpcObj as any).ingest;

const client: Client = new ingest.DataIngestService(
  "localhost:50051",
  credentials.createInsecure()
);

const sim = new StationSimulator(process.env.STATION_ID || "station-001");

function push(m: Measurement) {
  return new Promise<void>((resolve, reject) => {
    (client as any).Push(m, (err: Error, res: { accepted: boolean; reason: string }) => {
      if (err) return reject(err);
      if (!res.accepted) return reject(new Error(res.reason));
      resolve();
    });
  });
}

(async () => {
  while (true) {
    const m = sim.next();
    logger.info({ stationId: m.stationId, seqNo: m.seqNo }, "sending measurement");
    try {
      await push(m);
      logger.info({ stationId: m.stationId, seqNo: m.seqNo }, "sent ok");
    } catch (e: any) {
      logger.error({ stationId: m.stationId, seqNo: m.seqNo, err: e?.message }, "send failed");
    }
    await new Promise((r) => setTimeout(r, sim.currentTempIntervalMs()));
  }
})();