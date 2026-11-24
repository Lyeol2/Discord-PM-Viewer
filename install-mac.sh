#!/bin/bash
# Install or update PM Viewer on macOS from the latest GitHub release:
#   curl -fsSL https://raw.githubusercontent.com/Lyeol2/Discord-PM-Viewer/main/install-mac.sh | bash
#
# The app isn't signed with a paid Apple Developer certificate, so a .dmg downloaded in a browser is blocked by
# Gatekeeper. Files fetched with curl don't get the "downloaded from the internet" mark, so this install isn't.
# The download is checked against the sha512 in the release's latest-mac.yml before anything is replaced.
set -euo pipefail

REPO="Lyeol2/Discord-PM-Viewer"
APP="PM Viewer.app"
BASE="https://github.com/$REPO/releases/latest/download"
DEST="${PM_VIEWER_DEST:-/Applications}"

case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) echo "지원하지 않는 CPU예요: $(uname -m)" >&2; exit 1 ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "최신 버전 확인 중…"
curl -fsSL "$BASE/latest-mac.yml" -o "$tmp/latest-mac.yml"
version="$(awk '/^version:/ {print $2; exit}' "$tmp/latest-mac.yml")"
zip="$(grep -E "url: .*-mac-$ARCH\.zip$" "$tmp/latest-mac.yml" | head -1 | sed -E 's/.*url: //')"
sha="$(awk -v z="$zip" '$0 ~ "url: " z "$" {getline; sub(/.*sha512: /, ""); print; exit}' "$tmp/latest-mac.yml")"
if [ -z "$zip" ] || [ -z "$sha" ]; then
  echo "릴리즈에서 $ARCH 용 파일을 찾지 못했어요." >&2
  exit 1
fi

echo "PM Viewer v$version ($ARCH) 받는 중…"
curl -fL --progress-bar "$BASE/$zip" -o "$tmp/app.zip"

actual="$(shasum -a 512 "$tmp/app.zip" | awk '{print $1}' | xxd -r -p | base64)"
if [ "$actual" != "$sha" ]; then
  echo "받은 파일의 체크섬이 릴리즈와 달라요. 설치하지 않았어요." >&2
  exit 1
fi

ditto -x -k "$tmp/app.zip" "$tmp/unpacked"
if [ ! -d "$tmp/unpacked/$APP" ]; then
  echo "압축 안에 $APP 이 없어요." >&2
  exit 1
fi

if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

osascript -e 'tell application "PM Viewer" to quit' >/dev/null 2>&1 || true
sleep 1
rm -rf "${DEST:?}/$APP"
mv "$tmp/unpacked/$APP" "$DEST/"
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

echo "설치 완료: $DEST/$APP (v$version)"
open "$DEST/$APP"
