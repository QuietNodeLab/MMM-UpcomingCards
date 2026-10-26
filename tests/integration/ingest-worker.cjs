// Run in a separate process so TZ is set before upstream/date libraries load.
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const runtime = process.env.MM_RUNTIME_PATH;
const fixture = path.join(__dirname, "fixtures", process.argv[2] + ".ics");
Date.now = () => Date.parse(process.argv[3]);
process.env.mmTestMode = "true"; // upstream disables logging and periodic refetch
require(path.join(runtime, "js/alias-resolver.js"));
const CalendarFetcher = require(
  path.join(runtime, "defaultmodules/calendar/calendarfetcher.js"),
);
(async () => {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    res.writeHead(200, { "Content-Type": "text/calendar" });
    res.end(fs.readFileSync(fixture));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/synthetic.ics`;
  const fetcher = new CalendarFetcher(
    url,
    3600000,
    [],
    50,
    60,
    undefined,
    true,
    false,
  );
  let deadline;
  try {
    const events = await new Promise((resolve, reject) => {
      deadline = setTimeout(
        () => reject(new Error("Synthetic ICS ingestion timed out")),
        20000,
      );
      fetcher.onReceive((result) => resolve(result.events));
      fetcher.onError((result, error) => reject(new Error(error.message)));
      fetcher.fetchCalendar();
    });
    console.log(
      JSON.stringify({
        url,
        requests,
        events,
        serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
  } finally {
    clearTimeout(deadline);
    fetcher.httpFetcher.clearTimer();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
