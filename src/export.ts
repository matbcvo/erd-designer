import { getNodesBounds, type Node } from '@xyflow/react';
import { toPng } from 'html-to-image';

export function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, type: string) {
  downloadBlob(new Blob([text], { type }), filename);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounds of everything drawn: entities plus relationship lines (which can route outside them). */
function contentBounds(viewport: HTMLElement, nodes: Node[]): Box {
  const b = getNodesBounds(nodes);
  let x1 = b.x;
  let y1 = b.y;
  let x2 = b.x + b.width;
  let y2 = b.y + b.height;
  viewport.querySelectorAll<SVGGraphicsElement>('.react-flow__edge path, .react-flow__edge circle').forEach((el) => {
    try {
      const bb = el.getBBox();
      if (!bb.width && !bb.height) return;
      x1 = Math.min(x1, bb.x);
      y1 = Math.min(y1, bb.y);
      x2 = Math.max(x2, bb.x + bb.width);
      y2 = Math.max(y2, bb.y + bb.height);
    } catch {
      /* not rendered */
    }
  });
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

const PAD = 40;

/** Render the whole diagram (not just the visible part) to PNG or SVG. */
export async function exportImage(nodes: Node[], format: 'png' | 'svg', filename: string) {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || nodes.length === 0) return;
  const bounds = contentBounds(viewport, nodes);
  const background = cssVar('--canvas') || '#ffffff';
  if (format === 'svg') {
    downloadText(diagramToSvg(viewport, bounds, background), filename, 'image/svg+xml');
    return;
  }
  const width = Math.ceil(bounds.w + PAD * 2);
  const height = Math.ceil(bounds.h + PAD * 2);
  const dataUrl = await toPng(viewport, {
    backgroundColor: background,
    width,
    height,
    pixelRatio: 2,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${PAD - bounds.x}px, ${PAD - bounds.y}px) scale(1)`,
    },
    // Leave out interactive-only bits like connection handles.
    filter: (el: HTMLElement) => !(el.classList && el.classList.contains('react-flow__handle')),
  });
  downloadDataUrl(dataUrl, filename);
}

/* ------------------------------------------------------------ native SVG */

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const visible = (c: string) => !!c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);

/**
 * Build a plain SVG (rects, text, paths; no embedded HTML) from the rendered diagram,
 * so it opens correctly in any SVG viewer or editor.
 */
function diagramToSvg(viewport: HTMLElement, bounds: Box, background: string): string {
  const vp = viewport.getBoundingClientRect();
  const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a || 1;
  const toFlow = (r: DOMRect): Box => ({ x: (r.left - vp.left) / zoom, y: (r.top - vp.top) / zoom, w: r.width / zoom, h: r.height / zoom });
  const out: string[] = [];

  // Relationship lines: already SVG in flow coordinates; copy with resolved colours.
  viewport.querySelectorAll<SVGElement>('.react-flow__edge').forEach((g) => {
    g.querySelectorAll<SVGPathElement | SVGCircleElement>('path, circle').forEach((el) => {
      if (el.classList.contains('react-flow__edge-interaction')) return;
      const cs = getComputedStyle(el);
      if (!visible(cs.stroke) && !visible(cs.fill)) return;
      const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? ` stroke-dasharray="${cs.strokeDasharray.replace(/px/g, '')}"` : '';
      const fill = el.tagName === 'circle' ? (visible(cs.fill) ? cs.fill : 'none') : 'none';
      const common = `fill="${fill}" stroke="${cs.stroke}" stroke-width="${parseFloat(cs.strokeWidth) || 1.5}"${dash}`;
      if (el.tagName === 'circle') {
        out.push(`<circle cx="${el.getAttribute('cx')}" cy="${el.getAttribute('cy')}" r="${el.getAttribute('r')}" ${common}/>`);
      } else {
        out.push(`<path d="${el.getAttribute('d')}" ${common}/>`);
      }
    });
  });

  const textOf = (el: Element, box: Box, anchorMiddle = false) => {
    const cs = getComputedStyle(el);
    const t = (el.textContent ?? '').trim();
    if (!t) return;
    // Use the text's own box, which can be narrower than the element.
    const range = document.createRange();
    range.selectNodeContents(el);
    const tb = toFlow(range.getBoundingClientRect());
    const x = anchorMiddle ? tb.x + tb.w / 2 : tb.x;
    const y = (tb.h ? tb.y + tb.h / 2 : box.y + box.h / 2) + 0.5;
    const attrs = [
      `x="${num(x)}"`,
      `y="${num(y)}"`,
      `dominant-baseline="central"`,
      anchorMiddle ? 'text-anchor="middle"' : '',
      `font-size="${parseFloat(cs.fontSize)}"`,
      cs.fontWeight !== '400' && cs.fontWeight !== 'normal' ? `font-weight="${cs.fontWeight}"` : '',
      cs.fontStyle === 'italic' ? 'font-style="italic"' : '',
      cs.textDecorationLine.includes('underline') ? 'text-decoration="underline"' : '',
      /mono/i.test(cs.fontFamily) ? 'font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"' : '',
      `fill="${cs.color}"`,
    ].filter(Boolean);
    out.push(`<text ${attrs.join(' ')}>${esc(t)}</text>`);
  };

  // Edge labels (HTML in the app): background plate + text.
  viewport.querySelectorAll<HTMLElement>('.edge-label').forEach((el) => {
    const b = toFlow(el.getBoundingClientRect());
    const cs = getComputedStyle(el);
    out.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="4" fill="${cs.backgroundColor}"/>`);
    textOf(el, b, true);
  });

  // Entities.
  viewport.querySelectorAll<HTMLElement>('.react-flow__node .entity').forEach((ent) => {
    const b = toFlow(ent.getBoundingClientRect());
    const cs = getComputedStyle(ent);
    const header = ent.querySelector<HTMLElement>('.entity-header');
    const hb = header ? toFlow(header.getBoundingClientRect()) : null;
    const r = 7;
    out.push('<g>');
    out.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="${r}" fill="${cs.backgroundColor}" stroke="${cs.borderTopColor}" stroke-width="1"/>`);
    if (header && hb) {
      const hc = getComputedStyle(header).backgroundColor;
      const onlyHeader = hb.h >= b.h - 2;
      if (onlyHeader) {
        out.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="${r}" fill="${hc}"/>`);
      } else {
        // Rounded top corners only.
        const x = b.x, y = b.y, w = b.w, h = hb.y + hb.h - b.y;
        out.push(
          `<path d="M${num(x)},${num(y + h)} V${num(y + r)} Q${num(x)},${num(y)} ${num(x + r)},${num(y)} H${num(x + w - r)} Q${num(x + w)},${num(y)} ${num(x + w)},${num(y + r)} V${num(y + h)} Z" fill="${hc}"/>`,
        );
      }
      textOf(header, hb, true);
    }
    ent.querySelectorAll<HTMLTableRowElement>('.entity-attrs tr').forEach((tr) => {
      const rb = toFlow(tr.getBoundingClientRect());
      if (tr.classList.contains('pk-divider')) {
        const c = getComputedStyle(tr.cells[0]).borderBottomColor;
        out.push(`<line x1="${num(b.x)}" y1="${num(rb.y + rb.h)}" x2="${num(b.x + b.w)}" y2="${num(rb.y + rb.h)}" stroke="${c}" stroke-width="1"/>`);
      }
      tr.querySelectorAll<HTMLElement>('.badge').forEach((badge) => {
        const bb = toFlow(badge.getBoundingClientRect());
        const bc = getComputedStyle(badge).color;
        out.push(`<rect x="${num(bb.x + 0.5)}" y="${num(bb.y + 0.5)}" width="${num(bb.w - 1)}" height="${num(bb.h - 1)}" rx="3" fill="none" stroke="${bc}" stroke-width="1"/>`);
        textOf(badge, bb, true);
      });
      tr.querySelectorAll<HTMLElement>('td:not(.attr-keys)').forEach((td) => textOf(td, toFlow(td.getBoundingClientRect())));
    });
    out.push('</g>');
  });

  const w = Math.ceil(bounds.w + PAD * 2);
  const h = Math.ceil(bounds.h + PAD * 2);
  const font = getComputedStyle(document.documentElement).fontFamily.replace(/"/g, "'");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${num(bounds.x - PAD)} ${num(bounds.y - PAD)} ${w} ${h}" font-family="${esc(font)}">`,
    `<rect x="${num(bounds.x - PAD)}" y="${num(bounds.y - PAD)}" width="${w}" height="${h}" fill="${background}"/>`,
    ...out,
    '</svg>',
    '',
  ].join('\n');
}
