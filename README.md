# OpenCode Implement Agent

VSCode extension + opencode agent to auto-implement the function at cursor (via `opencode.completeFunction`).

Flat `implement.md` stored in this repo.

## Setup (symlink for opencode CLI)

```bash
mkdir -p ~/.config/opencode/agents
ln -sfn "$(pwd)/implement.md" ~/.config/opencode/agents/implement.md
```

## VSCode Extension

`src/extension.ts` provides task tracking, status bar, and `opencode.completeFunction` commands.

Install the OpenCode extension from the marketplace or:

```bash
code --install-extension <path-to-opencode.vsix>
```

## Recommendations

- Install [rtk](https://github.com/rtk-ai/rtk)
