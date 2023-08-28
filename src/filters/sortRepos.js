/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */
const semver = require("semver");

function repoCountFailingWorkflows(repo) {
  return Object.values(repo.workflows).reduce(
    (res, workflowItems) =>
      (res += workflowItems[0].conclusion === "success" ? 0 : 1),
    0
  );
}

function isMajorOutofDate(repo) {
  if (!repo.provider) return 0;
  return semver.diff(
    repo.packageJson.cdktf.provider.version,
    repo.provider.latestVersion
  ) === "major"
    ? 1
    : 0;
}

function isPackageManagerOutOfDate(managerKey, repo) {
  if (!repo.provider) return 0;
  if (!repo.packageManagerVersions[managerKey]) return 0;
  return semver.lt(
    repo.packageManagerVersions[managerKey].version,
    repo.latestRelease.tag_name.slice(1)
  )
    ? 1
    : 0;
}

function sortByProblems(a, b) {
  return (
    repoCountFailingWorkflows(b) - repoCountFailingWorkflows(a) ||
    isMajorOutofDate(b) - isMajorOutofDate(a) ||
    isPackageManagerOutOfDate("npm", b) - isPackageManagerOutOfDate("npm", a) ||
    isPackageManagerOutOfDate("maven", b) -
      isPackageManagerOutOfDate("maven", a) ||
    isPackageManagerOutOfDate("pypi", b) -
      isPackageManagerOutOfDate("pypi", a) ||
    isPackageManagerOutOfDate("nuget", b) -
      isPackageManagerOutOfDate("nuget", a) ||
    isPackageManagerOutOfDate("go", b) - isPackageManagerOutOfDate("go", a) ||
    a.latestRelease.published_at.localeCompare(b.latestRelease.published_at) ||
    b.issues.length - a.issues.length ||
    b.pulls.length - a.pulls.length
  );
}

// sorts repositories with failing CI to the front
module.exports = function (value) {
  if (!Array.isArray(value))
    throw new Error("Expected an array for sortRepos filter");

  return value.sort(sortByProblems);
};
