/**
 * In the KMITL RAG AI transcript only the newest answer's owl moves; older
 * answers keep a still owl so a long chat does not bob all over.
 */
export function avatarIsStill(index: number, messages: readonly { role: string }[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return i !== index
  }
  return true
}
