import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { loadPackageDefinition, Server, ServerCredentials } from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { Counter, Histogram, register } from "prom-client";
import { save } from "./storage";
import { upsertAggregate } from "./storage"; 
import { aggregateOnTheFly } from "./aggregator"; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const protoPath = path.resolve(__dirname, "../../proto/ingest.proto");
const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const grpcObj = loadPackageDefinition(packageDef);
const ingest = (grpcObj as any).ingest;

const accepted = new Counter({ name: "central_ingest_accepted_total", help: "accepted msgs" });
const latency = new Histogram({ name: "central_ingest_latency_ms", help: "ingest latency ms", buckets: [5,10,25,50,100,250,500,1000] });

function Push(call: any, cb: any) {
  const start = Date.now();
  const m = call.request;

  console.log(JSON.stringify({ level: 30, msg: "central received", stationId: m.stationId, seqNo: m.seqNo }));
  save({
    stationId: m.stationId,
    seqNo: Number(m.seqNo),
    sourceTimestamp: Number(m.sourceTimestamp),
    temperature: m.temperature,
    humidity: m.humidity ?? null,
    pressure: m.pressure,
    isRaining: m.isRaining ? 1 : 0,
    humidityStatus: m.humidityStatus,
  });

  const acc = aggregateOnTheFly({
    stationId: m.stationId,
    sourceTimestamp: Number(m.sourceTimestamp),
    temperature: m.temperature,
    humidity: m.humidity ?? null,
  });

  upsertAggregate({
    stationId: acc.stationId,
    windowStart: acc.windowStart,
    windowEnd: acc.windowEnd,
    avgTemperature: acc.count > 0 ? acc.tempSum / acc.count : null,
    avgHumidity: acc.humCount > 0 ? acc.humSum / acc.humCount : null,
    count: acc.count,
  });
  
  accepted.inc();
  latency.observe(Date.now() - start);
  cb(null, { accepted: true, reason: "ok" });
}

export function startCentral(port = Number(process.env.CENTRAL_PORT || 50052)) {
  const server = new Server();
  server.addService(ingest.DataIngestService.service, { Push });
  server.bindAsync(`0.0.0.0:${port}`, ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) throw err;
    console.log(JSON.stringify({ level: 30, msg: "Central started", port: boundPort }));

    const httpPort = Number(process.env.METRICS_PORT || 9100);
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
    srv.listen(httpPort, () => console.log(JSON.stringify({ level: 30, msg: "metrics", port: httpPort })));
  });
}
