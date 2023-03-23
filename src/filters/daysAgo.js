/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

const { DateTime } = require("luxon");

module.exports = (dateObj) => {
    return DateTime.fromISO(dateObj).toRelative({ style: "short" });
};
