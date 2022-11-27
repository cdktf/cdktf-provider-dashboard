function repoHasFailingWorkflow(repo) {
    return Object.values(repo.workflows).some(
        (workflowItems) => workflowItems[0].conclusion != "success"
    );
}

// sorts repositories with failing CI to the front
module.exports = function (value) {
    if (!Array.isArray(value))
        throw new Error("Expected an array for sortRepos filter");

    return value.sort(function (a, b) {
        if (repoHasFailingWorkflow(a)) {
            return -1;
        } else if (repoHasFailingWorkflow(b)) {
            return 1;
        }
        return 0;
    });
};

