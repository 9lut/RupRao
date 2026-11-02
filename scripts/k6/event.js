// Load test an event page with k6: https://grafana.com/docs/k6/latest/
// Read-only: people open a public event, its album and thumbnails. Sends no X-Visitor-Id, so the
// organizer's numbers stay untouched. All traffic comes from one IP, like a venue on one Wi-Fi, so
// the per-IP limit (RATE_PUBLIC_PER_MINUTE) counts too: 429s are reported apart from real failures.
//
//   docker run --rm -i -e BASE=https://your.site -e TOKEN=<share token> -e TEST=spike grafana/k6 run - < scripts/k6/event.js
//
// TEST=load    150 people for 2 minutes
// TEST=spike   a jump from 10 to 500 people in 10 seconds, then back (does it recover?)
// TEST=stress  keep adding people until failures pass 20%, then stop: the breaking point
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE = __ENV.BASE;
const TOKEN = __ENV.TOKEN;
const TEST = __ENV.TEST || "load";

const failed = new Rate("real_failures"); // 5xx and network errors, not 429
const outcomes = {}; // which step got which kind of failure, e.g. image_429
for (const step of ["page", "api", "image"]) {
  for (const kind of ["429", "4xx", "5xx", "network"]) outcomes[`${step}_${kind}`] = new Counter(`${step}_${kind}`);
}

function outcome(status) {
  if (status === 0) return "network";
  if (status === 429) return "429";
  if (status >= 500) return "5xx";
  return status >= 400 ? "4xx" : null;
}

const STAGES = {
  load: [
    { duration: "30s", target: 150 },
    { duration: "2m", target: 150 },
    { duration: "15s", target: 0 },
  ],
  spike: [
    { duration: "20s", target: 10 },
    { duration: "10s", target: 500 },
    { duration: "40s", target: 500 },
    { duration: "10s", target: 10 },
    { duration: "40s", target: 10 }, // recovery: this part should look like the start
  ],
  stress: [
    { duration: "1m", target: 200 },
    { duration: "1m", target: 400 },
    { duration: "1m", target: 700 },
    { duration: "1m", target: 1000 },
    { duration: "1m", target: 1500 },
    { duration: "30s", target: 0 },
  ],
};

export const options = {
  scenarios: { people: { executor: "ramping-vus", startVUs: 1, stages: STAGES[TEST], gracefulRampDown: "10s" } },
  thresholds: {
    real_failures: [{ threshold: "rate<0.2", abortOnFail: TEST === "stress", delayAbortEval: "20s" }],
    "http_req_duration{step:api}": ["p(95)<3000"],
  },
  summaryTrendStats: ["med", "p(95)", "max"],
};

function record(res, step) {
  const kind = outcome(res.status);
  if (kind) outcomes[`${step}_${kind}`].add(1);
  failed.add(res.status === 0 || res.status >= 500);
  return res;
}

export default function () {
  record(http.get(`${BASE}/e/${TOKEN}`, { tags: { step: "page" } }), "page");
  record(http.get(`${BASE}/api/public/events/${TOKEN}`, { tags: { step: "api" } }), "api");
  const album = record(http.get(`${BASE}/api/public/events/${TOKEN}/photos?offset=0&limit=60`, { tags: { step: "api" } }), "api");
  if (check(album, { "album loads": (r) => r.status === 200 })) {
    // A phone's first screen, fetched in parallel like a browser does.
    const thumbs = album.json("photos").slice(0, 12).map((p) => ["GET", p.thumbnail_url, null, { tags: { step: "image" } }]);
    http.batch(thumbs).forEach((res) => record(res, "image"));
  }
  sleep(5 + Math.random() * 5); // looking at the photos
}
