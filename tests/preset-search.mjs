import assert from "node:assert/strict"

import { matchesPreset } from "../entrypoints/lib/preset-search.ts"

for (const query of ["하", "학", "학교", "ㅎ", "ㅎㄱ", "ㅎㅏ", "하", " 하 ", ""]) {
  assert.equal(matchesPreset("학교 아이콘", query), true, query)
}
assert.equal(matchesPreset("학교 아이콘", "학생"), false)
assert.equal(matchesPreset("학교 아이콘", "ㅎㄴ"), false)
assert.equal(matchesPreset("쌍둥이 아이콘", "ㅆㄷㅇ"), true)
assert.equal(matchesPreset("Native Pack 2", "native pack 2"), true)
assert.equal(matchesPreset("Native Pack 2", "pack 3"), false)
console.log("PASS: composing syllables, choseong, Unicode jamo, case-insensitive and empty queries")
