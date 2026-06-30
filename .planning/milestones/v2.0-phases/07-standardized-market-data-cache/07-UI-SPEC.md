---
phase: 7
slug: standardized-market-data-cache
status: approved
shadcn_initialized: true
preset: existing-project
created: 2026-06-25
---

# Phase 7 — UI Design Contract

> Visual and interaction contract for the two user-visible cache migration states in Phase 7. This phase extends the existing workspace; it does not redesign it.

---

## Scope

Phase 7 has two user-visible additions:

1. Distinguish first-time standardized-cache bootstrap from an ordinary refresh with the exact copy `正在初始化缓存`.
2. Keep legacy screening results usable during bootstrap or failed validation and mark them with the exact copy `旧缓存结果`.

No new page, modal, navigation item, progress bar, table layout, chart layout, or settings control is introduced.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Existing shadcn components |
| Preset | Existing project theme; no preset changes |
| Component library | Radix-backed shadcn primitives |
| Icon library | Lucide React |
| Font | Inter with system sans-serif fallback |

### Reusable Components

| Component | Phase 7 use |
|-----------|-------------|
| `Button` | Existing manual refresh action; only label and busy icon behavior change during bootstrap |
| `Badge` | New `旧缓存结果` marker and existing status badge patterns |
| `Alert` | Existing refresh failure handling; no new alert variant |
| `ResultsTable` | Receives cache-source state and renders the legacy marker in its existing header |
| `StatusWorkspace` | Renders bootstrap button copy and refresh status summary/detail |

Do not install or generate new registry components.

---

## Layout Contract

### Refresh Controls

- Keep the manual refresh button in its current header position.
- Preserve `min-h-11`, existing outline variant, icon placement, and responsive full-width behavior.
- While bootstrap is active, replace `刷新缓存中` with `正在初始化缓存`.
- Keep the `Database` icon and pulse animation; do not introduce a spinner or progress percentage in Phase 7.

### Refresh Status Card

- Reuse the existing refresh status card directly below the status overview grid.
- Bootstrap state uses the existing warning status treatment.
- Heading: `正在初始化缓存`.
- Body: `正在重新获取最近 60 个交易日的数据。完成前继续显示旧缓存结果。`
- Do not show internal generation IDs, database paths, table names, disk usage, or provider payloads.

### Results Header

- Keep the existing `最新筛选结果` heading, summary text, and row-count badge.
- When results come from legacy cache, add a `Badge variant="outline"` beside the row-count badge in the same right-aligned wrapping group.
- Badge text: `旧缓存结果`.
- On narrow screens, badges may wrap below the heading; they must not force horizontal overflow.
- Do not add a banner above the table or repeat the label on every row.

### Visual Hierarchy

```text
Header actions
  └─ Manual refresh button: 正在初始化缓存

Refresh status card
  ├─ Heading: 正在初始化缓存
  └─ Explanation: 60-day rebuild + old results remain visible

Results card
  ├─ Heading: 最新筛选结果
  ├─ Badge: 旧缓存结果
  └─ Existing table and inline chart unchanged
```

---

## Spacing Scale

Declared values are multiples of 4 and match current workspace patterns.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-to-label and compact inline gaps |
| sm | 8px | Badge groups, heading-to-summary spacing |
| md | 16px | Card padding on small screens, standard control gaps |
| lg | 24px | Card padding on larger screens, main vertical sections |
| xl | 32px | Reserved for larger layout breaks; no new Phase 7 use |
| 2xl | 48px | Not introduced in Phase 7 |
| 3xl | 64px | Not introduced in Phase 7 |

Exceptions: none.

---

## Typography

Use existing typography without new tokens.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body / status detail | 14px | 400 | 1.4 |
| Badge / compact label | 12–14px | 500 | existing component default |
| Section heading | 20px | 600 | 1.25 |
| Page heading | 28px | 600 | 1.2 |

### Text Rules

- Use sentence case Chinese copy; no exclamation marks.
- Keep operational explanations factual and concise.
- Never display raw exception messages, tokens, provider payloads, local paths, or SQL details.
- Use `旧缓存结果`, not “过期结果” or “历史结果”; the data remains usable but is not from the new cache.

---

## Color

Reuse existing CSS variables and semantic status colors.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#F8FAFC` | Page background |
| Secondary (30%) | `#FFFFFF` | Cards, table, controls |
| Accent (10%) | `#2563EB` | Existing primary actions and focus rings only |
| Success | `#15803D` | Existing completed/healthy states |
| Warning | `#B45309` | Bootstrap state and `旧缓存结果` badge |
| Destructive | `#B91C1C` | Refresh failures only |
| Muted text | `#64748B` | Explanatory copy |
| Border | `#E2E8F0` | Existing card and control borders |

Accent reserved for: existing primary validation action, focus ring, and chart series. Do not use blue to represent bootstrap or legacy results.

### Legacy Badge Treatment

Use the existing warning tone:

```text
border: #B45309 at 30% opacity
background: #B45309 at 5% opacity
text/icon: #B45309
```

The marker is informational, not destructive. Do not use red.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Manual refresh default | `手动刷新缓存` |
| Manual refresh during first bootstrap | `正在初始化缓存` |
| Bootstrap status heading | `正在初始化缓存` |
| Bootstrap status body | `正在重新获取最近 60 个交易日的数据。完成前继续显示旧缓存结果。` |
| Legacy results marker | `旧缓存结果` |
| Bootstrap failure heading | Existing `最近刷新失败` / `刷新失败` patterns |
| Bootstrap failure guidance | Existing sanitized error summary; results remain marked `旧缓存结果` |
| Successful activation | Existing `最近刷新成功`; legacy marker disappears after server refresh |
| Destructive confirmation | Not applicable — Phase 7 has no destructive UI action |

### State Matrix

| Cache state | Refresh button | Refresh status | Results marker |
|-------------|----------------|----------------|----------------|
| No normalized cache, idle | `手动刷新缓存` | Existing idle state | `旧缓存结果` if legacy results exist |
| Bootstrap running | `正在初始化缓存` | Warning: initialization copy | `旧缓存结果` |
| Bootstrap failed | `手动刷新缓存` | Existing failed state with sanitized summary | `旧缓存结果` |
| Normalized cache active | `手动刷新缓存` | Existing successful state | No legacy marker |

If no legacy screening results exist, render the existing unavailable result state and do not show an orphaned `旧缓存结果` badge.

---

## Interaction Contract

- The refresh button remains disabled while bootstrap is active.
- Preserve `aria-busy="true"` on the active refresh button.
- Poll the existing refresh status endpoint at the existing interval; do not add a second polling loop.
- When bootstrap finishes, preserve the existing `router.refresh()` behavior so server-rendered results and cache-source labels update atomically.
- The table remains fully interactive while bootstrap runs: sorting, row selection, and inline chart opening continue to work against legacy results.
- Do not disable or dim legacy result rows.

---

## Accessibility

- The button's accessible name must match visible text: `正在初始化缓存`.
- The refresh status card must expose updated heading/body text as normal document content.
- The `旧缓存结果` badge must be textual; color alone must not communicate the state.
- Warning colors must use the existing border/background/text combination to retain contrast.
- Preserve keyboard behavior for result rows and existing focus-visible styles.
- Avoid continuously announcing poll updates. If a live region is used, limit it to meaningful state transitions rather than every poll response.

---

## Responsive Behavior

| Breakpoint | Contract |
|------------|----------|
| Mobile | Header actions remain stacked; refresh button stays full width. Results badges wrap without horizontal overflow. |
| `sm` and above | Header actions align horizontally. Results heading and badges use the existing split layout. |
| All sizes | No new fixed widths, overlays, or viewport-dependent text truncation. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| Existing local shadcn components | `Button`, `Badge`, `Alert`, `Table` | Already present; no registry fetch |
| Third-party registry | None | Not applicable |

No `shadcn add`, third-party block installation, copied registry component, or global theme mutation is permitted for Phase 7.

---

## Verification Contract

Automated UI tests must cover:

1. Bootstrap-running status renders `正在初始化缓存` on the disabled button and status heading.
2. Legacy results render normally with one visible `旧缓存结果` badge.
3. No legacy badge appears when normalized cache is active.
4. No orphaned legacy badge appears when there are no legacy results.
5. Bootstrap failure preserves legacy rows and the legacy marker.
6. Rendered output does not contain token values, database paths, table names, or raw provider payloads.

Focused command:

```powershell
D:\NodeJS\npm.cmd run test -- --run tests/ui/status-workspace.test.tsx tests/ui/results-table.test.tsx
```

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — exact state copy and state matrix defined.
- [x] Dimension 2 Visuals: PASS — placement, hierarchy, responsive behavior, and interaction states defined.
- [x] Dimension 3 Color: PASS — existing palette reused; warning semantics distinguish bootstrap/legacy state.
- [x] Dimension 4 Typography: PASS — existing roles retained with explicit sizes and weights.
- [x] Dimension 5 Spacing: PASS — existing 4px-based scale retained; no exceptions.
- [x] Dimension 6 Registry Safety: PASS — local components only; no new registry or theme mutation.

**Approval:** approved 2026-06-25
