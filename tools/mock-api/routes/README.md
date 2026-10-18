# Mock API route modules

`server.mjs` loads every `*.mjs` file in this folder at start. Each exports a default array of
routes:

```js
export default [
  {
    method: 'GET', // optional, default GET
    match: /^\/api\/v1\/invoices\/([^/]+)$/, // string for an exact path, RegExp for params
    reply: ({ params, query, body }) => ({ status: 200, body: { ... } }),
    // `reply` may also return the body directly (status 200), or { status: 404 } to refuse.
  },
]
```

`params` are the RegExp capture groups (`params[0]` is the first group), `query` is a
`URLSearchParams`, `body` is the parsed JSON of a POST/PUT/PATCH (or `undefined`), `headers` the request's headers
(lower-case names).

Keep fixtures in the shape the frontend's `src/api/**` types expect — this is how the
integrated screens render without a backend, for screenshots and the responsive harness only.
One file per area (`invoices.mjs`, `creditNotes.mjs`, …) so several writers never edit one file.
