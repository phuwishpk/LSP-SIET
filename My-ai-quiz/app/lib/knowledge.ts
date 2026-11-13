/**
 * The knowledge-source picker: the same choices as the AI Roadmap app and the
 * "KMITL RAG AI" page. A <select> value is a string, so every choice is
 * encoded as `<kind>[:<id>]`; single documents are ticked in a list instead.
 */
import { api } from './workspace';

export const AUTO = 'auto';
export const PERSONAL = 'personal';
export const NONE = 'none';
// "Pick files myself": several documents ticked in a list.
export const FILES = 'files';
// The API takes at most 20 documents and 20 notebook sources per request.
export const MAX_PICKED_FILES = 20;

export interface KnowledgeOption {
  value: string;
  label: string;
}
export interface KnowledgeGroup {
  label: string;
  options: KnowledgeOption[];
}
export interface KnowledgeFile extends KnowledgeOption {
  meta: string;
}
interface Room {
  id: number;
  code?: string;
  name?: string;
  joined?: boolean;
  kind?: string;
}
interface LibraryDoc {
  id: number;
  title: string;
  status?: string;
  scope?: string;
  course?: { code?: string } | null;
}
interface SharedNotebook {
  id: string;
  name: string;
  kind?: string;
  sources?: { id: string; title: string }[];
}

/** Load every choice; a group that fails to load is simply empty. */
export async function loadKnowledgeOptions(): Promise<{ rooms: Room[]; groups: KnowledgeGroup[]; files: KnowledgeFile[] }> {
  const [rooms, library, knowledge] = await Promise.all([
    api<Room[]>('ws/community/courses').catch(() => [] as Room[]),
    api<{ items?: LibraryDoc[] }>('ws/community/library').catch(() => ({ items: [] as LibraryDoc[] })),
    api<{ notebooks?: SharedNotebook[] }>('ws/community/knowledge').catch(() => ({ notebooks: [] as SharedNotebook[] })),
  ]);
  const courseRooms = (rooms || []).filter((room) => room.kind !== 'club');
  const documents = (library?.items || []).filter((doc) => doc.status === 'ready');
  // Course libraries are already offered as rooms; here only what staff share.
  const notebooks = (knowledge?.notebooks || []).filter((nb) => nb.kind !== 'course');

  return {
    rooms: courseRooms,
    groups: [
      {
        label: 'ห้องวิชาของฉัน',
        options: courseRooms
          .filter((room) => room.joined)
          .map((room) => ({ value: `course:${room.id}`, label: `คลังวิชา ${room.code ?? ''} ${room.name ?? ''}`.trim() })),
      },
      {
        label: 'Notebook ที่อาจารย์แชร์',
        options: notebooks.map((nb) => ({ value: `nb:${nb.id}`, label: `${nb.name} (ทั้ง notebook)` })),
      },
    ].filter((group) => group.options.length > 0),
    files: [
      ...documents.map((doc) => ({
        value: `doc:${doc.id}`,
        label: doc.title,
        meta: doc.course?.code ? `คลังวิชา ${doc.course.code}` : doc.scope === 'personal' ? 'ไฟล์ของฉัน' : 'คลังความรู้',
      })),
      ...notebooks.flatMap((nb) =>
        (nb.sources || []).map((source) => ({ value: `src:${source.id}`, label: source.title, meta: nb.name }))
      ),
    ],
  };
}

/** Choice (+ the ticked files for FILES) -> the scope fields of POST /community/study/quiz. */
export function scopeFields(choice: string, picked: string[] = []): Record<string, unknown> {
  if (choice === FILES) {
    const ids = (prefix: string) => picked.filter((value) => value.startsWith(prefix)).map((value) => value.slice(prefix.length));
    return { scope: 'document', document_ids: ids('doc:').map(Number), source_ids: ids('src:') };
  }
  const [kind, ...rest] = String(choice || AUTO).split(':');
  const id = rest.join(':');
  if (kind === 'course') return { scope: 'course', course_id: Number(id) };
  if (kind === 'nb') return { scope: 'notebook', notebook_ids: [id] };
  if (kind === PERSONAL) return { scope: 'personal' };
  if (kind === NONE) return { scope: 'none' };
  return { scope: 'auto' };
}
