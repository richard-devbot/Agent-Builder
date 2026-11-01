import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { buildGoogleCloudKit, defaultGoogleCloudConfig, googleCloudSchema, missingGoogleSetup } from "../lib/kit/google-cloud";
import { createZip } from "../lib/kit/zip";

const complete = {
  ...defaultGoogleCloudConfig,
  projectId: "acme-agent-demo",
  repository: "acme/agent-demo",
  workloadIdentityProvider: "projects/123456789012/locations/global/workloadIdentityPools/github/providers/github",
  serviceAccount: "github-deploy@acme-agent-demo.iam.gserviceaccount.com",
};
assert.equal(missingGoogleSetup(defaultGoogleCloudConfig).length, 4);
assert.deepEqual(missingGoogleSetup(complete), []);
assert(googleCloudSchema.safeParse(complete).success);
for (const key of Object.keys(complete)) {
  for (const payload of ["'; touch /tmp/injected; #", "${{ secrets.TOKEN }}", "ok\nrun: evil", "../../escape", "<script>alert(1)</script>", "abc\u0000def", "x".repeat(300)]) {
    assert.throws(() => buildGoogleCloudKit({ ...complete, [key]: payload }), `${key} accepted ${JSON.stringify(payload)}`);
  }
}
for (const agentName of ["class", "import", "def", "async", "1agent", "agent-name"]) {
  assert.throws(() => buildGoogleCloudKit({ ...complete, agentName }));
}
assert.throws(() => buildGoogleCloudKit({ ...complete, secret: "not-allowed" }));
assert.throws(() => buildGoogleCloudKit(null));
assert.throws(() => buildGoogleCloudKit({ ...complete, projectId: 123 }));

for (const config of [defaultGoogleCloudConfig, complete]) {
  const files = buildGoogleCloudKit(config);
  assert.equal(new Set(files.map((file) => file.path)).size, files.length);
  assert(files.every((file) => !file.path.includes("..") && !file.path.startsWith("/")));
  const get = (path: string) => {
    const file = files.find((candidate) => candidate.path === path);
    assert(file, `Missing ${path}`);
    assert(!/[\u0000-\u0008]/.test(file.contents));
    return file.contents;
  };
  assert.equal(JSON.parse(get("google-cloud.config.json")).cloudStatus, "unverified");
  assert(get("README.md").includes("adk deploy cloud_run"));
  assert(get("README.md").includes("Gemini Enterprise registration"));
  assert(get("GEMINI.md").includes("advisory"));
  assert(get(`${config.agentName}/requirements.txt`).includes("google-adk=="));
  const workflow = get(".github/workflows/google-agent.yml");
  assert(workflow.includes("environment: google-cloud-deploy"));
  assert(workflow.includes("${{ github.event_name == 'workflow_dispatch'"));
  assert(workflow.includes("github.ref == 'refs/heads/main'"));
  assert(!workflow.includes("adk deploy"));
  assert(!workflow.includes("secrets."));
  assert(workflow.includes("id-token: write"));
  const archive = createZip(files);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  const directory = await mkdtemp(join(tmpdir(), "google-config-"));
  try {
    for (const file of files) {
      const target = join(directory, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.contents);
    }
    await writeFile(join(directory, "kit.zip"), bytes);
    execFileSync("python3", ["-c", "import ast,pathlib,zipfile; root=pathlib.Path('.'); [ast.parse(p.read_text()) for p in root.rglob('*.py')]; z=zipfile.ZipFile('kit.zip'); assert z.testzip() is None; assert all(z.read(n)==pathlib.Path(n).read_bytes() for n in z.namelist())"], { cwd: directory });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
console.log("PASS: draft and complete kits, input/injection rejection, Python syntax, workflow boundaries and ZIP integrity.");
