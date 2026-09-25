import 'dotenv/config'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db/database.js'
import { createTag, createProfile, cleanupFixtures, fixtureName } from '../test/fixtures.js'
import { profilesService } from './profilesService.js'

after(cleanupFixtures)

test('list() returns profiles with their tags, alphabetized by profile name', async () => {
  const tagA = await createTag('list-tag-a')
  const tagB = await createTag('list-tag-b')
  await createProfile('list-profile-z', [tagA.id, tagB.id])
  await createProfile('list-profile-a', [tagA.id])

  const all = await profilesService.list()
  const relevant = all.filter((p) => p.name.includes('list-profile'))

  assert.equal(relevant.length, 2)
  assert.ok(relevant[0].name.endsWith('list-profile-a'))
  assert.ok(relevant[1].name.endsWith('list-profile-z'))
  assert.deepEqual(relevant[0].tags.map((t) => t.id).sort(), [tagA.id])
  assert.deepEqual(relevant[1].tags.map((t) => t.id).sort(), [tagA.id, tagB.id].sort())
})

test('list() returns an empty tags array for a profile with none', async () => {
  const profile = await createProfile('list-empty-profile', [])
  const all = await profilesService.list()
  const found = all.find((p) => p.id === profile.id)
  assert.deepEqual(found?.tags, [])
})

test('getTagIds() returns the tag ids for an existing profile', async () => {
  const tag = await createTag('gettagids-tag')
  const profile = await createProfile('gettagids-profile', [tag.id])
  assert.deepEqual(await profilesService.getTagIds(profile.id), [tag.id])
})

test('getTagIds() returns an empty array for a profile that does not exist', async () => {
  assert.deepEqual(await profilesService.getTagIds(999999999), [])
})

test('create() inserts a profile with its tags', async () => {
  const tag = await createTag('create-tag')
  const created = await profilesService.create(fixtureName('profilesvc-create'), [tag.id])
  assert.equal(created.name, fixtureName('profilesvc-create'))
  assert.deepEqual(await profilesService.getTagIds(created.id), [tag.id])
})

test('update() replaces the profile\'s tag set entirely and renames it', async () => {
  const tagA = await createTag('update-tag-a')
  const tagB = await createTag('update-tag-b')
  const profile = await createProfile('update-profile', [tagA.id])

  const updated = await profilesService.update(profile.id, fixtureName('profilesvc-renamed'), [tagB.id])

  assert.equal(updated?.name, fixtureName('profilesvc-renamed'))
  assert.deepEqual(await profilesService.getTagIds(profile.id), [tagB.id])
})

test('update() returns undefined for a profile that does not exist', async () => {
  const result = await profilesService.update(999999999, 'nope', [])
  assert.equal(result, undefined)
})

test('remove() deletes the profile and its tag links', async () => {
  const tag = await createTag('remove-tag')
  const profile = await createProfile('remove-profile', [tag.id])

  const removed = await profilesService.remove(profile.id)

  assert.equal(removed, true)
  const links = await db.selectFrom('profile_tags').selectAll().where('profile_id', '=', profile.id).execute()
  assert.equal(links.length, 0)
})

test('remove() returns false for a profile that does not exist', async () => {
  assert.equal(await profilesService.remove(999999999), false)
})

test('findByName() finds a profile case-sensitively by exact name', async () => {
  const profile = await createProfile('findbyname-profile', [])
  const found = await profilesService.findByName(profile.name)
  assert.equal(found?.id, profile.id)
  assert.equal(await profilesService.findByName('__dry_test_no_such_profile_xyz'), undefined)
})

test('findById() finds a profile by id, undefined if not found', async () => {
  const profile = await createProfile('findbyid-profile', [])
  const found = await profilesService.findById(profile.id)
  assert.equal(found?.name, profile.name)
  assert.equal(await profilesService.findById(999999999), undefined)
})
