import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackageDefinition, Server, ServerCredentials, } from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js";
import { isInRange } from "../common/validation";
import { logger } from "../common/logger";
import { credentials, loadPackageDefinition as grpcLoad } from "@grpc/grpc-js";
import http from "node:http";
import { Counter, Histogram, register } from "prom-client";

const ingestAccepted = new Counter({ name: "ingest_accepted_total", help: "accepted by local ingest" });
const ingestRejected = new Counter({ name: "ingest_rejected_total", help: "rejected by local ingest" });
const ingestLatency = new Histogram({ name: "ingest_latency_ms", help: "latency ms", buckets: [5, 10, 25, 50, 100, 250, 500, 1000] });

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

const CENTRAL_ADDR = process.env.CENTRAL_ADDR || "localhost:50052";
const centralClient: any = new (ingest as any).DataIngestService(
  CENTRAL_ADDR,
  credentials.createInsecure()
);

const seen = new Set<string>(); 

function forwardToCentral(m: any): Promise<void> {
  return new Promise((resolve, reject) => {
    centralClient.Push(m, (err: Error, res: { accepted: boolean; reason: string }) => {
      if (err) return reject(err);
      if (!res.accepted) return reject(new Error(res.reason));
      resolve();
    });
  });
}

async function Push(call: ServerUnaryCall<any, any>, cb: sendUnaryData<any>) {
  const start = Date.now();
  const m = call.request;
  const key = `${m.stationId}:${m.seqNo}`;

  if (seen.has(key)) {
    ingestRejected.inc();
    return cb(null, { accepted: false, reason: "duplicate" });
  }
  const v = isInRange(m);
  if (v) {
    ingestRejected.inc();
    return cb(null, { accepted: false, reason: v });
  }

  seen.add(key);
  logger.info({ m }, "accepted measurement");

  try {
    await forwardToCentral(m);
    ingestAccepted.inc();
    ingestLatency.observe(Date.now() - start);
    return cb(null, { accepted: true, reason: "ok" });
  } catch (e: any) {
    logger.error({ err: e?.message }, "forward failed");
    ingestAccepted.inc(); 
    ingestLatency.observe(Date.now() - start);
    return cb(null, { accepted: true, reason: "forward-error" });
  }
}

export function startIngestServer(port = 50051) {
  const server = new Server();
  server.addService(ingest.DataIngestService.service, { Push });
  server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (err, p) => {
    if (err) throw err;
    logger.info({ port: p }, "DataIngestService started");

    const httpPort = Number(process.env.INGEST_METRICS_PORT || 9101);
    const srv = http.createServer(async (req, res) => {
      if (req.url === "/metrics") {
        const metrics = await register.metrics();
        res.writeHead(200, { "Content-Type": register.contentType });
        return res.end(metrics);
      }
      if (req.url === "/healthz") {
        res.writeHead(200); return res.end("ok");
      }
      res.writeHead(404); res.end("not found");
    });
    srv.listen(httpPort, () => logger.info({ port: httpPort }, "ingest metrics server"));
  });
}
