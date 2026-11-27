import { describe, expect, it } from 'vitest';
import { analyzeSelector } from '../src/index.js';

describe('analyzeSelector', () => {
  it('detects combinators', () => {
    expect(analyzeSelector('.a > .b + .c ~ .d .e')).toMatchObject({
      child: true,
      adjacent: true,
      generalSibling: true,
      descendant: true,
    });
  });

  it('ignores combinators inside pseudo-class arguments', () => {
    expect(analyzeSelector('p:not(.a > .b)')).toMatchObject({ child: false, type: true });
  });

  it('ignores combinators inside attribute values', () => {
    expect(analyzeSelector('a[href~="x > y"]')).toMatchObject({
      child: false,
      generalSibling: false,
      attribute: true,
    });
  });

  it('detects grouping and chaining', () => {
    expect(analyzeSelector('.a.b, #c')).toMatchObject({ grouping: true, chaining: true, id: true });
  });
});
