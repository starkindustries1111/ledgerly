import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { isLeakedPassword, parsePwnedResponse, normalizeAdminEmails } from '../src/security.js'

const leakedPassword = 'Password123!'
const leakedHash = crypto.createHash('sha1').update(leakedPassword).digest('hex').toUpperCase()
const leakedSuffix = leakedHash.slice(5)

test('parsePwnedResponse matches a hash suffix from the HIBP response', () => {
  const response = `${leakedSuffix}:1\n21BD1:2\n`
  assert.equal(parsePwnedResponse(response, leakedSuffix), true)
  assert.equal(parsePwnedResponse(response, '000000000000000000000000000000000000'), false)
})

test('normalizeAdminEmails trims and lowercases configured admin addresses', () => {
  assert.deepEqual(normalizeAdminEmails('Admin@Example.com, user@example.com,  admin@example.com '), ['admin@example.com', 'user@example.com'])
})

test('isLeakedPassword checks against the pwned list without exposing the real password', async () => {
  const stub = async () => ({ text: async () => `${leakedSuffix}:1\n` })
  assert.equal(await isLeakedPassword(leakedPassword, stub), true)
  assert.equal(await isLeakedPassword('VeryUniqueNeverUsedPassword!42', stub), false)
})

test('isLeakedPassword rejects an unavailable breach service', async () => {
  const stub = async () => ({ ok: false, text: async () => '' })
  await assert.rejects(() => isLeakedPassword('AnyPassword!42', stub), /Breach check unavailable/)
})
