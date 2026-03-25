# btw-opencode

A plugin for OpenCode — inspired by Claude Code's `/btw` command — that lets you fork a session and run prompts in the background.

Similar to Claude Code's `/btw`, this lets you ask questions or run side tasks without interrupting your main conversation thread. The forked session runs independently, keeping your main session context lean and saving tokens.

## Features

- Fork sessions for background tasks
- Automatic recovery if the forked session is deleted
- Titles inherited from parent session with `#BTW` prefix
- Notifications when background tasks complete

## Installation

### Option 1: From npm (recommended)

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["btw-opencode"]
}
```

Then restart OpenCode. The plugin will be installed automatically via Bun.

### Option 2: Local plugin

Clone this repo and place the built `dist/btw-opencode.js` in your plugins directory:

- **Project-level**: `.opencode/plugins/`
- **Global**: `~/.config/opencode/plugins/`

Build the plugin:
```bash
bun install
bun run build
```

Then copy `dist/btw-opencode.js` to your plugins directory.

## Usage

Use the `/btw` command to ask a side question or add context without interrupting your main conversation:

```
/btw <your question or note>
```

Examples:
```
/btw what version of Node.js does this project use?
/btw I'm targeting Python 3.10 for compatibility
/btw can you explain what this regex does?
```

The forked session will:
- Inherit the parent session's title with a `#BTW` prefix
- Run independently in the background
- Notify you when it completes

If the forked session is deleted, the plugin will automatically create a new one and retry.

## License

MIT