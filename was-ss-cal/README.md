# was-ss-cal

Saltspring Island course calendar for [wildaboutsailing.com](https://wildaboutsailing.com).

A thin config Worker: it serves ~25 lines of JavaScript that register one calendar with the shared engine. All rendering, Corsizio fetching, modal logic, and styling live in `was-cal-engine` — not here. Read the header comment in `was-ss-cal.js` before changing anything.

Part of the `pubweb-workers` monorepo. Each Worker is a folder with its own `wrangler.toml`.

## Deploying

**Via CI (this Worker only).** `.github/workflows/deploy-was-ss-cal.yml` at the repo root deploys on push to `main`, but only when files under `was-ss-cal/` change. Requires two repository secrets:

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → **Edit Cloudflare Workers** template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → right sidebar |

Use the Workers-scoped token template rather than a global API key — if it leaks, the blast radius is Workers only.

**By hand.** From inside this folder:

```bash
npx wrangler login     # once per machine
npx wrangler deploy
```

The other thirteen Workers in this repo are still deployed by hand. CI is being added one Worker at a time; `was-cal-engine` should go last, since every calendar depends on it.

## Wiring it into Carrd

Carrd strips inline `<script>` blocks from embeds. Only `src` attributes survive — that constraint is the entire reason these Workers exist.

Two embed elements on the Saltspring page:

```html
<div id="was-ss-cal-root"></div>
```

```html
<script src="https://was-ss-cal.dave-6bf.workers.dev/"></script>
```

The div goes where you want the button. The script tag can go anywhere on the page.

## Troubleshooting

**Nothing renders.** In the browser console:

```js
window.WASCalQueue.length                     // should be ≥ 1
window.WASCalEngineLoaded                     // should be true
document.getElementById("was-ss-cal-root")    // should not be null
```

Empty queue means this Worker's script didn't run — check the script tag. Null root div means the ID in Carrd doesn't match the `root` string in `was-ss-cal.js`.

**Calendar renders but is empty.** The `match` function isn't matching any course name. Check what Corsizio actually returns:

```bash
curl -s https://corzisio-worker-learn-datesandspots.dave-6bf.workers.dev \
  | python3 -c "import sys,json;[print(i['name']) for i in json.load(sys.stdin)['list']]"
```

Course renames in Corsizio are the usual culprit, and the failure is silent. Not hypothetical: as of August 2026 `was-lts-camp-cal` matches `"three-day"` and renders empty on two live pages, because no course by that name exists any more.

**Changes not showing.** Responses carry `Cache-Control: max-age=300`. Hard-refresh, or append `?v=<timestamp>` to the script src while testing.

## Known limitation: no date filtering

The engine calls `isMatch(e.name)` and passes only the course name. Configs cannot filter on date, price, location, or spots remaining.

This calendar shows September dates because both Saltspring offerings happen to fall in September 2026 — not because anything here enforces it.

To enable month filtering, change one line in `was-cal-engine` (around line 556):

```js
if (!isMatch(e.name)) return false;      // before
if (!isMatch(e.name, e)) return false;   // after
```

Every existing config ignores the second argument, so nothing else breaks. Configs could then do:

```js
match: function(name, event) {
  var n = name.toLowerCase();
  if (n.indexOf("saltspring") === -1) return false;
  return new Date(event.startDate).getUTCMonth() === 8;   // September
}
```

Hard-coding a month means someone must remember to change it next season. Prefer the name-only filter unless there's a real reason to lock the month.

## Sibling Workers

All in this repo, each with its own `wrangler.toml`.

| Worker | Purpose |
|---|---|
| `was-cal-engine` | Shared calendar UI. Every config Worker depends on it. |
| `corzisio-worker-learn-datesandspots` | Corsizio event feed + spots data. Hostname typo is real — don't "fix" it. |
| `was-ds-cal-v3`, `was-ds-cal-discover` | Discover Sailing (homepage / subdomain) |
| `was-lts-cal-v3` | Learn to Sail — matches `"two-day"` |
| `was-lts-camp-cal` | Sailing camp — matches `"three-day"`, currently matches nothing |
| `was-skipper-cal-v2` | Learn to Skipper |
| `was-women-cal` | Women's Learn to Sail |
| `was-ss-cal` | This one |

Two orphaned Workers, `was-lts2-cal` and `was-lts3-cal`, are deployed on Cloudflare but referenced by no page and absent from this repo. Safe to delete from the dashboard.

Also live and unrelated to calendars: `was-artie`, `was-artie-widget`, `was-common-nav`, `was-faqs`, `was-reviews`, `was-request-form`, `was-dash-cal`.
