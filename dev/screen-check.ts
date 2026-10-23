import { readFileSync } from 'node:fs';

import brand from '../src/brand.json';

const minimumDp = 48;

type Box = { left: number; top: number; right: number; bottom: number };
type Control = { label: string; ownLabel: boolean; className: string; box: Box; clipped: boolean };

function attribute(tag: string, name: string): string {
  return tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1] ?? '';
}

function boxOf(tag: string): Box {
  const [left, top, right, bottom] = (attribute(tag, 'bounds').match(/\d+/g) ?? []).map(Number);
  return { left, top, right, bottom };
}

type Scroller = { box: Box; sideways: boolean };

// A control cut off by the edge of a scrolling list reports only its visible part.
function touchesEdge(box: Box, scroller: Scroller): boolean {
  const edge = scroller.box;
  return scroller.sideways ? box.left <= edge.left || box.right >= edge.right : box.top <= edge.top || box.bottom >= edge.bottom;
}

function controls(xml: string): Control[] {
  const found: Control[] = [];
  const open: { scroller: Scroller | null; control: Control | null }[] = [];
  for (const [tag] of xml.matchAll(/<node [^>]*?\/?>|<\/node>/g)) {
    if (tag === '</node>') {
      open.pop();
      continue;
    }
    const box = boxOf(tag);
    const spoken = attribute(tag, 'content-desc') || attribute(tag, 'text');
    const scroller = open.findLast((frame) => frame.scroller !== null)?.scroller ?? null;
    let control: Control | null = null;
    if (attribute(tag, 'clickable') === 'true' && attribute(tag, 'package') === brand.androidPackage) {
      control = { label: spoken, ownLabel: spoken !== '', className: attribute(tag, 'class'), box, clipped: scroller !== null && touchesEdge(box, scroller) };
      found.push(control);
    } else if (spoken !== '') {
      // TalkBack reads a control without a label of its own by the text inside it.
      const parent = open.findLast((frame) => frame.control !== null)?.control;
      if (parent !== undefined && parent !== null && !parent.ownLabel) {
        parent.label = `${parent.label} ${spoken}`.trim();
      }
    }
    if (!tag.endsWith('/>')) {
      const scrolls = attribute(tag, 'scrollable') === 'true';
      open.push({ scroller: scrolls ? { box, sideways: attribute(tag, 'class').includes('Horizontal') } : null, control });
    }
  }
  return found;
}

const [path, dpiText] = process.argv.slice(2);
if (path === undefined || dpiText === undefined) {
  console.error('usage: bun dev/screen-check.ts <dump.xml> <density in dpi>');
  process.exit(2);
}
const scale = Number(dpiText) / 160;
let problemCount = 0;
for (const control of controls(readFileSync(path, 'utf8'))) {
  const width = (control.box.right - control.box.left) / scale;
  const height = (control.box.bottom - control.box.top) / scale;
  const problems: string[] = [];
  if (control.label === '') {
    problems.push('no label');
  }
  if ((width < minimumDp || height < minimumDp) && !control.clipped) {
    problems.push('too small');
  }
  problemCount += problems.length;
  const mark = problems.length === 0 ? 'ok' : problems.join(', ');
  console.log(`  ${mark}: ${control.label || '(no label)'} [${control.className}] ${Math.round(width)}x${Math.round(height)} dp`);
}
console.log(`${problemCount} problems`);
process.exit(problemCount === 0 ? 0 : 1);
