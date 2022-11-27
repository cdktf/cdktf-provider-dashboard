const semver = require("semver")
module.exports = (a, b) => {
    if (semver.eq(a, b)) return "latest";
    if (semver.lt(a, b)) return "old"

    return "invalid"
}
