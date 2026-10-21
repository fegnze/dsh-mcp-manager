# dsh-mcp-manager

English | [简体中文](docs/zh.md)

Manage MCP services through DSH's native client and profile configuration.

## Status

Development preview targeting DSH **0.2.1-rc.2**. Local parser, controller, projection and HTTP tests pass. Desktop local installation, import/enable persistence and live uTools resource discovery were verified; the owner confirmed plugin reload and a successful timestamped connection check in the current GUI. Exhaustive disconnect/reconnect, stdio-process and rollback desktop scenarios remain unverified. Version 0.1.0 was published as the interactive bootstrap release and its 12 payload files were verified against the reviewed source. Version 0.1.1 updates delivery documentation and is the OIDC verification release; it introduces no runtime behavior changes. A configured Trusted Publisher is pending validation until its first successful CI publication within npm's two-day window. CI publication, package bytes and provenance must be verified separately. Project short name: `dsh-mcp-manager`; npm identity: `@fegnze/dsh-mcp-manager`. The stable component ID and API namespace remain `dsh-mcps-manager` to retain installed profile configuration. The scoped local installation switch was verified: only the scoped bundle is installed, and the owner confirmed uTools automatic checks succeeded; a read-only resource request also succeeded.

## Installation and entry point

After local validation, install this directory through the desktop application's official plugin manager. Do not use a second Web profile or manually overwrite profile files. Open **Settings → MCP 管理** for daily use. The plugin details retain the same panel as a secondary entry; both use the same backend and profile configuration. Registration uses the official `settings.section` slot, not DOM injection. Host code changes may require an application restart; coordinate that restart before interrupting sessions.

## Features

- Official settings-style cards and outline/primary buttons with concise status badges; internal check times and explanatory notices are not rendered. External services remain read-only and explicitly unprobed.
- Import strict `mcpServers` JSON, with preview and disabled-by-default creation.
- Native stdio and Streamable HTTP transports (`type: http` is converted).
- Enable, disable, remove or explicitly replace manager-owned service configurations.
- Keep existing headers/environment values during replacement without revealing them.
- Read-only listing of independently declared, addressable native MCP entries.
- Globally registered MCP tool names; these are not a connection health check.

Example (use your own credential, never commit it):

```json
{"mcpServers":{"utools":{"type":"http","url":"http://127.0.0.1:3501/mcp","headers":{"x-mcp-key":"YOUR_KEY"}}}}
```

Paste JSON, preview, then confirm import. Imported services are initially disabled. Review the source command before enabling a stdio entry: enabling it executes that command through the native MCP client. Keep uTools running when using its HTTP service. Editing currently uses explicit replacement JSON rather than a field-by-field form. A replacement must retain the same server name and leaves the service disabled; enabling it again shows the saved command and arguments for confirmation. With “keep headers/env” selected, omit those fields in the replacement.

## Ownership and security

The plugin's `servers` field in the DSH profile is the only persistence layer for its services. Writes go through official `configEditor`; each enabled service is an official `dsh-mcp-client` child plugin. There is no sidecar registry, independent transport or background daemon. Other plugins retain ownership of their services.

HTTP routes require DSH signed-peer admission and an intent header. Responses are not cached. List projections omit credential values, URL paths/query and command arguments. Errors never include upstream diagnostic text. Imports reject unknown fields, duplicate keys, unsafe object keys and namespace conflicts, with 1 MiB / 100-server bounds. Changes require confirmation and a baseline checked inside the serialized configuration callback.

## Limitations

- Saving any manager configuration reloads its subtree and reconnects **all manager-owned enabled services**; in-flight tool calls may be interrupted.
- The official client does not expose reliable live connection-health state. The management panel automatically calls `resources/list` through the official tool execution pipeline on the existing native connection on open, after enable/save, on return to visibility and every 60 visible seconds. No extra check click is needed; disabled services are skipped, hidden pages pause and closing the panel releases its timer. Requests are sequential and non-overlapping within a panel. Manual refresh retries immediately; success/failure and time remain in memory only. Results are historical, not a live-online guarantee; a server that does not support resources may fail this check despite working business tools. Plugin reload clears checks. Tool names are global-view names, not an Agent-specific complete inventory or reversible server ownership mapping.
- Namespace prechecks are best-effort snapshots; native scope reservations remain the final authority. Execution-influencing stdio environment overrides require manual review outside this UI; imports do not execute commands or expand expressions.
- External entries are read-only in this preview; inactive/unaddressable entries may not be listed by `configEditor.entries()`.
- No OAuth, legacy SSE, marketplace, automatic tool execution or automatic migration.
- A full replacement intentionally replaces omitted non-secret fields. Expression-bearing settings are not supported by the import format.
- Headers/env are stored by the host in the profile, not in a separate encrypted vault.

## Development

Run `node --test test/*.test.mjs`. The static host wiring test does not substitute for native runtime integration or desktop acceptance. Development and publication are tracked in the workspace OpenSpec change; publication requires separate authorization.
