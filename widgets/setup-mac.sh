#!/bin/bash
# Sets up the Study Organiser desktop widget on macOS.
#
#   curl -fsSL https://bjarnewen.github.io/StudyOrganiser/widgets/setup-mac.sh -o ~/Downloads/setup-mac.sh
#   bash ~/Downloads/setup-mac.sh
#
# Run it as a file rather than pasting it: a pasted block would feed its own
# next line into the prompts below instead of waiting for you to type.

set -u

# The published site is the primary source; the repository is the fallback, so
# the script still works in the minutes after a deploy before Pages catches up.
WIDGET_URL="https://bjarnewen.github.io/StudyOrganiser/widgets/study-organiser.jsx"
WIDGET_URL_FALLBACK="https://raw.githubusercontent.com/bjarnewen/StudyOrganiser/main/widgets/study-organiser.jsx"
CONFIG_DIR="$HOME/.config/study-organiser"
WIDGET_DIR="$HOME/Library/Application Support/Übersicht/widgets"

say()  { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if [ ! -t 0 ]; then
  fail "Run this as a file (bash ~/Downloads/setup-mac.sh), not piped into bash — it needs to prompt you."
fi

say "Study Organiser — Mac widget setup"
say ""

# --- Übersicht ---------------------------------------------------------------
if [ ! -d "/Applications/Übersicht.app" ] && [ ! -d "$HOME/Applications/Übersicht.app" ]; then
  say "Note: Übersicht doesn't appear to be in Applications."
  say "      Install it from https://tracesof.net/uebersicht/ and launch it once."
  say "      Carrying on — the widget file will be put in place ready for it."
  say ""
fi

mkdir -p "$WIDGET_DIR" || fail "Could not create $WIDGET_DIR"
mkdir -p "$CONFIG_DIR" || fail "Could not create $CONFIG_DIR"

# --- credentials -------------------------------------------------------------
existing_token=""
[ -f "$CONFIG_DIR/token" ] && existing_token=$(tr -d '[:space:]' < "$CONFIG_DIR/token")
existing_gist=""
[ -f "$CONFIG_DIR/gist-id" ] && existing_gist=$(tr -d '[:space:]' < "$CONFIG_DIR/gist-id")

if [ -n "$existing_token" ]; then
  printf 'A token is already saved. Keep it? [Y/n] '
  read -r keep
  case "$keep" in [Nn]*) existing_token="" ;; esac
fi

if [ -z "$existing_token" ]; then
  say "Paste the GitHub token the app uses (classic, 'gist' scope only)."
  printf 'Token (hidden): '
  stty -echo 2>/dev/null
  read -r token
  stty echo 2>/dev/null
  printf '\n'
  token=$(printf '%s' "$token" | tr -d '[:space:]')
  [ -z "$token" ] && fail "No token entered."
else
  token="$existing_token"
fi

if [ -n "$existing_gist" ]; then
  printf 'Gist ID %s is already saved. Keep it? [Y/n] ' "$existing_gist"
  read -r keep
  case "$keep" in [Nn]*) existing_gist="" ;; esac
fi

if [ -z "$existing_gist" ]; then
  say ""
  say "Now the Gist ID — in the app, Settings -> Sync Across Devices -> Gist ID (click it to copy)."
  printf 'Gist ID: '
  read -r gist
  gist=$(printf '%s' "$gist" | tr -d '[:space:]')
  [ -z "$gist" ] && fail "No gist ID entered."
else
  gist="$existing_gist"
fi

# --- check the credentials actually work before saving them ------------------
say ""
say "Checking those against GitHub…"
response=$(mktemp)
status=$(curl -sS -o "$response" -w '%{http_code}' --max-time 20 \
  -H "Authorization: Bearer $token" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/gists/$gist" 2>/dev/null)

case "$status" in
  200) : ;;
  401) rm -f "$response"; fail "GitHub rejected the token (401). Check you pasted it whole." ;;
  403) rm -f "$response"; fail "GitHub refused it (403). The token probably lacks the 'gist' scope." ;;
  404) rm -f "$response"; fail "No gist with that ID (404). Re-copy it from the app's Settings." ;;
  000) rm -f "$response"; fail "Could not reach GitHub. Check your connection." ;;
  *)   rm -f "$response"; fail "GitHub returned $status." ;;
esac

if ! grep -q 'study-organiser.json' "$response"; then
  rm -f "$response"
  fail "That gist exists but holds no Study Organiser data. Is it the right ID?"
fi
rm -f "$response"
say "  ✓ token and gist ID are good"

printf '%s' "$token" > "$CONFIG_DIR/token"
printf '%s' "$gist"  > "$CONFIG_DIR/gist-id"
chmod 600 "$CONFIG_DIR/token" "$CONFIG_DIR/gist-id"
say "  ✓ saved to $CONFIG_DIR (readable only by you)"

# --- the widget itself -------------------------------------------------------
if ! curl -fsSL --max-time 30 "$WIDGET_URL" -o "$WIDGET_DIR/study-organiser.jsx"; then
  say "  · the published copy wasn't reachable, trying the repository…"
  if ! curl -fsSL --max-time 30 "$WIDGET_URL_FALLBACK" -o "$WIDGET_DIR/study-organiser.jsx"; then
    fail "Could not download the widget from either $WIDGET_URL or $WIDGET_URL_FALLBACK"
  fi
fi
say "  ✓ widget installed in $WIDGET_DIR"

say ""
say "Done. If the widget isn't on your desktop within a few seconds, click the"
say "Übersicht icon in the menu bar and choose 'Refresh All Widgets'."
