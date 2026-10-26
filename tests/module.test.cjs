const { test } = require("node:test");
const assert = require("node:assert/strict");
const { frontend, helper } = require("./support.cjs");

test("notification snapshots preserve nested Date values after other modules mutate them", () => {
  const m = frontend({ timezone: "America/New_York", maximumEntries: 20 });
  m.start();
  const events = [
    {
      title: "Today",
      startDate: new Date("2030-01-08T05:00:00Z"),
      endDate: new Date("2030-01-09T05:00:00Z"),
      fullDayEvent: true,
      details: { x: [1] },
    },
  ];
  m.notificationReceived("CALENDAR_EVENTS", events);
  events[0].endDate.setTime(Date.parse("2030-01-08T05:00:00Z"));
  events[0].details.x.push(2);
  assert.equal(m.events[0].details.x.length, 1);
  assert.equal(m.upcoming(new Date("2030-01-08T15:00:00Z")).length, 1);
  m.suspend();
});
test("exclusive ends reject expired events while retaining ongoing final days", () => {
  const m = frontend({ timezone: "America/New_York", maximumEntries: 20 });
  m.events = [
    {
      title: "Final",
      startDate: "2030-01-07",
      endDate: "2030-01-09",
      fullDayEvent: true,
    },
    {
      title: "Expired",
      startDate: "2030-01-07",
      endDate: "2030-01-08",
      fullDayEvent: true,
    },
  ];
  assert.deepEqual(
    Array.from(
      m.upcoming(new Date("2030-01-08T15:00:00Z")),
      (x) => x.event.title,
    ),
    ["Final"],
  );
});
test("birthday mode owns its helper and resolves a portable filename", () => {
  const m = frontend({ mode: "birthdays" });
  m.start();
  assert.equal(m.sent.n, "UPCOMING_BIRTHDAYS_LOAD");
  assert.equal(m.sent.p.dataFile, "birthdays.json");
  const h = helper({
    "birthdays.json": { people: [{ name: "Sample", date: "2000-02-29" }] },
  });
  h.socketNotificationReceived(m.sent.n, m.sent.p);
  m.socketNotificationReceived(h.sent.n, h.sent.p);
  assert.match(m.getDom().textContent, /Sample/);
  m.suspend();
});
test("birthdays use the selected timezone and February 29 fallback", () => {
  const m = frontend(
    { mode: "birthdays", timezone: "America/New_York" },
    "2030-03-01T02:00:00Z",
  );
  m.birthdays = [{ name: "Sample", month: 2, day: 29 }];
  assert.equal(m.nextBirthdays()[0].days, 0);
});
test("calendar payload order, deduplication and limits remain intact", () => {
  const m = frontend({ maximumEntries: 1 });
  const e = {
    title: "Same",
    startDate: "2030-01-09T12:00:00Z",
    endDate: "2030-01-09T13:00:00Z",
  };
  m.events = [
    e,
    e,
    { ...e, title: "Later", startDate: "2030-01-10T12:00:00Z" },
  ];
  assert.equal(m.upcoming(new Date("2030-01-08T12:00:00Z")).length, 1);
});

test("suspend and resume retain stored calendar events until the next broadcast", () => {
  const m = frontend();
  m.start();
  m.notificationReceived("CALENDAR_EVENTS", [
    {
      title: "Sample",
      startDate: "2030-01-09T12:00:00Z",
      endDate: "2030-01-09T13:00:00Z",
    },
  ]);
  m.suspend();
  m.resume();
  assert.equal(m.events[0].title, "Sample");
  m.suspend();
});
