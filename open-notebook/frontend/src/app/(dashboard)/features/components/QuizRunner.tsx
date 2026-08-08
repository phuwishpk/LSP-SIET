'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import { QuizQuestionPayload } from '@/lib/api/features'

interface QuizRunnerProps {
  questions: QuizQuestionPayload[]
}

export function QuizRunner({ questions }: QuizRunnerProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const score = useMemo(() => {
    if (!submitted) return 0
    return questions.reduce((acc, q) => {
      return selectedAnswers[q.id] === q.correct_answer ? acc + 1 : acc
    }, 0)
  }, [questions, selectedAnswers, submitted])

  const answeredCount = Object.keys(selectedAnswers).length
  const allAnswered = answeredCount === questions.length

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No questions were generated.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <Card key={question.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {index + 1}. {question.question}
              </p>
              {submitted ? (
                selectedAnswers[question.id] === question.correct_answer ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                )
              ) : null}
            </div>
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => {
                const isSelected = selectedAnswers[question.id] === option.text
                const isCorrect = option.text === question.correct_answer
                const showAsCorrect = submitted && isCorrect
                const showAsWrong = submitted && isSelected && !isCorrect
                return (
                  <label
                    key={`${question.id}-${optionIndex}`}
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition ${
                      showAsCorrect
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                        : showAsWrong
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                        : isSelected
                        ? 'border-primary bg-accent'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      value={option.text}
                      checked={isSelected}
                      disabled={submitted}
                      onChange={() =>
                        setSelectedAnswers((prev) => ({
                          ...prev,
                          [question.id]: option.text,
                        }))
                      }
                    />
                    <span className="text-sm flex-1">{option.text}</span>
                  </label>
                )
              })}
            </div>
            {submitted && (
              <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300">
                  Correct answer: <span className="text-green-600">{question.correct_answer}</span>
                </p>
                <p className="text-muted-foreground mt-1">{question.explanation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {!submitted ? (
        <Button
          onClick={() => setSubmitted(true)}
          disabled={!allAnswered}
          className="w-full"
        >
          {allAnswered ? 'Submit answers' : `Answer all questions (${answeredCount}/${questions.length})`}
        </Button>
      ) : (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <Sparkles className="h-6 w-6 mx-auto text-yellow-500" />
            <p className="text-xl font-bold">
              Score: {score} / {questions.length}
            </p>
            <p className="text-sm text-muted-foreground">
              You answered {score} questions correctly out of {questions.length}.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedAnswers({})
                setSubmitted(false)
              }}
            >
              Retake quiz
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
