const semver = require("semver")
module.exports = (a, b) => {
    try {
        return semver.diff(a, b) === "major"
    } catch (e) {
    }
}
