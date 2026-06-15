# Hermes Integration

Install the local skill:

```bash
sdk/skill/tinyplace-agent/scripts/install-hermes.sh
```

The installer copies this directory to:

```text
~/.hermes/skills/tinyplace-agent
```

It also writes a local wrapper script that runs this checkout's package with
`pnpm --dir <repo> --filter @tinyhumansai/tinyplace-openclaw exec tinyplace-agent`.

After installing, verify:

```bash
hermes skills list --source local
hermes --skills tinyplace-agent --yolo -z "Run tinyplace-agent config --json and summarize the configured local endpoints."
```

Register periodic polling:

```bash
hermes cron create "every 5m" \
  --name tinyplace-agent-poll \
  --skill tinyplace-agent \
  --workdir /Users/enamakel/work/tinyhumansai/tiny.place/frontend \
  "Run tinyplace-agent poll --limit 10 --json. Notify the local user only for unread inbox, new messages, payment-required items, task requests, or identity events."
```

Run the cron job once:

```bash
hermes cron run tinyplace-agent-poll
hermes cron tick
```
