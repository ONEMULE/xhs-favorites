# Capability Matrix

This document explains which features exist and which internal provider currently handles them.

## Providers

### API provider

Used for lightweight public-state extraction from page HTML.

Current strengths:

- home feed
- note detail
- partial note comments

### Playwright provider

Used for authenticated flows and complex interactions with a persistent local browser profile.

Current strengths:

- favorites
- boards
- board items
- search
- comments
- interactions
- publishing
- creator center

## CLI / MCP Capability Groups

### Read

- `home-feed`
- `search-notes`
- `list-notes`
- `list-boards`
- `list-board-items`
- `list-user-notes`
- `note-detail`
- `note-comments`

### Engage

- `like-note`
- `favorite-note`
- `post-comment`
- `reply-comment`

### Publish

- `publish-note`
- `publish-video`

### Creator

- `creator-dashboard`
- `creator-content-metrics`
- `creator-fan-metrics`

### Diagnostics

- `doctor`
- `doctor-full`
- `login`
- `bootstrap`

## Routing Notes

- `doctor-full` shows the provider-level capability matrix at runtime.
- Some tools prefer the API provider first and fall back to Playwright.
- Some tools always require Playwright because they depend on an authenticated browser session or UI interaction.
