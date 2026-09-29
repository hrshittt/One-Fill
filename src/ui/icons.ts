/**
 * Inline stroke icons (24×24 grid), built with createElementNS — no innerHTML.
 */

type Shape =
  | ['path', string]
  | ['circle', number, number, number]
  | ['rect', number, number, number, number, number];

const ICONS = {
  check: [['path', 'M20 6 9 17l-5-5']],
  x: [['path', 'M18 6 6 18'], ['path', 'm6 6 12 12']],
  chevronRight: [['path', 'm9 18 6-6-6-6']],
  chevronLeft: [['path', 'm15 18-6-6 6-6']],
  chevronDown: [['path', 'm6 9 6 6 6-6']],
  plus: [['path', 'M5 12h14'], ['path', 'M12 5v14']],
  sliders: [['path', 'M4 21v-7'], ['path', 'M4 10V3'], ['path', 'M12 21v-9'], ['path', 'M12 8V3'], ['path', 'M20 21v-5'], ['path', 'M20 12V3'], ['path', 'M1 14h6'], ['path', 'M9 8h6'], ['path', 'M17 16h6']],
  user: [['circle', 12, 8, 4], ['path', 'M20 21a8 8 0 0 0-16 0']],
  clock: [['circle', 12, 12, 10], ['path', 'M12 6v6l4 2']],
  shield: [['path', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z']],
  shieldCheck: [['path', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'], ['path', 'm9 12 2 2 4-4']],
  alert: [['path', 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'], ['path', 'M12 9v4'], ['path', 'M12 17h.01']],
  help: [['circle', 12, 12, 10], ['path', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'], ['path', 'M12 17h.01']],
  lock: [['rect', 3, 11, 18, 11, 2], ['path', 'M7 11V7a5 5 0 0 1 10 0v4']],
  trash: [['path', 'M3 6h18'], ['path', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'], ['path', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2']],
  upload: [['path', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'], ['path', 'm17 8-5-5-5 5'], ['path', 'M12 3v12']],
  download: [['path', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'], ['path', 'm7 10 5 5 5-5'], ['path', 'M12 15V3']],
  sparkles: [['path', 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z'], ['path', 'M20 3v4'], ['path', 'M22 5h-4']],
  eye: [['path', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'], ['circle', 12, 12, 3]],
  eyeOff: [['path', 'M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94'], ['path', 'M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19'], ['path', 'm1 1 22 22'], ['path', 'M14.12 14.12a3 3 0 1 1-4.24-4.24']],
  file: [['path', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'], ['path', 'M14 2v6h6'], ['path', 'M16 13H8'], ['path', 'M16 17H8']],
  refresh: [['path', 'M21 12a9 9 0 1 1-2.64-6.36'], ['path', 'M21 3v6h-6']],
  external: [['path', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'], ['path', 'M15 3h6v6'], ['path', 'M10 14 21 3']],
  moon: [['path', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']],
  sun: [['circle', 12, 12, 4], ['path', 'M12 2v2'], ['path', 'M12 20v2'], ['path', 'm4.93 4.93 1.41 1.41'], ['path', 'm17.66 17.66 1.41 1.41'], ['path', 'M2 12h2'], ['path', 'M20 12h2'], ['path', 'm6.34 17.66-1.41 1.41'], ['path', 'm19.07 4.93-1.41 1.41']],
  undo: [['path', 'M3 7v6h6'], ['path', 'M21 17a9 9 0 0 0-15-6.7L3 13']],
  info: [['circle', 12, 12, 10], ['path', 'M12 16v-4'], ['path', 'M12 8h.01']],
  graduation: [['path', 'M22 10 12 5 2 10l10 5 10-5z'], ['path', 'M6 12v5c3 3 9 3 12 0v-5']],
  briefcase: [['rect', 2, 7, 20, 14, 2], ['path', 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16']],
  mapPin: [['path', 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z'], ['circle', 12, 10, 3]],
  phone: [['path', 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z']],
  idCard: [['rect', 2, 5, 20, 14, 2], ['circle', 8, 12, 2], ['path', 'M13 10h5'], ['path', 'M13 14h4']],
  heartPulse: [['path', 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z'], ['path', 'M3.2 12h3.3l1.5-3 2 6 1.5-3h3']],
  mail: [['rect', 2, 4, 20, 16, 2], ['path', 'm22 7-10 5L2 7']],
  globe: [['circle', 12, 12, 10], ['path', 'M2 12h20'], ['path', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z']],
  clipboard: [['rect', 8, 2, 8, 4, 1], ['path', 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'], ['path', 'M12 11h4'], ['path', 'M12 16h4'], ['path', 'M8 11h.01'], ['path', 'M8 16h.01']],
  search: [['circle', 11, 11, 8], ['path', 'm21 21-4.3-4.3']],
  pencil: [['path', 'M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z']],
  zap: [['path', 'M13 2 3 14h9l-1 8 10-12h-9l1-8z']],
  copy: [['rect', 9, 9, 13, 13, 2], ['path', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1']],
  database: [['path', 'M3 5c0-1.66 4-3 9-3s9 1.34 9 3-4 3-9 3-9-1.34-9-3z'], ['path', 'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5'], ['path', 'M3 12c0 1.66 4 3 9 3s9-1.34 9-3']],
  keyboard: [['rect', 2, 4, 20, 16, 2], ['path', 'M6 8h.01'], ['path', 'M10 8h.01'], ['path', 'M14 8h.01'], ['path', 'M18 8h.01'], ['path', 'M8 12h.01'], ['path', 'M12 12h.01'], ['path', 'M16 12h.01'], ['path', 'M7 16h10']],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name: IconName, size = 18, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  for (const shape of ICONS[name] as Shape[]) {
    const [type, ...args] = shape;
    const node = document.createElementNS(SVG_NS, type);
    if (type === 'path') node.setAttribute('d', args[0] as string);
    if (type === 'circle') ['cx', 'cy', 'r'].forEach((a, i) => node.setAttribute(a, String(args[i])));
    if (type === 'rect') ['x', 'y', 'width', 'height', 'rx'].forEach((a, i) => node.setAttribute(a, String(args[i])));
    svg.appendChild(node);
  }
  return svg;
}

/** The One-Fill mark: gradient rounded square with a check. */
export function logoMark(size = 28): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'logo-mark');
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  const defs = document.createElementNS(SVG_NS, 'defs');
  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  gradient.setAttribute('id', id);
  gradient.setAttribute('x1', '0');
  gradient.setAttribute('y1', '0');
  gradient.setAttribute('x2', '1');
  gradient.setAttribute('y2', '1');
  for (const [offset, color] of [['0', '#6366f1'], ['1', '#8b5cf6']]) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset!);
    stop.setAttribute('stop-color', color!);
    gradient.appendChild(stop);
  }
  defs.appendChild(gradient);
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', '32');
  rect.setAttribute('height', '32');
  rect.setAttribute('rx', '9');
  rect.setAttribute('fill', `url(#${id})`);
  const lines = document.createElementNS(SVG_NS, 'path');
  lines.setAttribute('d', 'M9 11h9M9 16h6');
  lines.setAttribute('stroke', 'rgba(255,255,255,0.55)');
  lines.setAttribute('stroke-width', '2.4');
  lines.setAttribute('stroke-linecap', 'round');
  const check = document.createElementNS(SVG_NS, 'path');
  check.setAttribute('d', 'M15.5 21.2l3.1 3 6.4-7.2');
  check.setAttribute('stroke', '#fff');
  check.setAttribute('stroke-width', '2.8');
  check.setAttribute('fill', 'none');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');
  svg.append(defs, rect, lines, check);
  return svg;
}
