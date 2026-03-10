# Copilot Code Review Instructions

## Project Context
NodePrism is a TypeScript monorepo (pnpm + turborepo) for server infrastructure monitoring. It uses Express (API), Next.js 14 (Web), Prisma ORM (PostgreSQL), Redis, Prometheus, and Grafana.

## Review Priorities
- **Security**: Flag SQL injection, XSS, command injection, and OWASP top 10 vulnerabilities. API routes must validate input with Zod schemas.
- **Error handling**: Express routes must use try/catch with `next(error)`. Never swallow errors silently.
- **TypeScript strictness**: No `any` types unless unavoidable. Prefer explicit types over inference for function signatures.
- **BigInt serialization**: Any BigInt field from Prisma must use `.toString()` before JSON serialization.
- **Route ordering**: Specific paths (e.g., `/tags`, `/bulk`) must come before `/:id` param routes.
- **Database**: Use `prisma db push` for schema changes (not `migrate dev`). Raw SQL must use snake_case table names.
- **No code duplication**: Check if similar logic already exists before adding new code.
