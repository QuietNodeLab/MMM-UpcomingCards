(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UpcomingDates = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function parts(timezone, debugDate, now = new Date()) {
    const values = {};
    new Intl.DateTimeFormat("en-US", {
      ...(timezone ? { timeZone: timezone } : {}),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .forEach((p) => {
        if (p.type !== "literal") values[p.type] = Number(p.value);
      });
    if (debugDate) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(debugDate);
      if (!m) throw Error("debugDate must use YYYY-MM-DD");
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (d.toISOString().slice(0, 10) !== debugDate)
        throw Error("debugDate is not a real date");
      values.year = +m[1];
      values.month = +m[2];
      values.day = +m[3];
    }
    values.ymd = [
      values.year,
      String(values.month).padStart(2, "0"),
      String(values.day).padStart(2, "0"),
    ].join("-");
    return values;
  }
  return { parts };
});
