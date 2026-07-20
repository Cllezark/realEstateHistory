# Playwright MCP — Browser Automation Guide

The Playwright MCP server (`@playwright/mcp`) is configured for this project, giving Copilot agents browser automation capabilities. This guide documents the available tools and common patterns.

## Configuration

Configured in `.mcp.json` at the project root:
- **Browser**: Chromium (headless, `--no-sandbox` for WSL)
- **Viewport**: 1280×720
- **Caps enabled**: `vision` (screenshot analysis), `pdf` (PDF generation)
- **Session persistence**: `--save-session` (state survives between tool calls)
- **Output dir**: `.playwright-output/` (screenshots, PDFs, downloads)
- **Console level**: `error` only (keeps snapshots clean)

## Available Tools

### Navigation & Page Interaction

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Navigate to a URL. Returns page snapshot. |
| `browser_click` | Click an element by role, text, label, or test ID. |
| `browser_type` | Type into an input field. |
| `browser_press_key` | Press a key or key combo (e.g., `Escape`, `ArrowRight`, `Control+a`). |
| `browser_select` | Select an option from a `<select>` element. |
| `browser_hover` | Hover over an element. |
| `browser_fill_form` | Fill multiple form fields at once. |
| `browser_file_upload` | Upload files via file input. |
| `browser_handle_dialog` | Accept/dismiss browser dialogs (alert, confirm, prompt). |

### Inspection & Debugging

| Tool | Purpose |
|------|---------|
| `browser_snapshot` | Accessibility snapshot of the current page (text + roles). |
| `browser_take_screenshot` | Full-page or element screenshot (PNG). With `--caps vision`, images can be analyzed. |
| `browser_evaluate` | Execute arbitrary JavaScript in the page context. |
| `browser_console_messages` | Retrieve console messages since last navigation. |
| `browser_network_requests` | Retrieve network requests since last navigation. |
| `browser_wait_for` | Wait for text to appear, disappear, or a timeout. |

### Session Management

| Tool | Purpose |
|------|---------|
| `browser_close` | Close the browser. |
| `browser_install` | Install/verify browser binaries are available. |
| `browser_resize` | Change viewport size at runtime. |
| `browser_tabs` | List, create, close, or switch between tabs. |

## Common Patterns for This Project

### 1. Smoke-test the map dashboard

```
browser_navigate → http://localhost:5173
browser_wait_for → text "St. Petersburg" appears
browser_take_screenshot → verify choropleth renders
browser_snapshot → check metric selector and timeline are present
```

### 2. Verify URL state sync

```
browser_navigate → http://localhost:5173/?tract=12103022701&quarter=2024-Q2&metric=medianSalePrice
browser_snapshot → confirm tract details panel shows the selected tract
browser_click → click a different tract on the map
browser_evaluate → window.location.search → verify URL updated
```

### 3. Test keyboard accessibility

```
browser_navigate → http://localhost:5173
browser_press_key → Tab (focus first interactive element)
browser_press_key → Tab (navigate through controls)
browser_press_key → ArrowRight (advance quarter in timeline)
browser_press_key → Escape (close any open panel)
```

### 4. Test the comparison mode

```
browser_navigate → http://localhost:5173
browser_click → click "Compare" button
browser_snapshot → verify start/end quarter selectors appear
browser_take_screenshot → capture diverging color scale on map
```

### 5. Verify responsive/loading states

```
browser_navigate → http://localhost:5173
browser_resize → { width: 375, height: 812 } (iPhone)
browser_take_screenshot → verify mobile layout
browser_resize → { width: 1280, height: 720 } (restore)
```

### 6. Run E2E assertions via evaluate

```
browser_evaluate → document.querySelectorAll('.tract-polygon').length → verify 80+ tracts
browser_evaluate → document.querySelector('[role="slider"]') !== null → timeline exists
```

### 7. Generate a PDF snapshot of the dashboard

```
browser_navigate → http://localhost:5173
browser_press_key → p (if print mode is supported)
— or use the pdf capability to generate a report
```

## Tips

- **Always `browser_navigate` first** in a fresh session — the browser starts with a blank page.
- **Use `browser_snapshot` over `browser_take_screenshot`** for UI verification when possible — snapshots are text-based and don't consume vision tokens.
- **Use test IDs** for reliable element targeting: the map app may have `data-testid` attributes (`--test-id-attribute data-testid` is configured).
- **The dev server must be running**: start it with `cd frontend && npm run dev` (runs on `http://localhost:5173`). Playwright's `webServer` config in `playwright.config.ts` can auto-start it, but MCP tools don't use that config.
- **Output files** (screenshots, PDFs) land in `.playwright-output/` — check there after taking screenshots.
- **Console messages** filter at `error` level to reduce noise; use `browser_evaluate` with `console.log` to emit custom debug messages that won't appear in the filtered output (adjust `--console-level` in `.mcp.json` if you need more).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Browser won't launch | Run `npx @playwright/mcp --browser chromium --install` or `npx playwright install chromium` |
| Connection refused on localhost:5173 | Start the dev server: `cd frontend && npm run dev` |
| Screenshot is blank | Wait for data to load first: use `browser_wait_for` for a known element |
| Element not found by text | Use `browser_snapshot` to see the current accessibility tree, then refine the selector |
