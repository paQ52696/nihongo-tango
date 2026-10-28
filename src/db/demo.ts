// 內建示範單字庫（約 30 筆）：刻意收錄長音、促音、濁音、拗音、同形異音等容易混淆的字
import { db, getMeta, setMeta } from './schema'
import { createDeck, deleteDeck, importDrafts, notifyChange, stamp } from './repo'
import type { Word } from '../types'
import { checkDuplicates, type WordDraft } from '../lib/importer'

export const DEMO_DECK_ID = '00000000-0000-4000-8000-00000000d3c0'

type Row = [kanji: string, reading: string, pos: string, meaning: string, example: string, translation: string, tags?: string]

const ROWS: Row[] = [
  ['学校', 'がっこう', '名詞', '學校', '毎日学校へ行きます。', '每天去學校。', '易錯'],
  ['先生', 'せんせい', '名詞', '老師', '田中先生はやさしいです。', '田中老師很溫柔。'],
  ['学生', 'がくせい', '名詞', '學生', '私は学生です。', '我是學生。'],
  ['病院', 'びょういん', '名詞', '醫院', '病院はどこですか。', '醫院在哪裡？', '易錯'],
  ['美容院', 'びよういん', '名詞', '美容院', '美容院で髪を切りました。', '在美容院剪了頭髮。', '易錯'],
  ['切手', 'きって', '名詞', '郵票', '切手を三枚ください。', '請給我三張郵票。', '易錯'],
  ['来る', 'くる', '動詞', '來', '友達が家に来ます。', '朋友要來家裡。'],
  ['叔母さん', 'おばさん', '名詞', '阿姨、伯母', '叔母さんは東京に住んでいます。', '阿姨住在東京。', '易錯'],
  ['お婆さん', 'おばあさん', '名詞', '祖母、老奶奶', 'お婆さんはお茶が好きです。', '奶奶喜歡喝茶。', '易錯'],
  ['高校', 'こうこう', '名詞', '高中', '兄は高校の先生です。', '哥哥是高中老師。', '易錯'],
  ['一日', 'ついたち', '名詞', '（每月）一號', '四月一日は休みです。', '四月一號放假。', '易錯'],
  ['一日', 'いちにち', '名詞', '一天', '一日に三回薬を飲みます。', '一天吃三次藥。', '易錯'],
  ['晩', 'ばん', '名詞', '晚上', '今晩、映画を見ます。', '今晚要看電影。'],
  ['半分', 'はんぶん', '名詞', '一半', 'ケーキを半分食べました。', '吃了一半的蛋糕。'],
  ['時計', 'とけい', '名詞', '時鐘、手錶', 'この時計は高いです。', '這支手錶很貴。'],
  ['時間', 'じかん', '名詞', '時間', '今日は時間がありません。', '今天沒有時間。'],
  ['映画', 'えいが', '名詞', '電影', '映画を見ませんか。', '要不要看電影？'],
  ['新しい', 'あたらしい', 'い形容詞', '新的', '新しい靴を買いました。', '買了新鞋子。'],
  ['大きい', 'おおきい', 'い形容詞', '大的', '大きい犬がいます。', '有一隻大狗。', '易錯'],
  ['静か', 'しずか（な）', 'な形容詞', '安靜', '図書館は静かです。', '圖書館很安靜。'],
  ['有名', 'ゆうめい（な）', 'な形容詞', '有名', 'ここは有名な店です。', '這裡是有名的店。'],
  ['飲む', 'のむ', '動詞', '喝', '毎朝コーヒーを飲みます。', '每天早上喝咖啡。'],
  ['書く', 'かく', '動詞', '寫', 'ここに名前を書いてください。', '請在這裡寫名字。'],
  ['待つ', 'まつ', '動詞', '等待', '駅で友達を待ちます。', '在車站等朋友。'],
  ['旅行', 'りょこう', '名詞', '旅行', '来月、旅行に行きます。', '下個月要去旅行。', '易錯'],
  ['料理', 'りょうり', '名詞', '料理、菜餚', '母の料理はおいしいです。', '媽媽做的菜很好吃。', '易錯'],
  ['電車', 'でんしゃ', '名詞', '電車', '電車で会社へ行きます。', '搭電車去公司。'],
  ['写真', 'しゃしん', '名詞', '照片', '写真を撮りましょう。', '來拍照吧。'],
  ['部屋', 'へや', '名詞', '房間', '部屋をきれいにします。', '把房間打掃乾淨。'],
  ['', 'コーヒー', '名詞', '咖啡', 'コーヒーを一杯ください。', '請給我一杯咖啡。'],
  ['雑誌', 'ざっし', '名詞', '雜誌', '電車の中で雑誌を読みます。', '在電車上看雜誌。', '易錯'],
]

export function demoDrafts(): WordDraft[] {
  return ROWS.map(([kanji, reading, pos, meaning, example, exampleTranslation, tags], i) => ({
    row: i + 1,
    kanji,
    reading,
    pos,
    meaning,
    example,
    exampleTranslation,
    page: Math.floor(i / 10) + 1,
    lesson: `第${Math.floor(i / 10) + 1}課`,
    tags: ['示範', ...(tags ? [tags] : [])],
    note: '',
    problems: [],
  }))
}

/**
 * 舊版每台裝置第一次開啟都會自動建立示範單字庫；現在不再建立，
 * 並在每台裝置第一次開新版時刪掉一次（軟刪除，會同步到其他裝置）。
 * 只屬於示範庫的單字一起刪；也在其他單字庫裡的（例如 N5 的「勉強」）保留。
 */
export async function removeLegacyDemoOnce(): Promise<boolean> {
  if (await getMeta('demoRemoved', false)) return false
  const deck = await db.decks.get(DEMO_DECK_ID)
  let removed = false
  if (deck && !deck.deleted) {
    const entries = await db.deckEntries.where('deckId').equals(DEMO_DECK_ID).toArray()
    await deleteDeck(DEMO_DECK_ID)
    await db.transaction('rw', db.words, db.deckEntries, async () => {
      for (const e of entries) {
        const elsewhere = await db.deckEntries.where('wordId').equals(e.wordId).filter((x) => x.deckId !== DEMO_DECK_ID && !x.deleted).count()
        const w = await db.words.get(e.wordId)
        if (!elsewhere && w && !w.deleted) await db.words.put(stamp<Word>({ ...w, deleted: true }))
      }
    })
    notifyChange()
    removed = true
  }
  await setMeta('demoRemoved', true)
  return removed
}

/** 建立示範單字庫（只建一次）。App 不再自動呼叫，只給測試用 */
export async function seedDemoIfEmpty(): Promise<boolean> {
  // 整個建立過程在同一個交易裡：中途關掉分頁也不會留下沒有單字的空庫
  return db.transaction('rw', [db.meta, db.decks, db.words, db.deckEntries, db.cards], async () => {
    if (await getMeta('demoSeeded', false)) return false
    await setMeta('demoSeeded', true)
    if ((await db.decks.count()) > 0) return false
    await createDeck({ id: DEMO_DECK_ID, name: '示範單字庫', color: '#f472b6', icon: '🌸', dailyNewLimit: 20 })
    const words = await db.words.toArray()
    await importDrafts(DEMO_DECK_ID, checkDuplicates(demoDrafts(), words, [], DEMO_DECK_ID))
    return true
  })
}
