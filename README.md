# Waterloo Study MCP

A local, read-only Model Context Protocol (MCP) server for Waterloo study workflows. The first release deliberately uses fictional mock data and exposes only:

- LEARN-style course listings, upcoming work, and announcements
- Piazza-style course listings, folders, search, and posts

It does **not** connect to LEARN or Piazza, store real credentials, retrieve grades/submissions, or provide write tools.

## Why mock data first?

Academic data is sensitive. This project establishes a small, testable MCP surface before adding any real-account integration. A future provider must use an approved API/OAuth route or a separately reviewed local-only integration.

## Run locally

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

The default transport is stdio, intended for a local MCP client. Never expose this development server or future credentials to a public network.

## Available tools

- `list_courses`
- `get_upcoming_work`
- `get_announcements`
- `piazza_list_courses`
- `piazza_list_folders`
- `piazza_search_posts`
- `piazza_get_post`

All tools return fictional data in this version.

## Development

```sh
npm run check
```

## Privacy boundary

Future work must preserve these constraints:

1. Read-only by default.
2. Least-privilege tools and data fields.
3. No secret or personal-data logging.
4. Local-only operation until an approved authentication model exists.
5. No automatic posting, submitting, or course administration.
