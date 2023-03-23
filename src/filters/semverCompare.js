/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

const semver = require("semver")
module.exports = (a, b) => {
    try {
        return semver.diff(a, b) === "major"
    } catch (e) {
    }
}
