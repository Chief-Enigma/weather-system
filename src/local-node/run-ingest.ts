import { startIngestServer } from "./ingest.server";
startIngestServer(parseInt(process.env.INGEST_PORT || "50051", 10));
