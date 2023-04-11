/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

const { Octokit } = require("@octokit/rest")
const { throttling } = require("@octokit/plugin-throttling")
const { createTokenAuth } = require("@octokit/auth-token")
const fs = require("fs/promises")

/**
 * 
 * @param {Octokit} github 
 * @param {*} orgName 
 * @returns 
 */
async function getPullRequestsForOrg(github, orgName) {
    console.log("Issues for: ", orgName)

    return github.paginate(
        github.search.issuesAndPullRequests,
        {
            q: `org:${orgName} is:pr is:closed -is:merged "chore(deps)!: Updated CDKTF version to \`0.15.0\`"`,
        });

    // const { data } = await github.search.issuesAndPullRequests({
    //         // q=https%3A%2F%2Fgithub.com%2Fcdktf%2Fcdktf-repository-manager%2Factions%2Fruns%2F3939168222+org%3Acdktf+&type=pullrequests
    //     })

    // return data
}

/**
 * 
 * @param {Octokit} github 
 * @param {any} pullRequests 
 * @returns 
 */
async function reopenPullRequests(github, pullRequests) {
    for (const pr of pullRequests) {
        console.log(`Reopening PR: ${pr.html_url}`)

        const repoName = pr.html_url.replace("https://github.com/", "").split("/")[1]

        try {

            await github.pulls.update({
                owner: "cdktf",
                repo: repoName,
                pull_number: pr.number,
                state: "open"
            })
        } catch (e) {
            console.log("Cannot reopen PR, retry: ", pr.html_url)
        }
    }
}

(async function () {
    let authToken

    try {
        const auth = createTokenAuth(process.env.GITHUB_TOKEN)
        authToken = await auth();
    } catch (e) {
        console.log("Unable to get locally passed token, proceeding unauthenticated")
    }

    const OctokitWithPlugins = Octokit.plugin(throttling)
    const github = new OctokitWithPlugins({
        auth: authToken && authToken.token,
        throttle: {
            onRateLimit: (retryAfter) => {
                console.log(`Hitting rate limit, retrying after: ${retryAfter} seconds`)
                return true
            },
            onSecondaryRateLimit: (retryAfter) => {
                console.log(`Hitting secondary rate limit, retrying after: ${retryAfter} seconds`)
                return true
            }
        }
    });

    const pullRequests = await getPullRequestsForOrg(github, "cdktf")

    await fs.writeFile("prs.json", JSON.stringify(pullRequests, null, 2))

    await reopenPullRequests(github, pullRequests)

    console.log("Done")
})()
