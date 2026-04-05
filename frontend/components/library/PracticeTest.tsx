'use client'

import { useState } from 'react'
import { aiApi } from '@/lib/api'
import {
  ChevronRight, ChevronLeft, Loader2, CheckCircle2, XCircle,
  Lightbulb, TrendingUp, Award, RotateCcw, Send, BookOpen,
  Target, Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Question {
  question: string
  type: string
  hint?: string
  model_answer: string
}

interface GradeResult {
  score: number
  grade: string
  correct: boolean
  feedback: string
  strengths: string[]
  improvements: string[]
  tip: string
}

interface Props {
  questions: Question[]
  resourceId: number
  onSave?: () => void
  isSaved?: boolean
  saving?: boolean
  onFinish?: () => void
}

export default function PracticeTest({ questions, resourceId, onSave, isSaved, saving, onFinish }: Props) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [grades, setGrades] = useState<Record<number, GradeResult>>({})
  const [grading, setGrading] = useState(false)
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({})
  const [showHint, setShowHint] = useState(false)
  const [testDone, setTestDone] = useState(false)

  const q = questions[current]
  const totalAnswered = Object.keys(submitted).length
  const totalScore = Object.values(grades).reduce((sum, g) => sum + (g.score || 0), 0)
  const avgScore = totalAnswered > 0 ? Math.round(totalScore / totalAnswered) : 0

  const handleSubmit = async () => {
    const answer = answers[current]?.trim()
    if (!answer) return
    setGrading(true)
    try {
      const res = await aiApi.gradeAnswer(resourceId, q.question, answer, q.model_answer)
      setGrades(g => ({ ...g, [current]: res.data }))
      setSubmitted(s => ({ ...s, [current]: true }))
    } catch {
      setGrades(g => ({ ...g, [current]: { score: 0, grade: 'F', correct: false, feedback: 'Grading failed. Please try again.', strengths: [], improvements: [], tip: '' } }))
      setSubmitted(s => ({ ...s, [current]: true }))
    } finally {
      setGrading(false)
    }
  }

  const handleNext = () => {
    if (current < questions.length - 1) {
      setCurrent(c => c + 1)
      setShowHint(false)
    } else {
      setTestDone(true)
    }
  }

  const handleRestart = () => {
    setCurrent(0)
    setAnswers({})
    setGrades({})
    setSubmitted({})
    setShowHint(false)
    setTestDone(false)
  }

  const getGradeColor = (grade: string) => {
    if (['A', 'A+', 'A-'].includes(grade)) return 'text-emerald-500'
    if (['B', 'B+', 'B-'].includes(grade)) return 'text-sky-500'
    if (['C', 'C+', 'C-'].includes(grade)) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-sky-500'
    if (score >= 40) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  // Results screen
  if (testDone) {
    const passed = avgScore >= 60
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center h-full">
        <div className={cn('w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg', passed ? 'bg-emerald-500 shadow-emerald-200 dark:shadow-emerald-900' : 'bg-orange-400 shadow-orange-200 dark:shadow-orange-900')}>
          {passed ? <Award className="w-10 h-10 text-white" /> : <Target className="w-10 h-10 text-white" />}
        </div>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
          {passed ? 'Great work!' : 'Keep practicing!'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          You answered {totalAnswered} of {questions.length} questions
        </p>

        {/* Score ring */}
        <div className="relative w-28 h-28 mb-6">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-800" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - avgScore / 100)}`}
              className={passed ? 'text-emerald-500' : 'text-orange-400'}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{avgScore}</span>
            <span className="text-xs text-gray-400">/ 100</span>
          </div>
        </div>

        {/* Per-question breakdown */}
        <div className="w-full space-y-2 mb-6">
          {questions.map((q, i) => {
            const g = grades[i]
            return (
              <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                <span className="text-xs text-gray-400 w-4 flex-shrink-0">Q{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{q.question}</p>
                </div>
                {g ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', getScoreColor(g.score))} style={{ width: `${g.score}%` }} />
                    </div>
                    <span className={cn('text-xs font-bold w-6', getGradeColor(g.grade))}>{g.grade}</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-300 dark:text-gray-600 flex-shrink-0">Skipped</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 w-full">
          <button onClick={handleRestart} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm">
            <RotateCcw className="w-4 h-4" /> Try Again
          </button>
          {onFinish && (
            <button onClick={onFinish} className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm">
              Close
            </button>
          )}
          {onSave && !isSaved && (
            <button onClick={onSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              Save Questions
            </button>
          )}
        </div>
      </div>
    )
  }

  const grade = grades[current]
  const isSubmitted = submitted[current]

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress bar */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
          <span>Question {current + 1} of {questions.length}</span>
          <span>{totalAnswered} answered · avg {avgScore}/100</span>
        </div>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <div key={i} className={cn('flex-1 h-1.5 rounded-full transition-all', {
              'bg-emerald-400': submitted[i] && grades[i]?.correct,
              'bg-red-400': submitted[i] && !grades[i]?.correct,
              'bg-sky-500': i === current && !submitted[i],
              'bg-gray-200 dark:bg-gray-700': i !== current && !submitted[i],
            })} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Question */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
          <div className="flex items-start gap-2 mb-2">
            <span className="text-xs font-bold text-sky-500 uppercase flex-shrink-0 mt-0.5">
              {q.type?.replace('_', ' ') || 'Question'}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-relaxed">{q.question}</p>

          {/* Hint */}
          {q.hint && (
            <div className="mt-3">
              {!showHint ? (
                <button onClick={() => setShowHint(true)} className="flex items-center gap-1.5 text-xs text-amber-500 hover:text-amber-600 transition-colors">
                  <Lightbulb className="w-3.5 h-3.5" /> Show hint
                </button>
              ) : (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-3 py-2 mt-2">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">{q.hint}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Answer area */}
        {!isSubmitted ? (
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Your Answer</label>
            <textarea
              value={answers[current] || ''}
              onChange={e => setAnswers(a => ({ ...a, [current]: e.target.value }))}
              placeholder="Write your answer here... Be as detailed as you can."
              className="input resize-none w-full text-sm leading-relaxed"
              rows={5}
              disabled={grading}
            />
            <button
              onClick={handleSubmit}
              disabled={grading || !answers[current]?.trim()}
              className="btn-primary w-full mt-3 flex items-center justify-center gap-2 text-sm py-2.5"
            >
              {grading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> FlowAI is grading...</>
              ) : (
                <><Send className="w-4 h-4" /> Submit Answer</>
              )}
            </button>
          </div>
        ) : (
          /* Grade result */
          grade && (
            <div className="space-y-3">
              {/* Score banner */}
              <div className={cn('rounded-2xl p-4 flex items-center gap-4', grade.correct ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-red-50 dark:bg-red-950/40')}>
                <div className={cn('w-14 h-14 rounded-full flex flex-col items-center justify-center flex-shrink-0 text-white font-bold', getScoreColor(grade.score))}>
                  <span className="text-lg leading-none">{grade.score}</span>
                  <span className="text-xs opacity-80">/ 100</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {grade.correct
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : <XCircle className="w-4 h-4 text-red-400" />}
                    <span className={cn('text-sm font-bold', getGradeColor(grade.grade))}>Grade: {grade.grade}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{grade.feedback}</p>
                </div>
              </div>

              {/* Your answer */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-400 mb-1">Your answer</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{answers[current]}</p>
              </div>

              {/* Strengths */}
              {grade.strengths?.length > 0 && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3">
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> What you got right
                  </p>
                  <ul className="space-y-1">
                    {grade.strengths.map((s, i) => (
                      <li key={i} className="text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-1.5">
                        <span className="mt-0.5 flex-shrink-0">•</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvements */}
              {grade.improvements?.length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-950/30 rounded-xl p-3">
                  <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> How to improve
                  </p>
                  <ul className="space-y-1">
                    {grade.improvements.map((s, i) => (
                      <li key={i} className="text-xs text-orange-700 dark:text-orange-300 flex items-start gap-1.5">
                        <span className="mt-0.5 flex-shrink-0">•</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Study tip */}
              {grade.tip && (
                <div className="bg-sky-50 dark:bg-sky-950/30 rounded-xl p-3 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-sky-700 dark:text-sky-300"><span className="font-semibold">Study tip:</span> {grade.tip}</p>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Navigation */}
      {isSubmitted && (
        <div className="px-4 pb-4 flex-shrink-0">
          <button onClick={handleNext} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5">
            {current < questions.length - 1 ? (
              <>Next Question <ChevronRight className="w-4 h-4" /></>
            ) : (
              <>See Results <Award className="w-4 h-4" /></>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
