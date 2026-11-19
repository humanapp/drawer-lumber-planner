# Regression tests

The calculator is a self-contained static HTML app. Browser tests use Playwright (Chromium), loading the actual `index.html` from a local static server.

Run locally (Node.js 22+ and Python 3):

```sh
npm install
npx playwright install chromium
npm test
```

Tests cover:
- Startup initialization and visibility of all milling assumption controls
- Loading saved drawer project state on first render
- Persistence of edits and lumber profiles across reloads
- Nominal board-foot purchase accounting for 4/4 S2S versus 8/4 rough, including whole-plank rounding
- Initial crosscut quantities for two resawn layers
- Migration of projects saved before the profile selector existed

Each browser test runs in its own isolated browser context, so test data cannot overwrite a user’s real project. GitHub Actions runs the suite on pushes, pull requests, and manually.
