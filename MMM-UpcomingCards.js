Module.register("MMM-UpcomingCards", {
  defaults: {
    mode: "comingup",
    maximumEntries: 3,
    maximumNumberOfDays: 5,
    timezone: null, // null follows the browser; set an IANA zone for the calendar.
    birthdayFile: "birthdays.json",
    title: null,
    maxShown: 3,
  },

  start() {
    this.suspend();
    this.events ||= [];
    this.birthdays ||= [];

    if (this.config.mode === "birthdays") {
      const load = () =>
        this.sendSocketNotification("UPCOMING_BIRTHDAYS_LOAD", {
          instanceId: this.identifier,
          dataFile: this.config.birthdayFile,
        });
      load();
      this.timer = setInterval(() => {
        load();
        this.updateDom(300);
      }, 3600000);
    } else {
      this.timer = setInterval(() => this.updateDom(300), 60000);
    }
  },

  notificationReceived(notification, payload) {
    if (this.config.mode !== "comingup" || notification !== "CALENDAR_EVENTS")
      return;

    const data = Array.isArray(payload) ? payload : payload && payload.events;

    if (!Array.isArray(data)) return;
    // Notifications are shared between modules. In particular, MonthlyCalendar
    // rewrites all-day boundaries; keep our original exclusive ends and Dates.
    this.events = structuredClone(data);
    this.updateDom(300);
  },

  suspend() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },
  resume() {
    this.start();
  },
  getScripts() {
    return [this.file("date-utils.js")];
  },
  socketNotificationReceived(notification, payload) {
    if (
      !payload ||
      payload.instanceId !== this.identifier ||
      this.config.mode !== "birthdays"
    )
      return;
    if (notification === "UPCOMING_BIRTHDAYS_DATA") {
      this.birthdays = payload.data;
      this.errorText = null;
      this.updateDom(0);
    } else if (notification === "UPCOMING_BIRTHDAYS_ERROR") {
      this.birthdays = [];
      this.errorText = payload.error;
      this.updateDom(0);
    }
  },

  getStyles() {
    return ["MMM-UpcomingCards.css"];
  },

  date(value) {
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string" && /^\d+$/.test(value))
      return new Date(Number(value));
    return new Date(value);
  },

  daysBetween(a, b) {
    const x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((x - y) / 86400000);
  },

  clock(date) {
    return date.toLocaleTimeString("en-US", {
      ...(this.config.timezone ? { timeZone: this.config.timezone } : {}),
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  },

  calendarDay(date, original) {
    // DATE values describe calendar dates, not UTC instants.
    if (typeof original === "string" && /^\d{4}-\d{2}-\d{2}$/.test(original))
      return Date.parse(original) / 86400000;
    const parts = new Intl.DateTimeFormat("en-US", {
      ...(this.config.timezone ? { timeZone: this.config.timezone } : {}),
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const part = (type) => Number(parts.find((p) => p.type === type).value);
    return Date.UTC(part("year"), part("month") - 1, part("day")) / 86400000;
  },

  eventDaysFromToday(event, start, now) {
    return (
      this.calendarDay(
        start,
        event.fullDayEvent ? event.startDate : undefined,
      ) - this.calendarDay(now)
    );
  },

  upcoming(now = new Date()) {
    const seen = new Set();

    return this.events
      .map((event) => ({
        event,
        start: this.date(event.startDate),
        end: this.date(event.endDate || event.startDate),
      }))
      .filter(({ event, start, end }) => {
        if (!Number.isFinite(+start) || !Number.isFinite(+end)) return false;
        const days = this.eventDaysFromToday(event, start, now);
        if (days > this.config.maximumNumberOfDays) return false;
        if (event.fullDayEvent) {
          // iCalendar's all-day DTEND is exclusive. Ending today means ended yesterday.
          const endDay = event.endDate
            ? this.calendarDay(end, event.endDate)
            : this.calendarDay(start, event.startDate) + 1;
          return endDay > this.calendarDay(now);
        }
        // Include an event that began before today and is still running.
        return end > now;
      })
      .sort((a, b) => a.start - b.start)
      .filter(({ event, start, end }) => {
        const key = [event.title, +start, +end].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, this.config.maximumEntries);
  },

  nextBirthdays() {
    const parts = UpcomingDates.parts(this.config.timezone);
    const today = new Date(parts.year, parts.month - 1, parts.day);

    return this.birthdays
      .map((person) => {
        const month = Number(person.month);
        const day = Number(person.day);

        if (!month || !day) return null;

        let date = new Date(today.getFullYear(), month - 1, day);

        if (month === 2 && day === 29 && date.getMonth() !== 1)
          date = new Date(today.getFullYear(), 1, 28);

        if (this.daysBetween(date, today) < 0) {
          date = new Date(today.getFullYear() + 1, month - 1, day);
          if (month === 2 && day === 29 && date.getMonth() !== 1)
            date = new Date(today.getFullYear() + 1, 1, 28);
        }

        return {
          name: person.name,
          date,
          days: this.daysBetween(date, today),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
      .slice(0, this.config.maxShown);
  },

  element(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    return node;
  },

  getDom() {
    const birthdayMode = this.config.mode === "birthdays";
    const card = this.element("section", "uc-card mode-" + this.config.mode);
    card.appendChild(
      this.element(
        "div",
        "uc-heading",
        this.config.title ||
          (birthdayMode ? "BIRTHDAY COUNTDOWN" : "COMING UP"),
      ),
    );

    const list = this.element("div", "uc-list");

    if (birthdayMode) {
      let birthdays;
      try {
        birthdays = this.nextBirthdays();
      } catch (error) {
        this.errorText = error.message;
        birthdays = [];
      }

      if (this.errorText)
        list.appendChild(this.element("div", "uc-empty", this.errorText));
      if (!birthdays.length && !this.errorText)
        list.appendChild(
          this.element("div", "uc-empty", "No birthdays available"),
        );

      birthdays.forEach((person) => {
        const row = this.element("div", "uc-row");
        const number = this.element("div", "uc-days");

        number.appendChild(
          this.element("strong", "", person.days === 0 ? "🎉" : person.days),
        );
        number.appendChild(
          this.element("small", "", person.days === 1 ? "day" : "days"),
        );

        const info = this.element("div", "uc-detail");
        info.appendChild(this.element("div", "uc-title", "🎂 " + person.name));
        info.appendChild(
          this.element(
            "div",
            "uc-sub",
            person.date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }),
          ),
        );

        row.append(number, info);
        list.appendChild(row);
      });
    } else {
      let events;
      try {
        events = this.upcoming();
      } catch (error) {
        list.appendChild(this.element("div", "uc-empty", error.message));
        card.appendChild(list);
        return card;
      }

      if (!events.length)
        list.appendChild(this.element("div", "uc-empty", "Nothing coming up"));

      // module COMING UP COLUMNS V3
      events.forEach(({ event, start, end }) => {
        const row = this.element("div", "uc-row uc-event-row");

        const color = this.element("div", "uc-event-color");
        if (event.color && /^#[0-9a-f]{3,8}$/i.test(event.color)) {
          color.style.backgroundColor = event.color;
        }

        const name = this.element(
          "div",
          "uc-event-name",
          event.title || "Event",
        );

        let time = "All day";
        if (!event.fullDayEvent) {
          const first = this.clock(start);
          const last = this.clock(end);

          const firstPeriod = first.match(/ (AM|PM)$/);
          const lastPeriod = last.match(/ (AM|PM)$/);

          if (firstPeriod && lastPeriod && firstPeriod[1] === lastPeriod[1]) {
            time = first.replace(/ (AM|PM)$/, "") + "–" + last;
          } else {
            time = first + "–" + last;
          }
        }

        const timeNode = this.element("div", "uc-event-time", time);

        const n = Math.max(
          0,
          this.eventDaysFromToday(event, start, new Date()),
        );
        const when =
          n === 0 ? "Today" : n === 1 ? "Tomorrow" : "In " + n + " days";

        const whenNode = this.element("div", "uc-event-when", when);

        row.append(color, name, timeNode, whenNode);
        list.appendChild(row);
      });
    }

    card.appendChild(list);
    return card;
  },
});
