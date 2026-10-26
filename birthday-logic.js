/* Pure date logic for birthday celebration cards. Works in the browser and in Node (for tests). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BirthdayLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function isLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function daysIn(month, year) {
    return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      month - 1
    ];
  }

  // Accepts "MM-DD" or "YYYY-MM-DD". The year is optional and only used for the age.
  function parseDate(str) {
    const m = /^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/.exec(String(str).trim());
    if (!m) {
      throw new Error('"' + str + '" is not a date (use MM-DD or YYYY-MM-DD)');
    }
    const year = m[1] ? Number(m[1]) : null;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysIn(month, 2024)) {
      throw new Error('"' + str + '" is not a real date');
    }
    return { month, day, year };
  }

  function normalize(data) {
    if (!data || !Array.isArray(data.people)) {
      throw new Error('birthdays file needs a "people" list');
    }
    return data.people.map((p, i) => {
      if (!p || !p.name) {
        throw new Error("person #" + (i + 1) + " has no name");
      }
      const d = parseDate(p.date);
      return {
        name: String(p.name),
        month: d.month,
        day: d.day,
        year: d.year,
        note: p.note ? String(p.note) : null,
      };
    });
  }

  // Who has a birthday on y-m-d. A Feb 29 birthday is celebrated on Feb 28 in non-leap years.
  function onDay(people, y, m, d) {
    return people
      .filter((p) => {
        if (p.month === m && p.day === d) {
          return true;
        }
        return (
          p.month === 2 && p.day === 29 && !isLeap(y) && m === 2 && d === 28
        );
      })
      .map((p) => {
        const age = p.year && y > p.year ? y - p.year : null;
        return { name: p.name, age, note: p.note };
      });
  }

  return { isLeap, parseDate, normalize, onDay };
});
