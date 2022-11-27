function repoHasFailingWorkflow(repo) {
    return Object.values(repo.workflows).some(
        (workflowItems) => workflowItems[0].conclusion != "success"
    );
}

function repoHasPullRequests(repo) {
    return repo.pulls.length > 0
}

function repoHasIssues(repo) {
    return repo.issues.length > 0
}

function withFunction(func) {
    return (a, b) => {
        if (func(a)) return -1;
        else if (func(b)) return 1;
        return 0;
    }
}



// sorts repositories with failing CI to the front
module.exports = function (value) {
    if (!Array.isArray(value))
        throw new Error("Expected an array for sortRepos filter");

    return value
        .sort(withFunction(repoHasFailingWorkflow))
        .sort(withFunction(repoHasPullRequests))
        .sort(withFunction(repoHasIssues))
        .sort((a, b) => {
            return (a.latestRelease.published_at < b.latestRelease.published_at) ? 1 :
                (a.latestRelease.published_at > b.latestRelease.published_at) ? -1 : 0;
        })

};

