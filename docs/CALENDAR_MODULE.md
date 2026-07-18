# Operational Calendar Module

The Calendar page is a fully interactive month view built with the existing static interface and Cloudflare backend.

## User capabilities

- Navigate forward and backward by month
- Return to the current month
- Click any date to view its schedule
- Double-click a date to create an event
- Click any event to edit it
- Create, update, or delete events
- Filter by meeting, deadline, activity, inspection, training, or other
- Track preparation state and event status
- Print the current month
- View the next scheduled items in a table

## Storage behavior

When the authenticated Cloudflare Worker is available, events are stored in D1 and shared by all approved senior members.

Before the Worker is deployed, the page automatically uses browser `localStorage` with sample events. Local preview events are limited to that browser and are not squadron records.

## Database migration

`cloudflare/worker/migrations/0004_calendar_events.sql`

The next production deployment runs the migration automatically through the existing GitHub Actions backend workflow.
