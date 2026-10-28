import { describe, it, expect } from 'vitest'
import { audioKey, speakTextFor } from '../../src/lib/audioKey'

describe('VOICEVOX 音檔對應', () => {
  it('唸的假名與練習題一致：取第一個讀音、去括號、片假名轉平假名', () => {
    expect(speakTextFor({ reading: 'いい/よい' })).toBe('いい')
    expect(speakTextFor({ reading: 'あける（自V）' })).toBe('あける')
    expect(speakTextFor({ reading: 'テレビ' })).toBe('てれび')
  })
  it('檔名固定（已產生的音檔不會因為改版而失效）', () => {
    expect(audioKey({ kanji: '学校', reading: 'がっこう' })).toBe(audioKey({ kanji: '学校', reading: 'がっこう' }))
    expect(audioKey({ kanji: '学校', reading: 'がっこう' })).toMatch(/^[0-9a-f]{14}$/)
  })
  it('同音不同字（橋／箸）是不同的檔案，重音可以不同', () => {
    expect(audioKey({ kanji: '橋', reading: 'はし' })).not.toBe(audioKey({ kanji: '箸', reading: 'はし' }))
  })
  it('詞性附註不影響檔名', () => {
    expect(audioKey({ kanji: '開く(自V)', reading: 'あく' })).toBe(audioKey({ kanji: '開く', reading: 'あく' }))
  })
})
