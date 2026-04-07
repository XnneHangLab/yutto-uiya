# Tauri + React Launcher UI Design

## Summary

This spec defines the first-stage desktop launcher UI for `XnneHangLabLauncherTemplate`.
The target is a high-fidelity recreation of the provided launcher HTML using `Tauri + React`,
while keeping the structure ready for later expansion into a reusable launcher template.

The first stage favors visual parity over generalized abstraction, but avoids page-sized
components by introducing a light component split around layout, repeated content blocks,
and desktop-window concerns.

## Confirmed Scope

### In Scope

- Build the project as a desktop app with `Tauri + React + Vite`
- Recreate the provided launcher UI with high visual fidelity
- Implement the full left navigation with page switching
- Implement complete content for:
  - Home page
  - Settings page
- Implement placeholder page shells for:
  - Advanced Options
  - Troubleshooting
  - Version Management
  - Model Management
  - Tools
  - Community
  - Lightbulb
  - Console
- Keep first-stage page data static in the frontend
- Include desktop shell planning for:
  - custom top bar area
  - drag region
  - minimize button
  - close button

### Out of Scope

- Real environment checks
- Real downloader logic
- Real launcher process management
- Real filesystem browsing
- Real settings persistence
- Full configuration-driven templating

## Product Goal

Deliver a desktop launcher shell that already looks and behaves like the reference UI,
but is structured so that later launcher features can be added without rewriting the page tree.

## Chosen Approach

The agreed approach is "recreation first with light componentization".

This means:

- Keep the visual structure of the original HTML close to the reference
- Avoid a single large page component
- Extract repeated and stable UI blocks into focused components
- Defer heavier abstraction until real launcher features begin to replace static content

This approach is preferred over a direct JSX translation because it avoids a second full
refactor when environment checks, downloads, and launch actions are introduced.

## Architecture

The UI is split into three layers.

### 1. Shell Layer

`AppShell` owns the desktop-window frame and persistent layout:

- left sidebar navigation
- top bar
- main content container
- active page switching
- Tauri drag-region placement
- window controls placement

The shell should know which page is active, but should not know page-specific content details.

### 2. Page Layer

Each navigable area gets its own page component.

- `HomePage` renders the hero, folder cards, version metadata, and announcement panel
- `SettingsPage` renders tabs and grouped settings sections
- `PlaceholderPage` renders a consistent empty-state shell for unfinished pages

Only `HomePage` and `SettingsPage` are fully implemented in phase one.

### 3. Section / Block Layer

Repeated or visually distinct blocks are extracted into focused components so that the page
components remain readable and easier to evolve.

Examples:

- `Sidebar`
- `NavItem`
- `Topbar`
- `WindowControls`
- `HeroBanner`
- `FolderGrid`
- `FolderCard`
- `NoticePanel`
- `SettingsTabs`
- `SettingCard`
- `SettingRow`
- `ToggleSwitch`

## Directory Layout

```text
src/
  app/
    App.tsx
    routes.ts
    providers.tsx
  layouts/
    AppShell/
  pages/
    HomePage/
    SettingsPage/
    PlaceholderPage/
  components/
    navigation/
      Sidebar/
      NavItem/
    window/
      Topbar/
      WindowControls/
    home/
      HeroBanner/
      FolderGrid/
      FolderCard/
      NoticePanel/
    settings/
      SettingsTabs/
      SettingCard/
      SettingRow/
      ToggleSwitch/
    common/
      PageContainer/
      Panel/
  data/
    nav.ts
    home.ts
    settings.ts
  services/
    desktop/
  styles/
    tokens.css
    global.css
```

## Component Responsibilities

### `AppShell`

Responsibilities:

- render the outer app layout
- mount `Sidebar`, `Topbar`, and the current page
- store current active page id
- provide the drag region and non-draggable control regions

Non-responsibilities:

- page-specific UI details
- direct Tauri API calls outside window-shell concerns

### `Sidebar`

Responsibilities:

- render all navigation items from static data
- show active visual state
- send navigation intent upward

It should not hardcode page copy in JSX. Navigation metadata comes from `data/nav.ts`.

### `Topbar` and `WindowControls`

Responsibilities:

- display the desktop shell top area
- reserve a drag region for Tauri
- isolate minimize and close behavior from page components

These components must call desktop-facing helper methods rather than using Tauri APIs inline.

### `HomePage`

Responsibilities:

- compose the homepage sections only
- read static homepage data
- pass specific slices of data into display components

Sub-blocks:

- `HeroBanner`
- `FolderGrid`
- `NoticePanel`
- version metadata block

### `SettingsPage`

Responsibilities:

- render settings tabs
- render grouped setting cards
- host local tab and control state for phase one

Sub-blocks:

- `SettingsTabs`
- `SettingCard`
- `SettingRow`
- `ToggleSwitch`

### `PlaceholderPage`

Responsibilities:

- provide a consistent shell for unfinished pages
- accept title and short description props

This avoids creating many unfinished page variants during the first stage.

## Data Strategy

Phase one keeps all content static in the frontend.

### `data/nav.ts`

Contains:

- nav item ids
- labels
- icons
- page types

### `data/home.ts`

Contains:

- hero copy
- folder card content
- metadata text
- notice text
- run button label

### `data/settings.ts`

Contains:

- tab labels
- setting groups
- row labels
- descriptions
- default switch values
- default input values

The goal is not full configuration-driven UI yet. The goal is simply to avoid burying static
copy inside page JSX so that future replacement with live data is straightforward.

## State Design

Phase one does not introduce a global state library.

### Shell State

Managed close to `AppShell`:

- active navigation item
- active page id
- optional hover state for shell controls if needed

### Page State

Managed locally inside the page that owns it:

- settings active tab
- settings input values
- settings toggle values

### Desktop State Boundary

Desktop actions are wrapped behind a dedicated adapter layer under `src/services/desktop/`.

React components should call functions like:

- `minimizeWindow()`
- `closeWindow()`
- `isTauriWindowAvailable()`

This keeps Tauri-specific integration out of presentational components and makes later testing
or web-preview fallback easier.

## Tauri Integration Boundary

Phase one Tauri integration is intentionally narrow.

### Required in Phase One

- custom window shell support
- draggable top area
- minimize action
- close action

### Deferred but Pre-Structured

- open folder
- open external link
- launch local process
- run environment check
- download resources

These capabilities should be represented as service boundaries, even if the initial implementation
is a stub or mock.

## Interaction Model

### Navigation

- Sidebar click switches the active page inside the shell
- Home and Settings render full content
- Other pages render placeholder shells

### Home

- Folder cards are presentational in phase one
- Run button is presentational in phase one
- Version metadata is static text in phase one

### Settings

- Tabs switch local settings subview
- Toggles and inputs update local component state
- No persistence is required in phase one

### Window Controls

- Minimize and close call the desktop service adapter
- Drag region must not overlap clickable controls

## Styling Strategy

The reference HTML already defines a strong visual direction, so phase one should preserve that
appearance closely.

Styling rules:

- keep design tokens in `styles/tokens.css`
- keep app-wide resets and shared layout rules in `styles/global.css`
- co-locate component-specific styling with components when useful
- preserve dark desktop aesthetic, spacing, gradients, radius, and panel hierarchy from the reference

The UI should remain responsive enough for smaller desktop sizes, matching the intent of the
reference media rules rather than becoming a mobile-first web layout.

## Page Inventory

### Fully Implemented

- Home
- Settings

### Placeholder Shells

- Advanced Options
- Troubleshooting
- Version Management
- Model Management
- Tools
- Community
- Lightbulb
- Console

## Phase One Build Order

1. Initialize `React + Vite + Tauri`
2. Add global design tokens and app-level styling
3. Build `AppShell`
4. Build `Sidebar`
5. Build `Topbar` and `WindowControls`
6. Build `HomePage`
7. Build `SettingsPage`
8. Build placeholder pages for remaining navigation items
9. Connect Tauri window controls
10. Tune layout and responsive behavior for desktop sizes

## Phase Two Evolution Path

Once the first-stage recreation is stable, the template can evolve by replacing static content
without changing the page skeleton.

Expected second-stage replacements:

- folder cards become real filesystem actions
- run button becomes real launcher state
- settings rows become persistent values
- placeholder pages become feature pages
- desktop service stubs become real Tauri command integrations

This is why shell, page, section, and desktop-service boundaries are introduced in phase one.

## Testing Expectations

Phase one should verify:

- page switching works
- Home and Settings render expected sections
- placeholder pages render without layout breakage
- window control buttons are wired to the desktop adapter
- layout remains intact at the target desktop sizes

The first pass can rely on lightweight component tests and manual Tauri preview verification.

## Acceptance Criteria

The phase-one implementation is complete when all of the following are true:

- the application runs as a Tauri desktop shell
- the reference launcher look is recreated at a high level of fidelity
- the left navigation is complete and switches pages
- Home page content is fully implemented
- Settings page content is fully implemented
- unfinished pages render consistent placeholder shells
- window controls are isolated behind a desktop adapter
- the codebase is structured so future launcher features can be added without rewriting page layout
