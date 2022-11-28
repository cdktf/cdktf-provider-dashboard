function repoCountFailingWorkflows(repo) {
    return Object.values(repo.workflows).reduce(
        (res, workflowItems) => res += workflowItems[0].conclusion === "success" ? 0 : 1
        , 0);
}

function repoHasPullRequests(repo) {
    return repo.pulls.length > 0
}

function repoHasIssues(repo) {
    return repo.issues.length > 0
}

function sortByProblems(a, b) {
    return repoCountFailingWorkflows(b) - repoCountFailingWorkflows(a) ||
        b.pulls.length - a.pulls.length ||
        b.issues.length - a.issues.length ||
        b.latestRelease.published_at.localeCompare(a.latestRelease.published_at)
}



// sorts repositories with failing CI to the front
module.exports = function (value) {
    if (!Array.isArray(value))
        throw new Error("Expected an array for sortRepos filter");

    return value.sort(sortByProblems)
};

