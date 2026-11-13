import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuizRunner } from './QuizRunner'
import type { QuizQuestionPayload } from '@siet/platform/lib/api/features'

const mcq: QuizQuestionPayload = {
  id: 1,
  type: 'mcq',
  question: 'Mutex ใช้ทำอะไร',
  options: [{ text: 'ล็อก' }, { text: 'จัดตาราง' }, { text: 'จองหน่วยความจำ' }, { text: 'ส่งข้อความ' }],
  correct_answer: 'ล็อก',
  explanation: '',
}
const fill: QuizQuestionPayload = {
  id: 2,
  type: 'fill',
  question: 'โปรโตคอลส่งอีเมลคือ [___]',
  options: [],
  correct_answer: 'SMTP',
  acceptable_answers: ['SMTP'],
  explanation: '',
}

describe('QuizRunner', () => {
  it('plays only multiple choice and says where the other questions are played', () => {
    render(<QuizRunner questions={[mcq, fill]} />)
    expect(screen.getByText(/Mutex ใช้ทำอะไร/)).toBeInTheDocument()
    expect(screen.queryByText(/โปรโตคอลส่งอีเมล/)).not.toBeInTheDocument()
    expect(screen.getByText(/1 fill-in-the-blank or matching question can be played in the AI Quiz app/)).toBeInTheDocument()
  })

  it('still plays older sets, whose questions have no type', () => {
    const { type: _type, ...legacy } = mcq
    render(<QuizRunner questions={[legacy as QuizQuestionPayload]} />)
    expect(screen.getByText(/Mutex ใช้ทำอะไร/)).toBeInTheDocument()
    expect(screen.queryByText(/AI Quiz app/)).not.toBeInTheDocument()
  })
})
