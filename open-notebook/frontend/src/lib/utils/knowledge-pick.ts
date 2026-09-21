/**
 * The "เจาะจงเอกสาร" dropdown mixes three kinds of things in one <select>:
 * an uploaded library document, a whole shared notebook, or one source inside
 * a notebook. A <select> value is a plain string, so each pick is encoded as
 * `<kind>:<id>` and decoded again when the question is sent.
 */
import type { AskRequest } from '@/lib/api/community'

export type KnowledgePick =
  | { kind: 'doc'; id: number }
  | { kind: 'notebook'; id: string }
  | { kind: 'source'; id: string }

const RECORD_PICK = /^(nb|src):(notebook|source):([A-Za-z0-9_-]{1,64})$/

export function encodePick(pick: KnowledgePick): string {
  if (pick.kind === 'doc') return `doc:${pick.id}`
  return pick.kind === 'notebook' ? `nb:${pick.id}` : `src:${pick.id}`
}

export function decodePick(value: string | null | undefined): KnowledgePick | null {
  if (!value) return null
  if (value.startsWith('doc:')) {
    const id = Number(value.slice(4))
    return Number.isInteger(id) && id > 0 ? { kind: 'doc', id } : null
  }
  const match = RECORD_PICK.exec(value)
  if (!match) return null
  const [, prefix, table, key] = match
  if (prefix === 'nb' && table === 'notebook') return { kind: 'notebook', id: `notebook:${key}` }
  if (prefix === 'src' && table === 'source') return { kind: 'source', id: `source:${key}` }
  return null
}

/** Pick from the page's query string: ?doc=12, ?notebook=notebook:abc or ?source=source:xyz */
export function pickFromParams(params: { get: (key: string) => string | null }): string | null {
  const doc = params.get('doc')
  if (doc) return decodePick(`doc:${doc}`) ? `doc:${Number(doc)}` : null
  const notebook = params.get('notebook')
  if (notebook) return decodePick(`nb:${notebook}`) ? `nb:${notebook}` : null
  const source = params.get('source')
  if (source) return decodePick(`src:${source}`) ? `src:${source}` : null
  return null
}

type ScopeFields = Pick<AskRequest, 'scope' | 'document_ids' | 'notebook_ids' | 'source_ids'>

/** Request fields for POST /community/ask; an empty pick sends nothing scoped. */
export function pickToAskFields(pick: KnowledgePick | null): ScopeFields {
  const empty: ScopeFields = { scope: 'document', document_ids: [], notebook_ids: [], source_ids: [] }
  if (!pick) return empty
  if (pick.kind === 'doc') return { ...empty, document_ids: [pick.id] }
  if (pick.kind === 'source') return { ...empty, source_ids: [pick.id] }
  return { ...empty, scope: 'notebook', notebook_ids: [pick.id] }
}
