export interface SelectorInfo {
  raw: string;
  grouping: boolean;
  child: boolean;
  adjacent: boolean;
  generalSibling: boolean;
  descendant: boolean;
  type: boolean;
  universal: boolean;
  cls: boolean;
  id: boolean;
  attribute: boolean;
  chaining: boolean;
}

export function analyzeSelector(selector: string): SelectorInfo {
  let s = selector.replace(/"[^"]*"|'[^']*'/g, '""').replace(/\[[^\]]*\]/g, '[]');
  // Collapse pseudo-class arguments so `:not(.a > b)` does not count as a child combinator.
  while (/\([^()]+\)/.test(s)) s = s.replace(/\([^()]+\)/g, '()');

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const info: SelectorInfo = {
    raw: selector,
    grouping: parts.length > 1,
    child: false,
    adjacent: false,
    generalSibling: false,
    descendant: false,
    type: false,
    universal: false,
    cls: false,
    id: false,
    attribute: false,
    chaining: false,
  };

  for (const part of parts) {
    const tight = part.replace(/\s*([>+~])\s*/g, '$1');
    if (tight.includes('>')) info.child = true;
    if (tight.includes('+')) info.adjacent = true;
    if (tight.includes('~')) info.generalSibling = true;
    if (/\S\s+\S/.test(tight)) info.descendant = true;

    for (const compound of tight.split(/[\s>+~]+/)) {
      if (/^[a-z][\w-]*/i.test(compound)) info.type = true;
      if (compound.startsWith('*')) info.universal = true;
      if (/\.[\w-]/.test(compound)) info.cls = true;
      if (/#[\w-]/.test(compound)) info.id = true;
      if (compound.includes('[]')) info.attribute = true;
      if ((compound.match(/\.[\w-]+|#[\w-]+|\[\]/g) ?? []).length >= 2) info.chaining = true;
    }
  }
  return info;
}
