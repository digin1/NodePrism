# Repository Guidelines

## Project Structure & Module Organization
NodePrism is a `pnpm` monorepo managed with Turborepo. Core services live in `packages/`: `web` (Next.js UI), `api` (Express + Prisma + Socket.IO), `config-sync`, `anomaly-detector`, `agent-app`, and `shared` for reusable types/schemas. Infrastructure configs are under `infrastructure/docker/`, generated docs assets live in `docs/`, and the Docusaurus site is in `docs-site/`. Tests are primarily in `packages/api/src/__tests__/`.

## Build, Test, and Development Commands
Use Node 20+ and `pnpm` 8+.

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run all package dev servers through Turbo.
- `pnpm build`: build every workspace package.
- `pnpm lint`: run package lint tasks where defined.
- `pnpm test`: run the Jest suite.
- `pnpm test:coverage`: generate coverage in `coverage/`.
- `pnpm docker:up`: start local infrastructure from `infrastructure/docker/docker-compose.yml`.
- `pnpm docs:generate`: rebuild generated documentation content.

## Coding Style & Naming Conventions
The codebase is strict TypeScript. Prettier is the formatter: 2 spaces, single quotes, semicolons, trailing commas (`es5`), and 100-character line width. Run `pnpm format` before large edits. Use `PascalCase` for React components, `camelCase` for variables/functions, and keep test files named `*.test.ts`. Reuse `@nodeprism/shared` types and validate API input with Zod. Avoid `any`; serialize Prisma `BigInt` values to strings before JSON responses.

## Testing Guidelines
Jest with `ts-jest` is configured at the repo root and scans `packages/**/__tests__/**/*.test.ts`. Add unit and integration coverage alongside the API code when changing backend behavior, especially routes, alert flows, and config sync paths. Run `pnpm test` locally before opening a PR; use `pnpm test:coverage` for larger changes.

## Commit & Pull Request Guidelines
Recent history favors short, imperative commit messages such as `Fix SSRF vulnerability in Slack interaction response_url` and `Add CodeQL security analysis workflow`. Keep subjects specific and outcome-focused. PRs should describe the change, note affected packages, mention config or schema updates, and include screenshots for `packages/web` UI changes. Link related issues when applicable.

## Security & Configuration Tips
Copy `.env.example` to `.env` for local setup and do not commit secrets. Prefer `pnpm --filter @nodeprism/api db:push` over `migrate dev` for schema updates in this repository. Review `.github/copilot-review-instructions.md` when touching API routes: validate inputs, preserve route ordering, and keep error handling explicit.
