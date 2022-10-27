module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("style.css");
  return {
    dir: {
      input: "src",
      data: "_data",
      includes: "_includes",
      layouts: "_layouts"
    },
    pathPrefix: "/check-prebuilt-provider-status/"
  };
}