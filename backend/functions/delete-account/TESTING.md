# delete-account — manual staging test note

No automated test harness exists for this edge function in this repo
(no Deno runtime in the build VM, no test file under
`backend/functions/`), so the checks below are the test. Run them
against STAGING only, never live, after migration 00022 has been
applied to staging and this version of the function has been
deployed to staging. Do NOT run them against live, and do NOT
deploy this function version before 00022: until 00022 exists, every
delete-account call fails closed (see "Abort case" below) by design.

## Setup (staging, service role)

Create a staging test user and, as that user, post:

1. One public prayer request (echo) — plain text.
2. One testimony with a distinctive first name (not "A friend").
3. One HELD prayer request — text that holds, e.g. a self-harm
   hold phrase — and confirm it returns `hidden_at` set and a
   `hidden_reason` starting with `hold:`.
4. Amen on another user's public echo (from the test user), and
   note that echo's amen count.

## Happy path

Call the function as the test user with body
`{"confirmationText": "DELETE"}` and a recent login (within
10 minutes, as the function requires). Then, as service role,
confirm ALL of the following:

- The call returns `{ ok: true, deleted: true }` and the auth
  user is gone.
- The public echo and the testimony STILL EXIST. The echo's
  `user_id` is NULL; the testimony's `user_id` is NULL and its
  `first_name` is exactly `A friend` (the distinctive name is gone).
- The held echo STILL EXISTS, still has its original `hidden_at`
  and `hidden_reason` — anonymize must never publish a held post.
- The amen the test user left STILL EXISTS and the other echo's
  amen count is unchanged (amens stay, counts preserved).
- No other user's echo, testimony, or amen changed.
- The test user's private data is gone (profile row, progress
  rows), and a retry-style second check finds no rows for the
  deleted id in the tables the function deletes.

## Abort case (the fail-closed behaviour)

On a staging database WITHOUT 00022 applied (or with the
anonymize function temporarily renamed — staging only), call the
function as a fresh test user and confirm:

- The call FAILS (5xx / "Unable to delete account right now").
- The test user's account, wall posts, and amens are ALL still
  intact — nothing was deleted. This is the intended behaviour,
  not a bug: a missing anonymize step must never degrade into
  deleting the posts the app promises will stay.

Re-apply 00022 (or restore the function name) and confirm the
same test user can then delete successfully via the happy path.

## Deploy order (do not skip)

1. Apply 00022 to staging, run the happy-path test above.
2. Deploy this function version to staging, re-run both cases.
3. Only then consider the same order for live, with Kai's
   separate live-deploy approval (00022 and this function are
   both staging-test-only until then).
