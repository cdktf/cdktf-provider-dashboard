const { DateTime } = require("luxon");

module.exports = (dateObj) => {
    return DateTime.fromISO(dateObj).toRelative({ style: "short" });
};
