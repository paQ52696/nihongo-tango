// 內建「數字・時間・日期・量詞」題庫：每個量詞一張卡，出題時隨機挑一個數字問讀音。
// 讀音全部逐一列出（不靠規則組合），「/」後面是也算對的說法（不會拿來當錯誤選項）。

export interface CounterEntry {
  label: string // 題目顯示：6本、4日、月曜日
  n: number | '何' | null // 用來產生「數字讀法 × 量詞讀法」的錯誤選項；null＝不產生
  reading: string
  alts: string[]
  traps: string[] // 特別容易選錯的答案（優先當錯誤選項）
}

export interface CounterItem {
  id: string
  counter: string // 卡片名稱：〜本
  reading: string
  category: '量詞' | '時間' | '日期' | '數字'
  meaning: string
  hint: string // 題目下方的提示
  note?: string // 講解頁、作答後的補充
  bases: string[] // 量詞本身可能的讀法（產生錯誤選項用，第一個是基本讀法）
  entries: CounterEntry[]
}

/** 各數字可能的念法（第一個是基本念法） */
export const NUM_VARIANTS: Record<string, string[]> = {
  1: ['いち', 'いっ'],
  2: ['に'],
  3: ['さん'],
  4: ['よん', 'よ', 'し'],
  5: ['ご'],
  6: ['ろく', 'ろっ'],
  7: ['なな', 'しち'],
  8: ['はち', 'はっ'],
  9: ['きゅう', 'く'],
  10: ['じゅう', 'じゅっ'],
  何: ['なん'],
}

type Extra = [label: string, n: number | '何' | null, reading: string, traps?: string[]]

/** 1〜10 與「何」：readings 用空白分隔 11 個（最後一個是「何」，寫 - 表示沒有），「/」後面是也算對的說法 */
function seq(label: (n: number | '何') => string, readings: string, extras: Extra[] = [], traps: Record<string, string[]> = {}): CounterEntry[] {
  const parts = readings.trim().split(/\s+/)
  const ns: (number | '何')[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, '何']
  const out: CounterEntry[] = []
  parts.forEach((p, i) => {
    if (!p || p === '-') return
    const [reading, ...alts] = p.split('/')
    const l = label(ns[i])
    out.push({ label: l, n: ns[i], reading, alts, traps: traps[l] ?? [] })
  })
  for (const [l, n, r, t] of extras) {
    const [reading, ...alts] = r.split('/')
    out.push({ label: l, n, reading, alts, traps: t ?? traps[l] ?? [] })
  }
  return out
}

/** 逐列寫出：[題目, 數字, 讀音（/ 後是也算對的說法）, 易錯答案] */
function rows(list: Extra[]): CounterEntry[] {
  return seq(() => '', '', list)
}

const suffix = (s: string) => (n: number | '何') => `${n}${s}`

export const COUNTERS: CounterItem[] = [
  {
    id: 'nin',
    counter: '〜人',
    reading: 'にん',
    category: '量詞',
    meaning: '～個人',
    hint: '人數',
    note: '1、2 人是 ひとり、ふたり；4 人是 よにん（不是 よんにん）。',
    bases: ['にん'],
    entries: seq(suffix('人'), 'ひとり ふたり さんにん よにん ごにん ろくにん ななにん/しちにん はちにん きゅうにん/くにん じゅうにん なんにん', [], { '1人': ['いちにん', 'ひとにん'], '2人': ['ににん', 'ふたにん'], '4人': ['よんにん'] }),
  },
  {
    id: 'tsu',
    counter: '〜つ',
    reading: 'つ',
    category: '量詞',
    meaning: '～個（一般東西）',
    hint: '一般東西的個數（和語數法）',
    note: '只數到 10（とお）。10 個以上改用「〜個」或直接說數字。問幾個用「いくつ」。',
    bases: ['つ'],
    entries: seq((n) => (n === '何' ? 'いくつ' : `${n}つ`), 'ひとつ ふたつ みっつ よっつ いつつ むっつ ななつ やっつ ここのつ とお いくつ', [], { '10つ': ['じゅっつ', 'とおつ'], 'いくつ': ['なんつ', 'なんこ'] }).map((e) => (e.label === '10つ' ? { ...e, label: '10（個）' } : e)),
  },
  {
    id: 'hon',
    counter: '〜本',
    reading: 'ほん',
    category: '量詞',
    meaning: '～支、～瓶、～條',
    hint: '細長的東西：筆、瓶子、雨傘、香蕉',
    note: '1・6・8・10 → っぽん，3・何 → ぼん，其他 → ほん。',
    bases: ['ほん', 'ぼん', 'ぽん'],
    entries: seq(suffix('本'), 'いっぽん にほん さんぼん よんほん ごほん ろっぽん ななほん はっぽん/はちほん きゅうほん じゅっぽん/じっぽん なんぼん'),
  },
  {
    id: 'hai',
    counter: '〜杯',
    reading: 'はい',
    category: '量詞',
    meaning: '～杯、～碗',
    hint: '杯子、碗裝的飲料或食物',
    note: '變化和「本」一樣：1・6・8・10 → っぱい，3・何 → ばい。',
    bases: ['はい', 'ばい', 'ぱい'],
    entries: seq(suffix('杯'), 'いっぱい にはい さんばい よんはい ごはい ろっぱい ななはい はっぱい/はちはい きゅうはい じゅっぱい/じっぱい なんばい'),
  },
  {
    id: 'hiki',
    counter: '〜匹',
    reading: 'ひき',
    category: '量詞',
    meaning: '～隻（小動物）',
    hint: '貓、狗、魚、蟲等小動物',
    note: '變化和「本」一樣：1・6・8・10 → っぴき，3・何 → びき。',
    bases: ['ひき', 'びき', 'ぴき'],
    entries: seq(suffix('匹'), 'いっぴき にひき さんびき よんひき ごひき ろっぴき ななひき はっぴき/はちひき きゅうひき じゅっぴき/じっぴき なんびき'),
  },
  {
    id: 'mai',
    counter: '〜枚',
    reading: 'まい',
    category: '量詞',
    meaning: '～張、～件',
    hint: '薄平的東西：紙、郵票、襯衫、盤子',
    note: '沒有音便，照數字唸就好（4 是 よん、7 是 なな、9 是 きゅう）。',
    bases: ['まい'],
    entries: seq(suffix('枚'), 'いちまい にまい さんまい よんまい ごまい ろくまい ななまい はちまい きゅうまい じゅうまい なんまい'),
  },
  {
    id: 'dai',
    counter: '〜台',
    reading: 'だい',
    category: '量詞',
    meaning: '～台、～輛',
    hint: '機器、車子：電腦、汽車、腳踏車',
    note: '沒有音便，照數字唸就好。',
    bases: ['だい'],
    entries: seq(suffix('台'), 'いちだい にだい さんだい よんだい ごだい ろくだい ななだい はちだい きゅうだい じゅうだい なんだい'),
  },
  {
    id: 'ko',
    counter: '〜個',
    reading: 'こ',
    category: '量詞',
    meaning: '～個',
    hint: '小而立體的東西：蘋果、蛋、橡皮擦',
    note: '1・6・8・10 → っこ。',
    bases: ['こ'],
    entries: seq(suffix('個'), 'いっこ にこ さんこ よんこ ごこ ろっこ ななこ はっこ/はちこ きゅうこ じゅっこ/じっこ なんこ'),
  },
  {
    id: 'satsu',
    counter: '〜冊',
    reading: 'さつ',
    category: '量詞',
    meaning: '～本（書）',
    hint: '書、筆記本、雜誌',
    note: '1・8・10 → っさつ（6 是 ろくさつ）。',
    bases: ['さつ'],
    entries: seq(suffix('冊'), 'いっさつ にさつ さんさつ よんさつ ごさつ ろくさつ ななさつ はっさつ/はちさつ きゅうさつ じゅっさつ/じっさつ なんさつ'),
  },
  {
    id: 'kai',
    counter: '〜回',
    reading: 'かい',
    category: '量詞',
    meaning: '～次',
    hint: '次數',
    note: '1・6・8・10 → っかい。',
    bases: ['かい'],
    entries: seq(suffix('回'), 'いっかい にかい さんかい よんかい ごかい ろっかい ななかい はっかい/はちかい きゅうかい じゅっかい/じっかい なんかい'),
  },
  {
    id: 'kai-floor',
    counter: '〜階',
    reading: 'かい',
    category: '量詞',
    meaning: '～樓',
    hint: '樓層',
    note: '和「回」幾乎一樣，但 3 樓是 さんがい、幾樓是 なんがい。',
    bases: ['かい', 'がい'],
    entries: seq(suffix('階'), 'いっかい にかい さんがい/さんかい よんかい ごかい ろっかい ななかい はっかい/はちかい きゅうかい じゅっかい/じっかい なんがい/なんかい'),
  },
  {
    id: 'sai',
    counter: '〜歳',
    reading: 'さい',
    category: '量詞',
    meaning: '～歲',
    hint: '年齡',
    note: '1・8・10 → っさい；20 歲是 はたち。問年齡也可以說「おいくつ」。',
    bases: ['さい'],
    entries: seq(suffix('歳'), 'いっさい にさい さんさい よんさい ごさい ろくさい ななさい はっさい きゅうさい じゅっさい/じっさい なんさい', [['20歳', null, 'はたち/にじゅっさい', ['にじゅうさい', 'はつか', 'はたさい']]]),
  },
  {
    id: 'en',
    counter: '〜円',
    reading: 'えん',
    category: '數字',
    meaning: '～日圓',
    hint: '價錢',
    note: '4 円是 よえん（不是 よんえん）。',
    bases: ['えん'],
    entries: seq(suffix('円'), 'いちえん にえん さんえん よえん ごえん ろくえん ななえん はちえん きゅうえん じゅうえん なんえん', [], { '4円': ['よんえん'] }),
  },
  {
    id: 'hyaku',
    counter: '百',
    reading: 'ひゃく',
    category: '數字',
    meaning: '一百～九百',
    hint: '數字',
    note: '300 さんびゃく、600 ろっぴゃく、800 はっぴゃく；其他照唸。',
    bases: ['ひゃく', 'びゃく', 'ぴゃく'],
    entries: rows([
      ['100', 1, 'ひゃく', ['いちひゃく', 'いっぴゃく']],
      ['200', 2, 'にひゃく'],
      ['300', 3, 'さんびゃく'],
      ['400', 4, 'よんひゃく'],
      ['500', 5, 'ごひゃく'],
      ['600', 6, 'ろっぴゃく'],
      ['700', 7, 'ななひゃく'],
      ['800', 8, 'はっぴゃく'],
      ['900', 9, 'きゅうひゃく'],
      ['何百', '何', 'なんびゃく'],
    ]),
  },
  {
    id: 'sen',
    counter: '千・万',
    reading: 'せん',
    category: '數字',
    meaning: '一千～九千、一萬',
    hint: '數字',
    note: '3000 さんぜん、8000 はっせん；1000 是 せん，但 10000 要說 いちまん。',
    bases: ['せん', 'ぜん'],
    entries: rows([
      ['1000', 1, 'せん/いっせん', ['いちせん']],
      ['2000', 2, 'にせん'],
      ['3000', 3, 'さんぜん'],
      ['4000', 4, 'よんせん'],
      ['5000', 5, 'ごせん'],
      ['6000', 6, 'ろくせん'],
      ['7000', 7, 'ななせん'],
      ['8000', 8, 'はっせん'],
      ['9000', 9, 'きゅうせん'],
      ['何千', '何', 'なんぜん'],
      ['10000', null, 'いちまん', ['まん', 'じゅうせん', 'いっまん']],
    ]),
  },
  {
    id: 'ji',
    counter: '〜時',
    reading: 'じ',
    category: '時間',
    meaning: '～點（鐘）',
    hint: '時刻：幾點',
    note: '4 點 よじ、7 點 しちじ、9 點 くじ，這三個最常考。',
    bases: ['じ'],
    entries: seq(suffix('時'), 'いちじ にじ さんじ よじ ごじ ろくじ しちじ/ななじ はちじ くじ じゅうじ なんじ', [
      ['11時', null, 'じゅういちじ', ['じゅういっじ']],
      ['12時', null, 'じゅうにじ'],
    ], { '4時': ['よんじ', 'しじ'], '9時': ['きゅうじ'] }),
  },
  {
    id: 'fun',
    counter: '〜分',
    reading: 'ふん',
    category: '時間',
    meaning: '～分（鐘）',
    hint: '時刻：幾分',
    note: '1・3・4・6・8・10 → ぷん（いっぷん、さんぷん、よんぷん、ろっぷん、はっぷん、じゅっぷん），其他 → ふん。',
    bases: ['ふん', 'ぷん'],
    entries: seq(suffix('分'), 'いっぷん にふん さんぷん よんぷん/よんふん ごふん ろっぷん ななふん/しちふん はっぷん/はちふん きゅうふん じゅっぷん/じっぷん なんぷん', [
      ['15分', null, 'じゅうごふん', ['じゅうごぷん', 'じゅうごっぷん']],
      ['30分', null, 'さんじゅっぷん/さんじっぷん', ['さんじゅうふん', 'さんじゅっふん']],
      ['45分', null, 'よんじゅうごふん', ['よんじゅうごぷん', 'しじゅうごふん']],
    ]),
  },
  {
    id: 'jikan',
    counter: '〜時間',
    reading: 'じかん',
    category: '時間',
    meaning: '～小時',
    hint: '經過的時間：幾個小時',
    note: '和「〜時」一樣：4 よじかん、9 くじかん；7 小時說 ななじかん 或 しちじかん 都可以。',
    bases: ['じかん'],
    entries: seq(suffix('時間'), 'いちじかん にじかん さんじかん よじかん ごじかん ろくじかん ななじかん/しちじかん はちじかん くじかん じゅうじかん なんじかん', [], { '4時間': ['よんじかん'], '9時間': ['きゅうじかん'] }),
  },
  {
    id: 'nichi',
    counter: '〜日（日期）',
    reading: 'にち',
    category: '日期',
    meaning: '～號（日期）',
    hint: '日期：幾號',
    note: '1〜10 號、14、20、24 號是特別唸法，其他是「數字＋にち」。1 號是 ついたち（不是 いちにち）。',
    bases: ['にち', 'か'],
    entries: seq(
      suffix('日'),
      'ついたち ふつか みっか よっか いつか むいか なのか ようか ここのか とおか なんにち',
      [
        ['14日', null, 'じゅうよっか', ['じゅうよんにち', 'じゅうようか']],
        ['20日', null, 'はつか', ['にじゅうにち', 'はたち', 'にじゅっか']],
        ['24日', null, 'にじゅうよっか', ['にじゅうよんにち', 'にじゅうようか']],
        ['11日', null, 'じゅういちにち', ['じゅういっか', 'じゅうついたち']],
      ],
      { '1日': ['いちにち', 'いっか'], '4日': ['ようか', 'よんにち'], '8日': ['よっか', 'はちにち'], '9日': ['ここのつ', 'きゅうにち'], '10日': ['じゅうにち', 'とおにち'], '6日': ['むっか', 'ろくにち'], '7日': ['なのにち', 'しちにち'] },
    ),
  },
  {
    id: 'youbi',
    counter: '〜曜日',
    reading: 'ようび',
    category: '日期',
    meaning: '星期～',
    hint: '星期幾',
    bases: ['ようび'],
    entries: rows([
      ['月曜日', null, 'げつようび', ['がつようび', 'つきようび']],
      ['火曜日', null, 'かようび', ['ひようび', 'かいようび']],
      ['水曜日', null, 'すいようび', ['みずようび', 'すようび']],
      ['木曜日', null, 'もくようび', ['きようび', 'ぼくようび']],
      ['金曜日', null, 'きんようび', ['かねようび', 'こんようび']],
      ['土曜日', null, 'どようび', ['つちようび', 'とようび']],
      ['日曜日', null, 'にちようび', ['ひようび', 'にっようび']],
      ['何曜日', '何', 'なんようび', ['なにようび']],
    ]),
  },
  {
    id: 'gatsu',
    counter: '〜月',
    reading: 'がつ',
    category: '日期',
    meaning: '～月',
    hint: '月份',
    note: '4 月 しがつ、7 月 しちがつ、9 月 くがつ（不能用 よん、なな、きゅう）。',
    bases: ['がつ'],
    entries: seq(suffix('月'), 'いちがつ にがつ さんがつ しがつ ごがつ ろくがつ しちがつ はちがつ くがつ じゅうがつ なんがつ', [
      ['11月', null, 'じゅういちがつ', ['じゅういっがつ']],
      ['12月', null, 'じゅうにがつ'],
    ], { '4月': ['よんがつ', 'よがつ'], '7月': ['ななつき', 'ななげつ'], '9月': ['きゅうがつ'] }),
  },
  {
    id: 'kagetsu',
    counter: '〜か月',
    reading: 'かげつ',
    category: '時間',
    meaning: '～個月（期間）',
    hint: '經過的時間：幾個月',
    note: '和「〜月（幾月）」不同：3 か月＝三個月。1・6・8・10 → っかげつ。',
    bases: ['かげつ'],
    entries: seq(suffix('か月'), 'いっかげつ にかげつ さんかげつ よんかげつ ごかげつ ろっかげつ/ろくかげつ ななかげつ はっかげつ/はちかげつ きゅうかげつ じゅっかげつ/じっかげつ なんかげつ', [], {
      '3か月': ['さんがつ'],
      '4か月': ['しかげつ', 'よかげつ'],
    }),
  },
  {
    id: 'shuukan',
    counter: '〜週間',
    reading: 'しゅうかん',
    category: '時間',
    meaning: '～個星期',
    hint: '經過的時間：幾個星期',
    note: '1・8・10 → っしゅうかん。',
    bases: ['しゅうかん'],
    entries: seq(suffix('週間'), 'いっしゅうかん にしゅうかん さんしゅうかん よんしゅうかん ごしゅうかん ろくしゅうかん ななしゅうかん はっしゅうかん/はちしゅうかん きゅうしゅうかん じゅっしゅうかん/じっしゅうかん なんしゅうかん'),
  },
  {
    id: 'nen',
    counter: '〜年',
    reading: 'ねん',
    category: '時間',
    meaning: '～年',
    hint: '年份、幾年',
    note: '4 年是 よねん；7 年 しちねん／ななねん、9 年 きゅうねん／くねん 都可以。',
    bases: ['ねん'],
    entries: seq(suffix('年'), 'いちねん にねん さんねん よねん ごねん ろくねん しちねん/ななねん はちねん きゅうねん/くねん じゅうねん なんねん', [], { '4年': ['よんねん', 'しねん'] }),
  },
  {
    id: 'ban',
    counter: '〜番',
    reading: 'ばん',
    category: '量詞',
    meaning: '第～號、第～名',
    hint: '號碼、順序',
    note: '沒有音便，照數字唸就好。「一番」也有「最～」的意思。',
    bases: ['ばん'],
    entries: seq(suffix('番'), 'いちばん にばん さんばん よんばん ごばん ろくばん ななばん はちばん きゅうばん じゅうばん なんばん'),
  },
]

const BY_ID = new Map(COUNTERS.map((c) => [c.id, c]))

export function counterItem(id: string | undefined): CounterItem | undefined {
  return id ? BY_ID.get(id) : undefined
}

/** 不規則的念法（不是「基本數字念法＋基本量詞念法」）多出幾次 */
export function entryWeight(item: CounterItem, e: CounterEntry): number {
  if (e.n === null) return 2
  const plain = (NUM_VARIANTS[e.n]?.[0] ?? '') + item.bases[0]
  return e.reading === plain ? 1 : 3
}
