const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");

// Intentionally a separate suite: it needs the documented pinned runtime/modules
// and Chromium, rather than adding third-party packages to the import itself.
if (!process.env.MM_RUNTIME_PATH)
  throw new Error(
    "Set MM_RUNTIME_PATH to the isolated pinned MagicMirror checkout",
  );
const runtime = path.resolve(process.env.MM_RUNTIME_PATH);
const manifest = require("../../runtime-pins.json");
assert.equal(
  execFileSync("git", ["-C", runtime, "rev-parse", "HEAD"]).toString().trim(),
  manifest.magicmirror.commit,
);
const monthly = path.join(runtime, "modules/MMM-MonthlyCalendar");
assert.equal(
  execFileSync("git", ["-C", monthly, "rev-parse", "HEAD"]).toString().trim(),
  manifest.modules.find((m) => m.name === "MMM-MonthlyCalendar").commit,
);
const runtimeRequire = createRequire(path.join(runtime, "package.json"));
const { chromium } = runtimeRequire("playwright");
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.MM_BROWSER_EXECUTABLE
      ? { executablePath: process.env.MM_BROWSER_EXECUTABLE }
      : {}),
  });
});
after(async () => {
  await browser?.close();
});

function ingest(fixture, now, zone) {
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, "ingest-worker.cjs"), fixture, now],
    {
      env: { ...process.env, MM_RUNTIME_PATH: runtime, TZ: zone },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  const result = JSON.parse(output);
  assert.equal(result.requests, 1, "must ingest the actual ICS over HTTP");
  assert.equal(
    result.events.length,
    4,
    "must ingest today, ongoing, expired and tomorrow",
  );
  assert.equal(result.serverTimezone, zone);
  return result;
}

async function redraw(ingested, now) {
  const context = await browser.newContext({
    timezoneId: "America/New_York",
    viewport: { width: 1920, height: 1080 },
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Browser clock is fixed independently of the server process and its timezone.
    await page.clock.install({ time: new Date(now) });
    await page.setContent('<main id="coming-up"></main>');
    await page.evaluate(() => {
      window.definitions = {};
      window.Module = {
        register(name, definition) {
          window.definitions[name] = definition;
        },
      };
      window.Log = { info() {}, debug() {}, warn() {}, error() {} };
      window.config = { timeFormat: 12 };
    });
    for (const script of [
      path.join(runtime, "node_modules/moment/min/moment.min.js"),
      path.join(
        runtime,
        "node_modules/moment-timezone/builds/moment-timezone-with-data.min.js",
      ),
      path.join(runtime, "defaultmodules/calendar/calendarutils.js"),
      path.join(runtime, "defaultmodules/calendar/calendar.js"),
      path.resolve("MMM-UpcomingCards.js"),
      path.join(monthly, "MMM-MonthlyCalendar.js"),
    ])
      await page.addScriptTag({ path: script });
    const result = await page.evaluate(({ events, url }) => {
      const top = Object.assign({}, definitions["MMM-UpcomingCards"]);
      top.config = {
        ...top.defaults,
        timezone: "America/New_York",
        maximumEntries: 20,
      };
      top.events = [];
      top.updateDom = () =>
        document.querySelector("#coming-up").replaceChildren(top.getDom());
      top.start(); // include the real Coming Up minute redraw timer
      const month = Object.assign({}, definitions["MMM-MonthlyCalendar"]);
      month.config = { ...month.defaults };
      month.updateDom = () => {};
      month.start();
      const calendar = Object.assign({}, definitions.calendar);
      calendar.identifier = "synthetic-calendar";
      calendar.calendarData = {};
      calendar.updateDom = () => {};
      calendar.config = {
        ...calendar.defaults,
        calendars: [
          { url, name: "Sample", color: "#4FC3F7", symbol: "calendar" },
        ],
        customEvents: [],
        maximumEntries: 50,
        maximumNumberOfDays: 60,
        pastDaysCount: 60,
        broadcastPastEvents: true,
      };
      let before, after, exclusiveEnds, changedPayloadEnds;
      const rows = () =>
        Array.from(document.querySelectorAll(".uc-event-row"), (row) => ({
          title: row.querySelector(".uc-event-name").textContent,
          when: row.querySelector(".uc-event-when").textContent,
        }));
      calendar.sendNotification = (notification, payload) => {
        exclusiveEnds = Object.fromEntries(
          payload.map((e) => [e.title, +e.endDate]),
        );
        top.notificationReceived(notification, payload, calendar);
        before = rows();
        month.notificationReceived(notification, payload, calendar);
        changedPayloadEnds = Object.fromEntries(
          payload.map((e) => [e.title, +e.endDate]),
        );
        // Same redraw that happens on the minute timer, after another module ran.
        top.updateDom();
        after = rows();
      };
      calendar.socketNotificationReceived("CALENDAR_EVENTS", {
        id: calendar.identifier,
        url,
        events,
        checksum: 1,
      });
      return {
        before,
        after,
        exclusiveEnds,
        changedPayloadEnds,
        storedEnds: Object.fromEntries(
          top.events.map((e) => [e.title, +e.endDate]),
        ),
        dates: Object.fromEntries(
          events.map((e) => [
            e.title,
            new Date(+e.startDate).toLocaleDateString("en-CA"),
          ]),
        ),
      };
    }, ingested);
    // Complete MonthlyCalendar's 5-second handler and Coming Up's minute timer.
    await page.clock.runFor(60001);
    result.afterMinuteRedraw = await page
      .locator(".uc-event-row")
      .evaluateAll((rows) =>
        rows.map((row) => ({
          title: row.querySelector(".uc-event-name").textContent,
          when: row.querySelector(".uc-event-when").textContent,
        })),
      );
    assert.deepEqual(pageErrors, [], "actual frontend handlers must not throw");
    return result;
  } finally {
    await context.close();
  }
}

for (const [fixture, now, today, tomorrow, hours] of [
  ["winter", "2030-01-08T15:00:00Z", "2030-01-08", "2030-01-09", 24],
  ["spring-dst", "2030-03-10T16:00:00Z", "2030-03-10", "2030-03-11", 23],
]) {
  test(`${fixture}: actual UTC ingestion reproduces the New York date/label failure`, async () => {
    const result = await redraw(ingest(fixture, now, "UTC"), now);
    assert.notEqual(
      result.dates["Today only"],
      today,
      "UTC server shifts floating date into previous New York day",
    );
    assert.equal(
      result.before.find((e) => e.title === "Tomorrow only").when,
      "Today",
    );
    assert.equal(
      result.before.some((e) => e.title === "Today only"),
      false,
    );
  });
  test(`${fixture}: aligned server TZ preserves all-day dates through shared notification and redraw`, async () => {
    const ingested = ingest(fixture, now, "America/New_York");
    const result = await redraw(ingested, now);
    const expected = [
      { title: "Ongoing final day", when: "Today" },
      { title: "Today only", when: "Today" },
      { title: "Tomorrow only", when: "Tomorrow" },
    ];
    assert.deepEqual(result.before, expected);
    assert.deepEqual(
      result.after,
      expected,
      "redraw must retain both events on their final day",
    );
    assert.deepEqual(
      result.afterMinuteRedraw,
      expected,
      "normal minute redraw must retain them too",
    );
    assert.ok(
      Object.hasOwn(result.exclusiveEnds, "Expired"),
      "expired event must reach the shared notification",
    );
    assert.equal(result.dates["Today only"], today);
    assert.equal(result.dates["Tomorrow only"], tomorrow);
    for (const title of ["Today only", "Ongoing final day"]) {
      assert.equal(
        result.changedPayloadEnds[title],
        result.exclusiveEnds[title] - 1000,
        "actual MonthlyCalendar must exercise the shared-payload mutation",
      );
      assert.equal(
        result.storedEnds[title],
        result.exclusiveEnds[title],
        "Coming Up must preserve its exclusive end",
      );
    }
    const event = ingested.events.find((e) => e.title === "Today only");
    assert.equal(
      (+event.endDate - +event.startDate) / 3600000,
      hours,
      "DST all-day duration is 23 hours, not a fixed 24",
    );
    const ongoing = ingested.events.find(
      (e) => e.title === "Ongoing final day",
    );
    assert.equal(
      (+ongoing.endDate - +ongoing.startDate) / 3600000,
      hours + 24,
      "multi-day boundary must retain its 47-hour DST span",
    );
  });
}
