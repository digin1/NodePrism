# Auto-Updating Documentation System - Implementation Plan

## Overview

Create a documentation system that automatically updates as the codebase changes. The documentation will be generated from source code, comments, and configuration files.

---

## Documentation Structure

```
/home/ubuntu/NodePrism/docs/
├── README.md                    # Documentation index
├── PLAN.md                      # This plan file
├── architecture/
│   ├── overview.md              # System architecture overview
│   ├── packages.md              # Package descriptions
│   └── data-flow.md             # Data flow diagrams
├── api/
│   ├── README.md                # API overview
│   ├── endpoints.md             # Auto-generated endpoint docs
│   ├── authentication.md        # Auth documentation
│   └── websocket.md             # Socket.IO events
├── database/
│   ├── schema.md                # Auto-generated from Prisma
│   ├── models.md                # Model descriptions
│   └── migrations.md            # Migration history
├── services/
│   ├── README.md                # Services overview
│   ├── metric-collector.md      # MetricCollector docs
│   ├── event-logger.md          # EventLogger docs
│   ├── target-generator.md      # TargetGenerator docs
│   └── alert-processor.md       # Alert processing docs
├── frontend/
│   ├── README.md                # Frontend overview
│   ├── pages.md                 # Page descriptions
│   └── components.md            # Key components
├── deployment/
│   ├── README.md                # Deployment guide
│   ├── docker.md                # Docker setup
│   ├── environment.md           # Auto-generated env docs
│   └── manual-setup.md          # Manual agent setup
├── monitoring/
│   ├── README.md                # Monitoring overview
│   ├── prometheus.md            # Prometheus configuration
│   ├── alerting.md              # Alert rules and templates
│   └── agents.md                # Agent types and setup
└── scripts/
    └── generate-docs.ts         # Documentation generator script
```

---

## Implementation Steps

### Phase 1: Documentation Generator Script

Create `/docs/scripts/generate-docs.ts` that:

1. **Parses API Routes** (`packages/api/src/routes/*.ts`)
   - Extract route paths, methods, middleware
   - Extract request/response types from Zod schemas
   - Generate endpoint documentation with examples

2. **Parses Prisma Schema** (`packages/api/prisma/schema.prisma`)
   - Extract models, fields, types, relations
   - Generate database schema documentation
   - Create entity-relationship descriptions

3. **Parses Environment Config** (`packages/shared/src/config.ts` + `.env.example`)
   - Extract all environment variables
   - Document required vs optional
   - Include default values and descriptions

4. **Parses Services** (`packages/api/src/services/*.ts`)
   - Extract exported functions and classes
   - Parse JSDoc comments
   - Generate service documentation

5. **Parses Frontend Pages** (`packages/web/app/**/*.tsx`)
   - Extract page routes from file structure
   - Document page purposes

### Phase 2: Git Hook Integration

Create pre-commit hook that:
1. Runs documentation generator
2. Stages updated docs
3. Includes docs in commit

### Phase 3: Manual Documentation

Create static documentation for:
- Architecture overview with diagrams
- Getting started guide
- Deployment instructions
- Troubleshooting guide

---

## Auto-Generation Sources

| Documentation | Source Files | Update Trigger |
|--------------|--------------|----------------|
| API Endpoints | `routes/*.ts` | Route file changes |
| Database Schema | `schema.prisma` | Schema changes |
| Environment Vars | `.env.example`, `config.ts` | Config changes |
| Services | `services/*.ts` | Service file changes |
| Frontend Pages | `app/**/page.tsx` | Page file changes |
| Agent Types | `schema.prisma` (AgentType enum) | Schema changes |

---

## Key Files to Create

### 1. Documentation Generator (`docs/scripts/generate-docs.ts`)
- TypeScript AST parsing for route extraction
- Prisma schema parsing
- Markdown generation utilities

### 2. NPM Scripts (`package.json`)
```json
{
  "scripts": {
    "docs:generate": "tsx docs/scripts/generate-docs.ts",
    "docs:watch": "nodemon --watch packages -e ts,prisma --exec npm run docs:generate"
  }
}
```

### 3. Git Hook (`.husky/pre-commit`)
```bash
npm run docs:generate
git add docs/
```

---

## Documentation Content Outline

### API Documentation (`docs/api/endpoints.md`)
For each endpoint:
- HTTP method and path
- Description
- Authentication requirement
- Request body schema (if applicable)
- Response schema
- Example request/response

### Database Documentation (`docs/database/schema.md`)
For each model:
- Model name and description
- Fields with types and constraints
- Relations to other models
- Indexes

### Environment Documentation (`docs/deployment/environment.md`)
For each variable:
- Variable name
- Description
- Required/Optional
- Default value
- Example value

### Service Documentation (`docs/services/*.md`)
For each service:
- Purpose and responsibility
- Key functions with descriptions
- Dependencies
- Configuration options

---

## Estimated Effort

| Task | Complexity | Files |
|------|------------|-------|
| Documentation generator script | High | 1 |
| API endpoint parser | Medium | Part of generator |
| Prisma schema parser | Medium | Part of generator |
| Environment parser | Low | Part of generator |
| Static architecture docs | Medium | 3-4 |
| Git hook setup | Low | 1 |
| NPM scripts | Low | 1 |

---

## Dependencies to Add

```json
{
  "devDependencies": {
    "@typescript-eslint/parser": "^6.0.0",
    "typescript": "^5.3.0"
  }
}
```

No additional dependencies needed - we'll use TypeScript's compiler API which is already available.

---

## Success Criteria

1. Running `npm run docs:generate` creates/updates all auto-generated docs
2. Documentation stays in sync with code changes
3. All API endpoints are documented with examples
4. Database schema is fully documented
5. Environment variables are documented with descriptions
6. Documentation is readable and navigable

---

## Next Steps (After Approval)

1. Create the `docs/` directory structure
2. Implement the documentation generator script
3. Generate initial documentation
4. Add NPM scripts for doc generation
5. Set up git hooks for auto-updates
6. Create static architecture documentation
