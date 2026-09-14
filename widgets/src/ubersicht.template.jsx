// Study Organiser — macOS desktop widget (Übersicht)
//
// Reads the same private gist the app syncs to, so it always shows what the
// app shows. Setup is in the project README, under "Widgets".

export const refreshFrequency = 300000; // five minutes

// Reads the config, fetches the gist, and prints the data file. Any failure
// prints an {"error": …} object so render() can say what went wrong instead of
// showing an empty widget.
// Credentials live in two plain files, not in here, so this widget can be
// published without leaking anything:
//
//   ~/.config/study-organiser/token     the gist-scoped GitHub token
//   ~/.config/study-organiser/gist-id   the gist id, shown in the app's Settings
//
// Deliberately does no JSON parsing: macOS has no jq, and /usr/bin/python3 is a
// stub that nags you to install the Command Line Tools. So the shell only does
// cat and curl — both always present — and render() below does the parsing.
export const command = `
  DIR="$HOME/.config/study-organiser"
  TOKEN=$(cat "$DIR/token" 2>/dev/null | tr -d '[:space:]')
  GIST=$(cat "$DIR/gist-id" 2>/dev/null | tr -d '[:space:]')
  if [ -z "$TOKEN" ]; then
    echo '{"soError":"No token at ~/.config/study-organiser/token"}'; exit 0
  fi
  if [ -z "$GIST" ]; then
    echo '{"soError":"No gist id at ~/.config/study-organiser/gist-id"}'; exit 0
  fi
  curl -sS --max-time 20 \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/gists/$GIST" 2>/dev/null \
    || echo '{"soError":"Could not reach GitHub"}'
`;

//__AGENDA_CORE__

export const className = `
  top: 40px;
  right: 40px;
  width: 300px;
  font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
  color: #fff;
  -webkit-font-smoothing: antialiased;

  .so-card {
    background: rgba(28, 28, 30, 0.72);
    backdrop-filter: blur(24px) saturate(160%);
    border-radius: 16px;
    padding: 14px 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
  }
  .so-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
  .so-title { font-size: 13px; font-weight: 600; color: #0a84ff; letter-spacing: 0.01em; }
  .so-count { font-size: 11px; color: rgba(235, 235, 245, 0.6); }
  .so-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .so-rail { width: 3px; align-self: stretch; min-height: 18px; border-radius: 2px; flex: none; }
  .so-time { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 42px; }
  .so-name { font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .so-flag { font-size: 11px; font-weight: 700; color: #ff453a; }
  .so-past { opacity: 0.42; }
  .so-items { margin: -1px 0 4px 51px; display: flex; flex-direction: column; gap: 1px; }
  .so-item { font-size: 10.5px; line-height: 1.35; display: flex; gap: 5px; }
  .so-item span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .so-item.so-assignment { color: #ff453a; }
  .so-item.so-overdue { font-weight: 700; }
  .so-item.so-check { color: #ffd60a; }
  .so-more { font-size: 10px; color: rgba(235, 235, 245, 0.5); }
  .so-foot { margin-top: 8px; font-size: 11px; color: rgba(235, 235, 245, 0.6); }
  .so-foot.so-overdue { color: #ff453a; font-weight: 600; }
  .so-empty { font-size: 12px; color: rgba(235, 235, 245, 0.6); }
`;

/// Unwraps the gist API response into the app's document.
function readDocument(output) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    return { doc: null, error: 'Could not read the response from GitHub.' };
  }
  if (payload.soError) return { doc: null, error: payload.soError };
  if (payload.message) return { doc: null, error: `GitHub: ${payload.message}` };

  const file = payload.files && payload.files['study-organiser.json'];
  if (!file) return { doc: null, error: 'That gist has no Study Organiser data yet.' };
  if (file.truncated) return { doc: null, error: 'The synced data is too large to read here.' };

  try {
    return { doc: JSON.parse(file.content), error: null };
  } catch {
    return { doc: null, error: 'The synced data is not readable JSON.' };
  }
}

export const render = ({ output }) => {
  const { doc, error } = readDocument(output || '');

  const agenda = buildAgenda(doc, { use24Hour: true });

  if (error || agenda.empty) {
    return (
      <div className="so-card">
        <div className="so-head">
          <span className="so-title">Today</span>
        </div>
        <div className="so-empty">{error || 'No classes today.'}</div>
      </div>
    );
  }

  return (
    <div className="so-card">
      <div className="so-head">
        <span className="so-title">Today</span>
        <span className="so-count">
          {agenda.classes.length} {agenda.classes.length === 1 ? 'class' : 'classes'}
        </span>
      </div>

      {agenda.classes.map((entry) => (
        <div key={entry.id}>
          <div className={entry.isPast ? 'so-row so-past' : 'so-row'}>
            <div className="so-rail" style={{ background: `#${entry.colorHex}` }} />
            <span className="so-time">{entry.time}</span>
            <span className="so-name">{entry.subjectName}</span>
            {entry.reminderCount > 0 && <span className="so-flag">⚑{entry.reminderCount}</span>}
          </div>
          {entry.items.length > 0 && (
            <div className="so-items">
              {entry.items.slice(0, 4).map((item, index) => (
                <div
                  key={`${entry.id}-${index}`}
                  className={[
                    'so-item',
                    item.kind === 'assignment' ? 'so-assignment' : 'so-check',
                    item.overdue ? 'so-overdue' : '',
                  ].join(' ').trim()}
                >
                  <span>{item.kind === 'assignment' ? '●' : '○'}</span>
                  <span>{item.overdue ? `${item.text} — overdue` : item.text}</span>
                </div>
              ))}
              {entry.items.length > 4 && (
                <div className="so-more">+{entry.items.length - 4} more</div>
              )}
            </div>
          )}
        </div>
      ))}

      {agenda.dueToday.length > 0 && (
        <div className={agenda.overdueCount > 0 ? 'so-foot so-overdue' : 'so-foot'}>
          {agenda.overdueCount > 0 ? `${agenda.overdueCount} overdue · ` : ''}
          {agenda.dueToday.length} due
        </div>
      )}
    </div>
  );
};
