# Route integration tests

`tests/route-integration.test.ts` exercises the actual local Next.js route
handlers over HTTP. It never falls back to `DATABASE_URL`, never reads an env
file, and refuses non-loopback or non-test/demo database/API targets. The
suite is skipped unless all test-only inputs are supplied:

- `FITPASS_TEST_DATABASE_URL`: local PostgreSQL URL whose database name
  contains `test` or `demo`.
- `FITPASS_TEST_API_ORIGIN`: `http://localhost`, `http://127.0.0.1`, or IPv6
  loopback origin serving the same disposable database.
- `FITPASS_TEST_ROUTE_FIXTURES`: JSON fixtures containing the fields used in
  `RouteFixtures` in the test source. Cookie values are passed only in request
  headers and are never printed.
- `PAYSTACK_SECRET_KEY`: optional `sk_test_` key, required only for webhook
  replay coverage. The suite refuses to send a webhook unless the value has
  the test-key prefix.

Prepare the disposable database and fixtures only after the approved backup
restore and local migration rehearsal. Start the local app with its runtime
`DATABASE_URL` pointed to that same disposable database, then set the
test-only variables in the current PowerShell process without saving them to
the repository. Run `npm test`; it reports each missing integration run as
skipped. Never point these tests at Neon, production, or a shared development
database. Some scenarios deliberately send writes (invitation acceptance and
webhook replay), so use disposable fixture rows and restore a fresh copy for a
clean repeat.

The test suite has not been run against a database in this phase.
