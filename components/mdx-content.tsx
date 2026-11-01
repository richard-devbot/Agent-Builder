import { MDXRemote, type MDXRemoteProps } from "next-mdx-remote/rsc";
import { codeToHtml, type BundledLanguage } from "shiki";
import { isValidElement, type ReactNode } from "react";
import remarkGfm from "remark-gfm";

const SHIKI_THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const;

const KNOWN_LANGS: ReadonlySet<string> = new Set<BundledLanguage>([
  "bash",
  "css",
  "diff",
  "dockerfile",
  "go",
  "graphql",
  "html",
  "ini",
  "java",
  "javascript",
  "js",
  "json",
  "jsonc",
  "jsx",
  "kotlin",
  "markdown",
  "md",
  "mdx",
  "nginx",
  "php",
  "powershell",
  "python",
  "ruby",
  "rust",
  "scss",
  "shell",
  "sh",
  "sql",
  "svelte",
  "swift",
  "terraform",
  "toml",
  "tsx",
  "typescript",
  "ts",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
] as BundledLanguage[]);

function resolveLang(raw: string | undefined): BundledLanguage {
  if (!raw) return "text" as BundledLanguage;
  const normalized = raw.toLowerCase();
  if (KNOWN_LANGS.has(normalized)) return normalized as BundledLanguage;
  return "text" as BundledLanguage;
}

type CodeChildProps = { className?: string; children?: ReactNode };

async function Pre({ children }: { children?: ReactNode }) {
  if (!isValidElement(children)) {
    return <pre className="my-4 overflow-x-auto rounded-lg border bg-muted p-4 text-[13px]">{children}</pre>;
  }
  const { className, children: code } = children.props as CodeChildProps;
  const lang = resolveLang(className?.replace(/^language-/, ""));
  const source = String(code ?? "").replace(/\n$/, "");

  let html: string;
  try {
    html = await codeToHtml(source, { lang, themes: SHIKI_THEMES });
  } catch {
    html = await codeToHtml(source, {
      lang: "text" as BundledLanguage,
      themes: SHIKI_THEMES,
    });
  }

  return (
    <div
      className="shiki-block my-4 overflow-x-auto rounded-lg border border-border text-[13px] leading-relaxed [&>pre]:p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function InlineCode({ children, ...rest }: CodeChildProps) {
  return (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
      {...rest}
    >
      {children}
    </code>
  );
}

const components = {
  pre: Pre,
  code: InlineCode,
} as unknown as MDXRemoteProps["components"];

// GFM adds tables, task lists and strikethrough, which the content files use.
const options: MDXRemoteProps["options"] = {
  mdxOptions: { remarkPlugins: [remarkGfm] },
};

export function MDXContent({ source }: { source: string }) {
  return <MDXRemote source={source} components={components} options={options} />;
}
