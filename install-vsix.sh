#!/bin/bash

set -e

echo "Packaging extension..."
yes | vsce package

VSIX_FILE=$(ls -t *.vsix | head -1)
echo "Found VSIX: $VSIX_FILE"

EXT_ID="completefunction"

if code --list-extensions | grep -q "^$EXT_ID$"; then
  echo "Uninstalling existing $EXT_ID..."
  code --uninstall-extension "$EXT_ID"
fi

echo "Installing $VSIX_FILE..."
code --install-extension "$VSIX_FILE"

echo "Done."
echo ""
echo "⚠️  Reload the VS Code window to load the new extension version:"
echo "   Press Cmd+Shift+P → type 'Reload Window' → Enter"