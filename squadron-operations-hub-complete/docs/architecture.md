# Architecture

## Why a monorepo

The project contains multiple independently deployable concerns:

- Interactive web application
- Background automation worker
- Database package
- Authentication and permissions
- Discord and communication integrations
- Shared UI system
- Audit logging
- Validation
- Future mobile or desktop clients

A monorepo keeps these concerns separate without forcing duplicated types and logic.

## Modular application structure

Each operational area is a module. Modules may expose:

- Domain types
- Business rules
- Application services
- Data repositories
- UI components
- API routes or server actions
- Validation schemas
- Tests

The application shell should not contain functional-area business logic.

## Multi-squadron readiness

Every operational record is scoped to a `squadronId`. This allows the system to begin with TN-170 but later support other units without redesigning the database.

## Discord approach

Discord should be integrated, not embedded.

Supported behaviors:

- Link the staff channel
- Show permitted recent-message summaries
- Open the native Discord channel through a direct jump URL
- Create tasks from messages
- Post approved announcements
- Record the Discord message URL as the task's source
- Maintain role and channel authorization checks

Discord remains the communication platform. Squadron Operations Hub becomes the operational workflow system.
