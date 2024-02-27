/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */


module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("style.css");

  // Filters
  eleventyConfig.addFilter("sortRepos", require('./src/filters/sortRepos'))
  eleventyConfig.addFilter("sortWorkflows", require('./src/filters/sortWorkflows'))
  eleventyConfig.addFilter("daysAgo", require('./src/filters/daysAgo'))
  eleventyConfig.addFilter("isMajorDiff", require('./src/filters/semverCompare'))

  // Shortcodes
  eleventyConfig.addShortcode("githubIcon", require('./src/shortcodes/githubIcon'))

  return {
    dir: {
      input: "src",
      data: "_data",
      includes: "_includes",
      layouts: "_layouts",
    },
    pathPrefix: "/cdktf-provider-dashboard/",
  };
};
