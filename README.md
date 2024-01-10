# CDKTF Prebuilt provider dashboard

[![Build / Refresh Status](https://github.com/cdktf/cdktf-provider-dashboard/actions/workflows/build.yml/badge.svg)](https://github.com/cdktf/cdktf-provider-dashboard/actions/workflows/build.yml)

This repo publishes the [CDKTF prebuilt provider dashboard](https://cdktf.github.io/cdktf-provider-dashboard/)

The dashboard is a static site written using [11ty](https://www.11ty.dev/) and Github actions that generates every hour (ideally) and fetches the status of all CDKTF pre-built providers and builds a simple dashboard for them.

# Local Testing

In order to test the dashboard locally, you can run the following commands:

```bash
yarn install
yarn serve
```

Then point your browser to http://localhost:8080/cdktf-provider-dashboard/

## Local Data

The local build uses the `repos.json` file within the `_data` folder that has a snapshot of the last run. If you make changes to `scripts/collect-status.js` or want to test latest data, you can run the following command:

```bash
GITHUB_TOKEN=$(gh auth token) ./scripts/collect-status.js
```

Assuming that you have the Github CLI installed and have a valid token. If not, you can run `collect-status` without a token, but it will take a lot longer to run due to rate limiting.

**Note:** It is best practice to commit changes to the `_data/repos.json` file after running the above command. That allows the next time you want to make cosmetic changes to not have to wait for the data to be fetched again.
