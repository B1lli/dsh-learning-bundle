// Real official-CLI acceptance; run explicitly with npm run test:lifecycle.
// DSH_CLI_PATH must point to an already installed, exact official release.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = process.env.DSH_CLI_PATH && realpathSync(resolve(process.env.DSH_CLI_PATH))
const expected = process.env.DSH_EXPECTED_VERSION
assert.ok(cli && expected, 'Set DSH_CLI_PATH and DSH_EXPECTED_VERSION to an exact official release')
const home = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-learning-lifecycle-')))
const store = join(home, 'dsh-learning-store.json')
// Deliberately do not inherit provider keys or the operator's DSH configuration.
const env = { PATH: process.env.PATH, HOME: home, DSH_HOME: home, DSH_LEARNING_STORE: store }
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const report = {
  schemaVersion: 1, package: manifest.name, version: manifest.version,
  dshVersion: expected, node: process.version, platform: process.platform, arch: process.arch,
  profile: 'headless', evaluatedAt: new Date().toISOString(),
  model: 'offline deterministic adapter; no live model quality claim', steps: [],
}
function sanitized(text) {
  return String(text).replaceAll(home, '$DISPOSABLE_HOME').replaceAll(root, '$BUNDLE_ROOT')
    .replaceAll(resolve(dirname(cli), '../../..'), '$DSH_NODE_MODULES').replaceAll(process.execPath, '$NODE')
}
function run(label, executable, args, { success = true } = {}) {
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
  report.steps.push({ label, argv: [executable, ...args].map(sanitized), exitStatus: result.status,
    stdout: sanitized(result.stdout ?? ''), stderr: sanitized(result.stderr ?? '') })
  console.log(`${label}: exit ${result.status}`)
  if (success) assert.equal(result.status, 0, `${label}: ${result.error ?? result.stderr ?? result.stdout}`)
  else assert.ok(result.status !== null && result.status !== 0, `${label} must fail explicitly`)
  return result.stdout.trim()
}
const dsh = (label, args, options) => run(label, process.execPath, [cli, ...args], options)
const profileArgs = ['--profile', 'headless']
const prompt = 'Install the JavaScript dependencies for this workspace.'
const overlay = join(home, 'offline.patch.yml')
function hasEntry(config) { return /^- id: dsh-learning$/m.test(config) }
function start(label, answer) {
  const actual = dsh(label, [...profileArgs, '--patch', overlay, prompt])
  assert.equal(actual, answer, label)
}
try {
  assert.equal(dsh('version', ['--version']), expected)
  const packed = JSON.parse(run('pack', 'npm', ['pack', '--json', '--pack-destination', home]))[0]
  const tarball = join(home, packed.filename)
  report.packedFiles = packed.files.map(file => file.path)
  for (const required of ['lib/index.js', 'src/index.js', 'scripts/learning.mjs', 'cordis.patch.yml', 'LICENSE']) {
    assert.ok(report.packedFiles.includes(required), `missing packed ${required}`)
  }
  const baseline = dsh('baseline-config', [...profileArgs, '--dump-config'])
  assert.equal(hasEntry(baseline), false)
  const baselinePackage = readFileSync(join(home, 'profiles/headless/package.json'), 'utf8')
  dsh('install', ['plugin', ...profileArgs, 'add', '-w', tarball])
  assert.equal(hasEntry(dsh('installed-config', [...profileArgs, '--dump-config'])), true)
  const installedRoot = join(home, 'profiles/headless/node_modules/dsh-learning-bundle')
  assert.equal(JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8')).version, manifest.version)
  writeFileSync(overlay, `- id: agent-default-model\n  config:\n    provider: demo-deterministic\n    model: demo\n- insert:\n    - id: demo-deterministic-adapter\n      name: ${join(root, 'benchmark/demo/deterministic-adapter.js')}\n`)
  start('start-empty-store', 'npm install')
  const learningCli = join(installedRoot, 'scripts/learning.mjs')
  const item = JSON.parse(run('record-candidate', process.execPath, [learningCli, 'record',
    '--profile', 'headless', '--statement', 'For dependency installs, use pnpm instead of npm.',
    '--scope', 'workspace', '--workspace-id', root, '--keyword', 'install', '--keyword', 'dependencies']))
  start('start-candidate', 'npm install')
  run('adopt', process.execPath, [learningCli, 'adopt', item.id])
  start('start-adopted', 'pnpm install')
  const savedStore = readFileSync(store, 'utf8')
  writeFileSync(store, '{invalid JSON')
  dsh('corrupt-store-fails', [...profileArgs, '--patch', overlay, prompt], { success: false })
  writeFileSync(store, savedStore)
  start('restore-store', 'pnpm install')
  dsh('uninstall', ['plugin', ...profileArgs, 'remove', '-w', manifest.name])
  assert.equal(hasEntry(dsh('uninstalled-config', [...profileArgs, '--dump-config'])), false)
  assert.equal(existsSync(installedRoot), false)
  const restoredPackage = JSON.parse(readFileSync(join(home, 'profiles/headless/package.json'), 'utf8'))
  // pnpm removes an empty dependencies object; compare its semantic state.
  assert.deepEqual({ dependencies: {}, ...restoredPackage }, { dependencies: {}, ...JSON.parse(baselinePackage) })
  assert.equal(readFileSync(store, 'utf8'), savedStore, 'uninstall preserves user learning data')
  start('start-after-uninstall', 'npm install')
  // Recovery means reinstalling this same tarball with the retained store.
  dsh('rollback-reinstall', ['plugin', ...profileArgs, 'add', '-w', tarball])
  start('start-after-rollback', 'pnpm install')
  dsh('final-uninstall', ['plugin', ...profileArgs, 'remove', '-w', manifest.name])
  assert.equal(hasEntry(dsh('final-config', [...profileArgs, '--dump-config'])), false)
  report.operations = { install: 'passed', start: 'passed', uninstall: 'passed', rollback: 'passed' }
  report.status = 'PASS'
} catch (error) {
  report.status = 'FAIL'
  report.error = sanitized(error.message)
  process.exitCode = 1
} finally {
  rmSync(home, { recursive: true, force: true })
  report.disposableHomeRemoved = !existsSync(home)
  if (process.env.DSH_LIFECYCLE_OUTPUT) {
    const output = resolve(process.env.DSH_LIFECYCLE_OUTPUT)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  }
  console.log(JSON.stringify({ status: report.status, dshVersion: expected,
    steps: report.steps.map(({ label, exitStatus }) => ({ label, exitStatus })),
    disposableHomeRemoved: report.disposableHomeRemoved, error: report.error }, null, 2))
}
