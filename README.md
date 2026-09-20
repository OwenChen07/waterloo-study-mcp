# Waterloo Study MCP

A local, read-only Model Context Protocol (MCP) server for Waterloo study workflows. The first release deliberately uses fictional mock data and exposes only:

- LEARN-style course listings, upcoming work, and announcements
- Piazza-style course listings, folders, search, and posts

It does **not** retrieve grades/submissions or provide write tools. The project now includes optional, local browser-login commands that save only session data on your computer; the MCP tools still use fictional mock data until the real providers are implemented.

## Why mock data first?

Academic data is sensitive. This project establishes a small, testable MCP surface before adding any real-account integration. A future provider must use an approved API/OAuth route or a separately reviewed local-only integration.

## Run locally

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

The default transport is stdio, intended for a local MCP client. Never expose this development server or future credentials to a public network.

## Sign in locally

The login commands open a normal browser window. Complete the sign-in and Duo approval yourself, then return to the terminal and press Enter. The program never asks for, logs, or stores your password. It saves the browser session under `~/.waterloo-study-mcp` with owner-only filesystem permissions; override that location with `STUDY_MCP_STATE_DIR` if needed.

```sh
npx playwright install chromium
npm run auth:learn
npm run auth:piazza
npm run auth:status
```

These sessions are not yet used by MCP tools. They are the authentication foundation for the upcoming read-only LEARN and Piazza providers. A session can expire or be revoked at any time; rerun the matching login command when that happens.

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
3. No secret or personal-data logging; session files must never be committed or shared.
4. Local-only operation until an approved authentication model exists.
5. No automatic posting, submitting, or course administration.
