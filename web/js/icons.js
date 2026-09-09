// Line icons standing in for the SF Symbols the SwiftUI version used.
// Each entry is the inner markup of a 24x24 stroked SVG.

function radialTicks(count, inner, outer) {
  let path = '';
  for (let i = 0; i < count; i += 1) {
    const angle = (i * 2 * Math.PI) / count;
    const x1 = (12 + inner * Math.cos(angle)).toFixed(2);
    const y1 = (12 + inner * Math.sin(angle)).toFixed(2);
    const x2 = (12 + outer * Math.cos(angle)).toFixed(2);
    const y2 = (12 + outer * Math.sin(angle)).toFixed(2);
    path += `M${x1} ${y1}L${x2} ${y2}`;
  }
  return path;
}

/// A toothed outline, so Settings doesn't end up looking like the Today sun.
function gearPath(teeth, outer, inner) {
  const step = (2 * Math.PI) / teeth;
  const tooth = step * 0.40;
  const slope = step * 0.13;
  const point = (angle, radius) =>
    `${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`;

  let path = '';
  for (let i = 0; i < teeth; i += 1) {
    const base = i * step;
    path += `${i === 0 ? 'M' : 'L'}${point(base - tooth / 2, outer)}`;
    path += `L${point(base + tooth / 2, outer)}`;
    path += `L${point(base + tooth / 2 + slope, inner)}`;
    path += `L${point(base + step - tooth / 2 - slope, inner)}`;
  }
  return `${path}Z`;
}

const PATHS = {
  // Sidebar
  'sun.max.fill': `<circle cx="12" cy="12" r="4.4"/><path d="${radialTicks(8, 7, 9.6)}"/>`,
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  checklist: '<path d="M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8"/>',
  'books.vertical.fill': '<rect x="3" y="4" width="5" height="16" rx="1.4"/><rect x="10" y="4" width="5" height="16" rx="1.4"/><path d="M17.2 5.2l3.6 1-3.4 13-3.6-1z"/>',
  'gearshape.fill': `<path d="${gearPath(7, 9.4, 7.0)}"/><circle cx="12" cy="12" r="3.1"/>`,

  // Class types
  'person.wave.2.fill': '<circle cx="9" cy="7" r="3"/><path d="M3.5 20a5.5 5.5 0 0111 0M17 8.5a5 5 0 010 7M20 6.5a8 8 0 010 11"/>',
  'person.2.fill': '<circle cx="8.5" cy="8" r="3"/><path d="M2.5 19a6 6 0 0112 0"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15 19a5 5 0 016.5-4.3"/>',
  'flask.fill': '<path d="M10 3v6.2L4.8 18a2 2 0 001.7 3h11a2 2 0 001.7-3L14 9.2V3M9 3h6M7.4 14h9.2"/>',
  'list.clipboard.fill': '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 4M9 11h6M9 15h6"/>',

  // Everything else
  'mappin.and.ellipse': '<path d="M12 21c4-4.5 6-7.6 6-10a6 6 0 10-12 0c0 2.4 2 5.5 6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  'flag.fill': '<path d="M5 21V4M5 5h11l-2 3.5L16 12H5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
  checkmark: '<path d="M5 13l4.5 4.5L19 7"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  'checkmark.circle.fill': '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.2l2.8 2.8L16 9.6"/>',
  'chevron.right': '<path d="M9.5 5l7 7-7 7"/>',
  xmark: '<path d="M6 6l12 12M18 6L6 18"/>',
  'arrow.clockwise': '<path d="M20 12a8 8 0 11-2.6-5.9M20 4v4.5h-4.5"/>',
  'square.and.arrow.down': '<path d="M12 3v11M7.5 10L12 14.5 16.5 10M4 17v2.5A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5V17"/>',
  link: '<path d="M10 14a4.5 4.5 0 006.4 0l2.6-2.6a4.5 4.5 0 10-6.4-6.4L11 6.6M14 10a4.5 4.5 0 00-6.4 0L5 12.6a4.5 4.5 0 106.4 6.4l1.6-1.6"/>',
  'cup.and.saucer': '<path d="M4 5h13v5a6.5 6.5 0 01-13 0zM17 6h1.6a2.4 2.4 0 010 4.8H17M3 19h16"/>',
  'moon.zzz': '<path d="M12.5 3A8.5 8.5 0 1021 11.5 6.8 6.8 0 0112.5 3z"/>',
  'books.vertical': '<rect x="3" y="4" width="5" height="16" rx="1.4"/><rect x="10" y="4" width="5" height="16" rx="1.4"/>',
  'icloud.fill': '<path d="M7 19h10.5a4 4 0 00.6-7.95A6 6 0 006.4 9.6 3.7 3.7 0 007 19z"/>',
  'exclamationmark.triangle': '<path d="M12 3.5L21.5 20h-19zM12 10v4.5M12 17.2v.1"/>',
  'line.3.horizontal.decrease.circle': '<path d="M4 7h16M6.5 12h11M9.5 17h5"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  doc: '<path d="M6 3h7l5 5v13H6zM13 3v5h5"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z"/>',
};

export function icon(name, { className = '' } = {}) {
  const inner = PATHS[name] || PATHS.circle;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export const TYPE_SYMBOLS = {
  Lecture: 'person.wave.2.fill',
  Tutorial: 'person.2.fill',
  Practical: 'flask.fill',
  Exam: 'list.clipboard.fill',
  Other: 'calendar',
};

export const SECTION_SYMBOLS = {
  today: 'sun.max.fill',
  schedule: 'calendar',
  assignments: 'checklist',
  subjects: 'books.vertical.fill',
  settings: 'gearshape.fill',
};
