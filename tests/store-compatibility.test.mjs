import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('STORE compatibility claims have per-release disposable lifecycle evidence', () => {
  const compatibility = manifest.dsh.compatibility
  assert.ok(manifest.engines.node)
  assert.ok(compatibility.dsh)
  assert.deepEqual(compatibility.profiles, ['headless'])
  const claimed = Object.entries(compatibility.dshReleases)
    .filter(([, status]) => status === 'compatible').map(([version]) => version)
  assert.ok(claimed.length > 0)
  assert.deepEqual(compatibility.dsh.split(' || '), claimed)
  for (const version of claimed) {
    const evidence = JSON.parse(readFileSync(new URL(`../docs/evidence/lifecycle-${version}.json`, import.meta.url), 'utf8'))
    assert.equal(evidence.status, 'PASS')
    assert.equal(evidence.package, manifest.name)
    assert.equal(evidence.version, manifest.version)
    assert.equal(evidence.dshVersion, version)
    assert.equal(evidence.disposableHomeRemoved, true)
    assert.deepEqual(compatibility.dshOperations[version], evidence.operations)
    for (const label of ['start-native-empty', 'start-native-instructions', 'start-native-revised', 'start-native-revoked', 'start-native-after-rollback', 'install', 'start-candidate', 'start-adopted', 'uninstall', 'start-after-uninstall', 'rollback-reinstall', 'start-after-rollback', 'final-uninstall']) {
      assert.equal(evidence.steps.find(step => step.label === label)?.exitStatus, 0, `${version}: ${label}`)
    }
    assert.equal(evidence.steps.find(step => step.label === 'corrupt-store-fails')?.exitStatus, 1)
  }
})

test('bundle installation has no implicit lifecycle or runtime dependency additions', () => {
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(manifest.scripts[name], undefined)
  for (const name of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies']) {
    assert.equal(Object.keys(manifest[name] ?? {}).length, 0, name)
  }
})
