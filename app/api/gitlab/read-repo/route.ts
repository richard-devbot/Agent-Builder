import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import { loadGitLabServerConfig } from "@/lib/config/server";
import { getValidGitLabAuth } from "@/lib/gitlab/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseGitLabProjectPath(
  rawInput: string,
  defaultBaseUrl: string,
): { baseUrl: string; projectPath: string } | null {
  const trimmed = rawInput.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const cleanPath = u.pathname
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/-\/.*$/, "");
      if (!cleanPath || !cleanPath.includes("/")) return null;
      return {
        baseUrl: `${u.protocol}//${u.host}`,
        projectPath: cleanPath,
      };
    } catch {
      return null;
    }
  }

  const cleanPath = trimmed.replace(/^\/+|\/+$/g, "");
  if (!cleanPath.includes("/")) return null;
  return {
    baseUrl: defaultBaseUrl.replace(/\/$/, ""),
    projectPath: cleanPath,
  };
}

function inferTechnologiesFromRepo(
  paths: string[],
  manifests: Record<string, string>,
): string[] {
  const found = new Set<string>();
  const lowerPaths = paths.map((p) => p.toLowerCase());
  const allManifestText = Object.values(manifests).join("\n").toLowerCase();

  if (
    lowerPaths.some(
      (p) =>
        p.endsWith(".py") ||
        p.endsWith("requirements.txt") ||
        p.endsWith("pyproject.toml"),
    )
  ) {
    found.add("python");
  }
  if (allManifestText.includes("fastapi")) found.add("fastapi");
  if (
    lowerPaths.some((p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith("tsconfig.json"))
  ) {
    found.add("typescript");
  }
  if (allManifestText.includes('"next"') || lowerPaths.some((p) => p.includes("next.config"))) {
    found.add("nextjs");
    found.add("react");
  } else if (allManifestText.includes('"react"')) {
    found.add("react");
  }
  if (allManifestText.includes("tailwindcss") || lowerPaths.some((p) => p.includes("tailwind.config"))) {
    found.add("tailwind");
  }
  if (lowerPaths.some((p) => p.endsWith("dockerfile") || p.includes("docker-compose"))) {
    found.add("docker");
  }
  if (lowerPaths.some((p) => p.endsWith(".gitlab-ci.yml"))) {
    found.add("github-actions");
  }
  if (lowerPaths.some((p) => p.endsWith(".tf"))) {
    found.add("terraform");
  }
  if (allManifestText.includes("postgres") || allManifestText.includes("psycopg") || allManifestText.includes("pg")) {
    found.add("postgres");
  }
  if (allManifestText.includes("pytest") || lowerPaths.some((p) => p.includes("test_"))) {
    found.add("pytest");
  }
  if (allManifestText.includes("vitest") || allManifestText.includes("jest")) {
    found.add("vitest");
  }

  return [...found];
}

export async function POST(req: NextRequest) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  let body: { repoUrl?: string; ref?: string; githubToken?: string };
  try {
    body = (await req.json()) as {
      repoUrl?: string;
      ref?: string;
      githubToken?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const config = loadGitLabServerConfig();
  const parsedTarget = parseGitLabProjectPath(
    body.repoUrl || "",
    config.baseUrl,
  );
  if (!parsedTarget) {
    return NextResponse.json(
      {
        error:
          "Enter a valid GitLab repository URL or group/project path (e.g. my-group/my-project).",
      },
      { status: 400 },
    );
  }

  const authCtx = await getValidGitLabAuth(req);
  const token = body.githubToken?.trim() || authCtx?.accessToken || config.accessToken;

  if (!token) {
    return NextResponse.json(
      {
        error:
          "Connect GitLab via Personal Access Token or OAuth (or paste a token below) to read repository contents.",
      },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "PRIVATE-TOKEN": token,
  };

  const apiBase = `${parsedTarget.baseUrl}/api/v4`;
  const encodedPath = encodeURIComponent(parsedTarget.projectPath);

  const projRes = await fetch(`${apiBase}/projects/${encodedPath}`, {
    headers,
    cache: "no-store",
  });
  if (!projRes.ok) {
    return NextResponse.json(
      {
        error: `Could not read GitLab repository '${parsedTarget.projectPath}' (HTTP ${projRes.status}). Check the path and token permissions.`,
      },
      { status: projRes.status },
    );
  }

  const proj = (await projRes.json()) as {
    id: number;
    name: string;
    path_with_namespace: string;
    description?: string | null;
    default_branch?: string;
    web_url: string;
    topics?: string[];
  };

  const ref = body.ref?.trim() || proj.default_branch || "main";
  const treeRes = await fetch(
    `${apiBase}/projects/${proj.id}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(ref)}`,
    { headers, cache: "no-store" },
  );
  const treeItems = treeRes.ok
    ? ((await treeRes.json()) as Array<{ path: string; type: string }>)
    : [];
  const filePaths = treeItems
    .filter((i) => i.type === "blob")
    .map((i) => i.path);

  const candidateFiles = [
    "README.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    ".gitlab-ci.yml",
  ].filter((f) =>
    filePaths.some((p) => p.toLowerCase() === f.toLowerCase()),
  );

  const manifests: Record<string, string> = {};
  await Promise.all(
    candidateFiles.map(async (filePath) => {
      const actualPath =
        filePaths.find((p) => p.toLowerCase() === filePath.toLowerCase()) ||
        filePath;
      const rawRes = await fetch(
        `${apiBase}/projects/${proj.id}/repository/files/${encodeURIComponent(actualPath)}/raw?ref=${encodeURIComponent(ref)}`,
        { headers, cache: "no-store" },
      ).catch(() => null);
      if (rawRes && rawRes.ok) {
        const text = await rawRes.text();
        manifests[actualPath] = text.slice(0, 3000);
      }
    }),
  );

  const suggestedTechnologies = inferTechnologiesFromRepo(filePaths, manifests);
  const summary =
    proj.description?.trim() ||
    `Imported GitLab repository ${proj.path_with_namespace} (${filePaths.length} files on branch '${ref}').`;

  const mdLines = [
    `# Repository Context — ${proj.name} (\`${proj.path_with_namespace}\`)`,
    "",
    `- **Repository URL**: ${proj.web_url}`,
    `- **Default Branch**: \`${ref}\``,
    `- **Files Scanned**: ${filePaths.length}`,
    ...(suggestedTechnologies.length
      ? [`- **Detected Stack**: ${suggestedTechnologies.join(", ")}`]
      : []),
    "",
    "## Summary",
    summary,
    "",
    "## File Structure (Top-Level & Key Files)",
    "```text",
    ...filePaths.slice(0, 45),
    "```",
  ];

  if (manifests["README.md"]) {
    mdLines.push("", "## README Excerpt", manifests["README.md"].slice(0, 1200));
  }

  return NextResponse.json({
    discovery: {
      projectContextMarkdown: mdLines.join("\n"),
      suggestedTechnologies,
      summary,
    },
  });
}
