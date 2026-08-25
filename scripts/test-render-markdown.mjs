import assert from "node:assert/strict";
import { renderMarkdown, renderMarkdownPage } from "./render-markdown.mjs";

/* ---------- headings, paragraphs, inline spans ---------- */

{
  const html = renderMarkdown("# Title\n\nSome **bold** and *italic* and `code` text.");
  assert.equal(html, "<h1>Title</h1>\n<p>Some <strong>bold</strong> and <em>italic</em> and <code>code</code> text.</p>");
}

{
  // A link's own text can carry inline formatting too.
  const html = renderMarkdown("[**bold link**](https://example.com)");
  assert.equal(html, '<p><a href="https://example.com"><strong>bold link</strong></a></p>');
}

{
  // HTML-significant characters in plain text are escaped, not passed through.
  const html = renderMarkdown("1 < 2 & 3 > 0");
  assert.equal(html, "<p>1 &lt; 2 &amp; 3 &gt; 0</p>");
}

/* ---------- lists ---------- */

{
  const html = renderMarkdown("- one\n- two\n- three");
  assert.equal(html, "<ul><li>one</li><li>two</li><li>three</li></ul>");
}

{
  const html = renderMarkdown("1. first\n2. second");
  assert.equal(html, "<ol><li>first</li><li>second</li></ol>");
}

/* ---------- fenced code blocks: no inline-span or escaping surprises ---------- */

{
  const html = renderMarkdown("```\n[C] [Csus4] & <weird>\n```");
  assert.equal(html, "<pre><code>[C] [Csus4] &amp; &lt;weird&gt;</code></pre>");
}

/* ---------- pipe tables ---------- */

{
  const html = renderMarkdown("| A | B |\n|---|---|\n| one | two |\n| three | four |");
  assert.equal(
    html,
    "<table>\n<thead><tr><th>A</th><th>B</th></tr></thead>\n"
      + "<tbody><tr><td>one</td><td>two</td></tr><tr><td>three</td><td>four</td></tr></tbody>\n</table>",
  );
}

/* ---------- renderMarkdownPage: title comes from the first heading ---------- */

{
  const page = renderMarkdownPage("# My Page\n\nHello.");
  assert.match(page, /<title>My Page<\/title>/);
  assert.match(page, /<h1>My Page<\/h1>/);
  assert.match(page, /<p>Hello\.<\/p>/);
}

{
  // No heading at all: falls back to the caller's own title, doesn't throw.
  const page = renderMarkdownPage("Just a paragraph.", { fallbackTitle: "Fallback" });
  assert.match(page, /<title>Fallback<\/title>/);
}

console.log("test-render-markdown.mjs: all assertions passed.");
