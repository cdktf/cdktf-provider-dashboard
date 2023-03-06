
module.exports = function (value) {
    const keys = Object.keys(value)
    return keys.sort((a, b) => a.localeCompare(b)).map(key => [key, value[key]])
};

