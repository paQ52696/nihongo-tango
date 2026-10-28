// 發音按鈕：按下有壓下去的手感，唸的時候反轉成深色、喇叭會動，唸完恢復
import { useSyncExternalStore, type ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import { onPlayingChange, playingKey, playWord } from '../lib/browser'
import { audioKey } from '../lib/audioKey'
import type { Word } from '../types'

export function useIsPlaying(word: Pick<Word, 'kanji' | 'reading'>) {
  const key = audioKey(word)
  return useSyncExternalStore(onPlayingChange, () => playingKey() === key)
}

export function SpeakButton({
  word,
  rate,
  className = 'btn-ghost w-11 px-0',
  size = 18,
  label = '發音',
  children,
  testId,
}: {
  word: Pick<Word, 'kanji' | 'reading'>
  rate?: number
  className?: string
  size?: number
  label?: string
  children?: ReactNode
  testId?: string
}) {
  const playing = useIsPlaying(word)
  return (
    <button className={`${className} ${playing ? 'is-playing' : ''}`} onClick={() => playWord(word, rate)} aria-label={label} data-playing={playing || undefined} data-testid={testId}>
      <Volume2 size={size} className={playing ? 'speaker-wave' : ''} aria-hidden />
      {children}
    </button>
  )
}
