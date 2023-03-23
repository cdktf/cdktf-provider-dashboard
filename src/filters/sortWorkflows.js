/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

module.exports = function (value) {
    const keys = Object.keys(value)
    return keys.sort((a, b) => a.localeCompare(b)).map(key => [key, value[key]])
};

