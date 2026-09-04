import { describe, expect, test } from 'bun:test'
import { dependencyPath, renderDependencyTree } from '../src/output/dependencyTree'

/** `app` depends on `a` and `b`; `a` depends on `deep`, `deep` on `deeper`. */
const PARENTS = new Map<string, string>([
  ['a@1', 'app@1'],
  ['b@1', 'app@1'],
  ['deep@1', 'a@1'],
  ['deeper@1', 'deep@1']
])

describe('dependencyPath', () => {
  test('walks up to the project', () => {
    expect(dependencyPath('deeper@1', PARENTS)).toEqual(['app@1', 'a@1', 'deep@1', 'deeper@1'])
  })

  test('a package nothing depends on is its own path', () => {
    expect(dependencyPath('orphan@1', PARENTS)).toEqual(['orphan@1'])
  })

  test('stops on a cycle instead of looping forever', () => {
    const cyclic = new Map([['a@1', 'b@1'], ['b@1', 'a@1']])
    expect(dependencyPath('a@1', cyclic)).toEqual(['b@1', 'a@1'])
  })

  test('stops on a package that is its own parent', () => {
    expect(dependencyPath('a@1', new Map([['a@1', 'a@1']]))).toEqual(['a@1'])
  })
})

describe('renderDependencyTree', () => {
  test('shows the chain that brought a single package in', () => {
    expect(renderDependencyTree(['deeper@1'], PARENTS)).toEqual([
      'app@1',
      '└─ a@1',
      '   └─ deep@1',
      '      └─ deeper@1 ❗'
    ])
  })

  test('merges the paths of several packages into one tree', () => {
    // The shared culprit, `a@1`, is written once.
    expect(renderDependencyTree(['deep@1', 'deeper@1', 'b@1'], PARENTS)).toEqual([
      'app@1',
      '├─ b@1 ❗',
      '└─ a@1',
      '   └─ deep@1 ❗',
      '      └─ deeper@1 ❗'
    ])
  })

  test('marks only the packages the tree is about', () => {
    // `a@1` is only on the way to `deep@1`: it does not carry the problem.
    const lines = renderDependencyTree(['deep@1'], PARENTS)
    expect(lines).toContain('└─ a@1')
    expect(lines).toContain('   └─ deep@1 ❗')
  })

  test('indents every line', () => {
    expect(renderDependencyTree(['b@1'], PARENTS, '   ')).toEqual([
      '   app@1',
      '   └─ b@1 ❗'
    ])
  })

  test('says when nothing requires the package', () => {
    expect(renderDependencyTree(['orphan@1'], PARENTS)).toEqual([
      'orphan@1 (not required by package.json)'
    ])
  })

  test('does not call the project itself an orphan', () => {
    expect(renderDependencyTree(['app@1'], PARENTS, '', 'app@1')).toEqual(['app@1 ❗'])
  })

  test('renders nothing for no packages', () => {
    expect(renderDependencyTree([], PARENTS)).toEqual([])
  })

  test('lists a duplicated package once', () => {
    expect(renderDependencyTree(['b@1', 'b@1'], PARENTS)).toEqual([
      'app@1',
      '└─ b@1 ❗'
    ])
  })

  test('renders several roots, one after the other', () => {
    const lines = renderDependencyTree(['b@1', 'orphan@1'], PARENTS)
    expect(lines).toEqual([
      'app@1',
      '└─ b@1 ❗',
      'orphan@1 (not required by package.json)'
    ])
  })
})
