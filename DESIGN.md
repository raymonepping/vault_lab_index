# DESIGN: Lab Index

The dashboard follows **Vault daylight glass**, the house system of every
Vault project (canonical: Arcanium, `docs/frontend/config/DESIGN.md`).
`ui/app/assets/css/main.css` is the system's `vault-glass.css`, unchanged;
`ui/app/assets/css/index.css` holds this page and uses only its tokens.

## Identity

- One page, one job: a rack of the labs next door, each with two buttons.
- The ink hero counts what runs, what is stopped and what needs a look.
- Each card carries **rack lights**: one per container its prefix matches,
  green while it runs, amber when unhealthy, dim when stopped. The sentence
  next to them says the same in words.
- The prefix is the lab's name plate, in JetBrains Mono.
- Make's own output is shown as it comes, redacted, in a mono well.

## Status

Colour, icon and word always travel together (brief D15). Text tokens hold
AA on their own tint.

| State | Word | Icon | Text / tint |
| --- | --- | --- | --- |
| running | Running | circle-check | `--vg-healthy` on `--vg-healthy-bg` |
| stopped | Stopped | circle-stop | `--vg-text-secondary` on `--vg-bg-neutral` |
| starting, stopping | Starting, Stopping | loader (spins; still with reduced motion) | `--vg-action-bright` on blue 12% |
| partial | Partial | triangle-alert | `--vg-pending` on `--vg-pending-bg` |
| stale (added to any state) | Stale | clock | `--vg-pending` on `--vg-pending-bg` |
| failed | Failed | circle-x | `--vg-critical` on `--vg-critical-bg` |
| unknown | Unknown | circle-help | `--vg-text-dim` on neutral, dashed border |

"Need a look" counts partial, failed, stale and unknown labs. Unknown is
never counted as stopped or running.

## Rules kept

- One dark pane per page (the hero); no gradient text, no coloured side
  rails, no emoji. Icons from `@lucide/vue`.
- Fonts are self-hosted files (`assetsInlineLimit: 0`), so the CSP keeps
  `font-src 'self'` and `style-src 'self'`; no inline `style` attributes.
- Motion: the system's 180 ms hover and press, the live dot and the busy
  spinner; `prefers-reduced-motion` stops both animations.
- Phone (390 px): one column, tiles stay three across, no horizontal scroll.
