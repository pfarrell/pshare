import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { projectRoot, imagesDir, uploadTmpDir } from './paths.js'

test('projectRoot (non-production) is the monorepo root that contains server/', () => {
  assert.ok(fs.existsSync(path.join(projectRoot, 'server', 'package.json')), `unexpected projectRoot: ${projectRoot}`)
})

test('imagesDir resolves under public/images', () => {
  assert.equal(imagesDir(), path.join(projectRoot, 'public', 'images'))
  assert.equal(imagesDir('albums'), path.join(projectRoot, 'public', 'images', 'albums'))
  assert.equal(imagesDir('artists'), path.join(projectRoot, 'public', 'images', 'artists'))
})

test('uploadTmpDir resolves under public/tmp/uploads', () => {
  assert.equal(uploadTmpDir(), path.join(projectRoot, 'public', 'tmp', 'uploads'))
})
