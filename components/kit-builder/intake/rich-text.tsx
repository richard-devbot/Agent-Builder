/**
 * Minimal formatting for agent replies: paragraphs, "- " bullet lists and
 * **bold**. Model text is rendered as React text nodes, never as HTML.
 */

import { Fragment } from "react";

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function RichText({ text }: { text: string }) {
  const blocks: { type: "p" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ type: "p", lines: [] });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (bullet) {
      if (last?.type === "ul") last.lines.push(bullet[1]);
      else blocks.push({ type: "ul", lines: [bullet[1]] });
    } else if (last?.type === "p" && last.lines.length) last.lines.push(line);
    else blocks.push({ type: "p", lines: [line] });
  }
  return (
    <div className="space-y-1.5">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.type === "ul" ? (
            <ul key={i} className="ml-4 list-disc space-y-0.5 marker:text-primary/60">
              {b.lines.map((l, j) => (
                <li key={j}>{inline(l)}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{inline(b.lines.join(" "))}</p>
          ),
        )}
    </div>
  );
}
