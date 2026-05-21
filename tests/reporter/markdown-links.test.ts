import { describe, expect, it } from 'vitest';
import { marked } from 'marked';

/**
 * Documents the safety expectation: marked turns plain `https://…` URLs into
 * <a> tags by default, and our MarkdownPreview must strip those before they
 * reach the DOM. This test pins the regex behavior used in MarkdownPreview.
 */
const STRIP = (html: string) => html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');

describe('anchor stripping', () => {
  it('removes <a> tags marked generates for bare URLs but keeps the text', () => {
    const html = marked.parse('Redirect to https://idp.example.com/oauth/authorize?state=x') as string;
    expect(html).toContain('<a');
    const inert = STRIP(html);
    expect(inert).not.toContain('<a');
    expect(inert).toContain('https://idp.example.com/oauth/authorize?state=x');
  });

  it('removes explicit [text](url) link markdown', () => {
    const html = marked.parse('Click [here](https://example.com)') as string;
    const inert = STRIP(html);
    expect(inert).not.toContain('<a');
    expect(inert).toContain('here');
  });

  it('keeps non-anchor markup intact', () => {
    const html = marked.parse('**bold** and `code`') as string;
    const inert = STRIP(html);
    expect(inert).toContain('<strong>bold</strong>');
    expect(inert).toContain('<code>code</code>');
  });
});
