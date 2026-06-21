# Agent brand icons ("Works with" row)

Official brand marks for the `AgentPromptCard` "Works with" row, rendered by
`src/components/AgentPromptCard.tsx` via the list in `src/components/works-with.ts`.

Served from `/assets/agents/<theme>/<slug>.png`. There are **two theme variants**
per brand so the mark stays visible on both light and dark surfaces; the card
shows the right one based on the document's `data-theme`.

```
dark/   <- shown in dark theme (default)
light/  <- shown in light theme
  claude.png  chatgpt.png  gemini.png
  grok.png    cursor.png   copilot.png
  openclaw.png  openhuman.png  hermes.png
```

## Source

Pulled from the open **LobeHub** AI/LLM brand-icon set
(`@lobehub/icons-static-png`, 640×640 PNG):

| slug        | LobeHub file          |
| ----------- | --------------------- |
| `claude`    | `claude-color`        |
| `chatgpt`   | `openai`              |
| `gemini`    | `gemini-color`        |
| `grok`      | `grok`                |
| `cursor`    | `cursor`              |
| `copilot`   | `copilot-color`       |
| `openclaw`  | `openclaw-color`      |
| `openhuman` | `openhuman`           |
| `hermes`    | `hermesagent`         |

To refresh or add a brand, copy the matching `dark/` and `light/` PNGs from that
package (e.g. `cdn.jsdelivr.net/npm/@lobehub/icons-static-png@<ver>/dark/<file>`)
and add the slug to `DEFAULT_WORKS_WITH`.
