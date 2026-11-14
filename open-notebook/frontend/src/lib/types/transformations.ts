export interface Transformation {
  id: string
  name: string
  title: string
  description: string
  prompt: string
  apply_default: boolean
  model_id: string | null
  created: string
  updated: string
}
