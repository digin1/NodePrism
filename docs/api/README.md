# API Documentation

> Auto-generated on 2026-03-07

The NodePrism API is a RESTful service that provides:

- Server management
- Agent registration and monitoring
- Metrics collection and querying
- Alert management
- Event logging

## Quick Links

- [API Endpoints](./endpoints.md) - All available endpoints
- [Authentication](./authentication.md) - Auth flow and JWT tokens
- [WebSocket Events](./endpoints.md#websocket-events) - Real-time updates

## Base URL

- Development: `http://localhost:4000/api`
- Production: `https://your-domain.com/api`

## Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "details": [ ... ]
}
```
