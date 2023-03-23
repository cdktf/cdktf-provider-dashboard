/**
* Copyright (c) HashiCorp, Inc.
* SPDX-License-Identifier: MPL-2.0
*/

const fs = require('fs')
const path = require('path')

module.exports = (file, size = 16) => {
    ///Users/mutahhir/src/others/check-prebuilt-provider-status/node_modules/@primer/octicons/build/svg/browser-16.svg 
    let relativeFilePath = path.resolve(`./node_modules/@primer/octicons/build/svg/${file}-${size}.svg`);
    let data = fs.readFileSync(relativeFilePath,
        function (err, contents) {
            if (err) return err
            return contents
        });

    return data.toString('utf8');
}
