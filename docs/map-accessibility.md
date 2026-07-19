# Map MVP Accessibility

## WCAG 2.1 AA Compliance

The St. Pete Real Estate Map MVP targets WCAG 2.1 Level AA conformance. This document describes the accessibility features implemented and recommendations for future improvements.

## Keyboard Navigation

### Map Interaction

| Action | Key/Behavior |
|--------|-------------|
| Navigate map | Arrow keys (pan) |
| Zoom in/out | `+` / `-` keys |
| Select tract | Click on tract polygon |
| Deselect tract | Click on empty map area or press `Escape` |

### Quarter Timeline

| Action | Key/Behavior |
|--------|-------------|
| Previous quarter | `ArrowLeft` |
| Next quarter | `ArrowRight` |
| First quarter | `Home` |
| Last quarter | `End` |
| Play/pause animation | `Space` or `Enter` on play button |

### Metric Selector

| Action | Key/Behavior |
|--------|-------------|
| Open dropdown | `Space` or `Enter` |
| Navigate options | `ArrowUp` / `ArrowDown` |
| Select option | `Enter` |
| Close without change | `Escape` |

### Comparison Controls

| Action | Key/Behavior |
|--------|-------------|
| Focus quarter selector | `Tab` navigation |
| Change quarter | `ArrowUp` / `ArrowDown` on focused select |
| Enable comparison | `Enter` or `Space` on "Compare" button |
| Disable comparison | `Enter` or `Space` on "Clear comparison" button |

## Screen Reader Support

### Map

- The map container has `role="application"` and `aria-label="St. Petersburg Census tract map"`
- MapLibre GL JS canvas elements are not natively screen-reader accessible. Users relying on screen readers should use the Details Panel for tract data.

### Tract Selection

- When a tract is selected, the Details Panel updates with the tract name, GEOID, and all quarterly metrics
- Trend chart data is not screen-reader accessible — a data table alternative should be considered for future iterations

### Status Announcements

- Loading state: visually displayed with "Loading St. Petersburg housing data…"
- Error state: `role="alert"` with descriptive error message and guidance
- Data not available: "No data" indicators on map and "No data for [quarter]" in tooltips

## Visual Design

### Color and Contrast

- **Basemap**: Neutral Stadia Maps Alidade Smooth style (low-saturation grays)
- **Choropleth palette**: Color-blind-conscious sequential palette (green-to-blue, distinguishable by all common forms of color vision deficiency)
- **Diverging palette**: Blue-to-orange with neutral middle (distinguishable in grayscale)
- **Suppressed/missing**: Light gray `#cccccc` with "No data" legend indicator
- **Text contrast**: All text meets 4.5:1 minimum contrast ratio against background

### Focus Indicators

- All interactive elements have visible focus rings (`outline: 2px solid #2b8cbe` with 1px offset)
- Focus order follows visual layout: map → details panel (metric selector → comparison → tract info) → timeline
- `:focus-visible` is used to show focus indicators only for keyboard navigation, not mouse clicks

### Reduced Motion

- The `prefers-reduced-motion: reduce` media query is respected:
  - Play/pause animation is available but not auto-started
  - CSS transitions and animations are disabled
  - Map zoom/pan animations are handled by MapLibre GL JS

## Known Limitations

1. **Canvas map**: The MapLibre GL JS canvas is not inherently screen-reader accessible. All essential data is available through the Details Panel and hover tooltips.
2. **Trend chart**: The Recharts SVG chart does not expose data points to screen readers. Future work should add a companion data table or ARIA-describedby annotations.
3. **Color-only differentiation**: The choropleth relies on color. The legend shows numeric ranges, but adjacent classes may be difficult to distinguish. Tooltips provide exact values.
4. **Touch targets**: Interactive elements meet minimum 44×44px touch target size on mobile viewports.

## Testing

Accessibility testing is performed using:
- Keyboard-only navigation through all interactive elements
- axe DevTools automated audit
- Manual screen reader testing (NVDA on Windows, VoiceOver on macOS)

## Future Improvements

1. Add a data table view alongside the trend chart for screen reader access
2. Provide alt-text descriptions for the map at each quarter/metric state
3. Add pattern/texture overlays to supplement color differentiation
4. Implement a focus-trap in the Details Panel when opened on mobile
5. Add skip navigation links for keyboard users
