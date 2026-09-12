import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

type Manifest = {
  formatVersion: number; id: string; name: string; version: string; hostApiVersion: string;
  entry: string; description?: string; author?: string; icon?: string; language: string; languages?: { code: string; label: string }[];
  contentRating: "safe" | "teen" | "mature" | "unknown"; requestedHosts: string[];
};

const input = process.argv[2];
if (!input) throw new Error("Usage: bun run tools/package-extension.ts extensions/demo");
const project = resolve(input);
const manifestPath = join(project, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest & { entry: string };
if (manifest.formatVersion !== 1 || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.hostApiVersion !== "1.0") throw new Error("Manifest format, ID, version, or host API version is invalid.");
if (!manifest.name || !manifest.language || !manifest.contentRating || !Array.isArray(manifest.requestedHosts)) throw new Error("Manifest is missing required fields.");

const temp = join(project, ".package-temp");
await rm(temp, { recursive: true, force: true });
await mkdir(temp, { recursive: true });
const entry = resolve(project, manifest.entry);
if (!entry.startsWith(`${project}\\`) || !entry.endsWith(".ts") && !entry.endsWith(".js")) throw new Error("The entry must be a local .ts or .js file.");
const build = await Bun.build({ entrypoints: [entry], outdir: temp, target: "browser", format: "iife", minify: false, naming: "source.js" });
if (!build.success) throw new Error(build.logs.map((log) => log.message).join("\n"));
const outputManifest = { ...manifest, entry: "source.js" };
await writeFile(join(temp, "manifest.json"), `${JSON.stringify(outputManifest, null, 2)}\n`);

for (const name of ["icon.png", "icon.jpg", "icon.jpeg", "icon.webp", "icon.svg", "assets"]) {
  const source = join(project, name);
  try {
    const info = await stat(source);
    if (info.isDirectory()) await copyTree(source, join(temp, name));
    else await writeFile(join(temp, name), await readFile(source));
  } catch { /* optional */ }
}

const files: { name: string; data: Uint8Array }[] = [];
await collectFiles(temp, files);
files.sort((left, right) => left.name.localeCompare(right.name));
const archive = createZip(files);
const output = join(dirname(project), `${manifest.id}-${manifest.version}.mekuri-ext`);
await writeFile(output, archive);
await rm(temp, { recursive: true, force: true });
console.log(`Wrote ${output}`);

async function copyTree(source: string, destination: string) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name); const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to); else await writeFile(to, await readFile(from));
  }
}
async function collectFiles(directory: string, result: { name: string; data: Uint8Array }[]) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(path, result);
    else result.push({ name: relative(temp, path).replaceAll("\\", "/"), data: new Uint8Array(await readFile(path)) });
  }
}
function u16(value: number) { return [value & 255, (value >>> 8) & 255]; }
function u32(value: number) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function createZip(files: { name: string; data: Uint8Array }[]) {
  const local: number[] = []; const central: number[] = []; let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name); const crc = crc32(file.data);
    local.push(...[0x50, 0x4b, 0x03, 0x04], ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(file.data.length), ...u32(file.data.length), ...u16(name.length), ...u16(0), ...name, ...file.data);
    central.push(...[0x50, 0x4b, 0x01, 0x02], ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(file.data.length), ...u32(file.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
    offset = local.length;
  }
  const end = [...[0x50, 0x4b, 0x05, 0x06], ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(central.length), ...u32(local.length), ...u16(0)];
  return new Uint8Array([...local, ...central, ...end]);
}
