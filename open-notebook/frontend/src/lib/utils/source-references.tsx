import React from 'react'
import { FileText, Lightbulb, FileEdit } from 'lucide-react'

export type ReferenceType = 'source' | 'note' | 'source_insight' | 'url'

export interface ParsedReference {
  type: ReferenceType
  id: string
  originalText: string
  startIndex: number
  endIndex: number
}

// ExtractedReference and ExtractedReferences are kept for backward compatibility
// but not currently used in the codebase
export interface ExtractedReference {
  type: ReferenceType
  id: string
  originalText: string
  placeholder: string
}

export interface ExtractedReferences {
  processedText: string
  references: ExtractedReference[]
}

export interface ReferenceData {
  number: number
  type: ReferenceType
  id: string
}

/**
 * Parse source references from text
 *
 * Handles various formats:
 * - [source:abc123] → single reference
 * - [note:a], [note:b] → multiple references
 * - [note:a, note:b] → comma-separated references (edge case from LLM)
 * - Mixed: [source:x, note:y, source_insight:z]
 * - [url:https://example.com] → external URL reference
 * - https://example.com → plain URL
 *
 * @param text - Text containing references
 * @returns Array of parsed references
 */
export function parseSourceReferences(text: string): ParsedReference[] {
  const matches: ParsedReference[] = []

  // Pattern 1: (source_insight|insight|note|source):alphanumeric_id
  // Optional inner prefix handles LLM outputs like `source:source:xxxxx`
  // (the model sometimes re-adds `source:` even though the ID already has it).
  // Without this the parser would treat the literal word `source` as the ID
  // and produce URLs like /api/sources/source:source → 404.
  const docPattern = /(source_insight|insight|note|source):(?:(?:source_insight|insight|note|source):)?([a-zA-Z0-9_]+)/g
  let match
  while ((match = docPattern.exec(text)) !== null) {
    const rawType = match[1]
    const type = (rawType === 'insight' ? 'source_insight' : rawType) as ReferenceType
    const id = match[2]

    matches.push({
      type,
      id,
      originalText: match[0],
      startIndex: match.index,
      endIndex: docPattern.lastIndex
    })
  }

  // Pattern 2: [url:https://...] or plain URLs
  // Match [url:https://...] format
  const urlBracketedPattern = /\[url:([^\]]+)\]/g
  while ((match = urlBracketedPattern.exec(text)) !== null) {
    const url = match[1]
    matches.push({
      type: 'url',
      id: url,
      originalText: match[0],
      startIndex: match.index,
      endIndex: urlBracketedPattern.lastIndex
    })
  }

  // Pattern 3: Plain URLs not already captured in [url:...] brackets
  // Look for http/https URLs that aren't inside brackets already captured
  const urlPattern = /(?<![\[])https?:\/\/[^\s\]\"'<>]+/g
  while ((match = urlPattern.exec(text)) !== null) {
    const url = match[0]
    // Skip if this URL is already inside a [url:...] bracket we already captured
    const alreadyCaptured = matches.some(m =>
      m.type === 'url' &&
      text.substring(Math.max(0, m.startIndex - 5), m.startIndex) === '[url:' &&
      m.startIndex <= match!.index && m.endIndex >= match!.index + url.length
    )
    if (!alreadyCaptured) {
      matches.push({
        type: 'url',
        id: url,
        originalText: match[0],
        startIndex: match.index,
        endIndex: urlPattern.lastIndex
      })
    }
  }

  return matches
}

/**
 * Convert source references in text to clickable React elements
 *
 * @param text - Text containing references
 * @param onReferenceClick - Callback when reference is clicked (type, id)
 * @returns React nodes with clickable reference buttons
 */
export function convertSourceReferences(
  text: string,
  onReferenceClick: (type: ReferenceType, id: string) => void
): React.ReactNode {
  const matches = parseSourceReferences(text)

  if (matches.length === 0) return text

  const parts: React.ReactNode[] = []
  let lastIndex = 0

  matches.forEach((match, idx) => {
    // Check if there are brackets before the match
    const beforeMatch = text.substring(Math.max(0, match.startIndex - 2), match.startIndex)
    const hasDoubleBracketBefore = beforeMatch === '[['
    const hasSingleBracketBefore = beforeMatch.endsWith('[') && !hasDoubleBracketBefore

    // Determine where to start including text
    let textStartIndex = lastIndex
    if (hasDoubleBracketBefore && lastIndex === match.startIndex - 2) {
      textStartIndex = match.startIndex - 2
    } else if (hasSingleBracketBefore && lastIndex === match.startIndex - 1) {
      textStartIndex = match.startIndex - 1
    }

    // Add text before match (excluding brackets we'll include in the button)
    if (textStartIndex < match.startIndex && lastIndex < textStartIndex) {
      parts.push(text.substring(lastIndex, textStartIndex))
    } else if (lastIndex < match.startIndex && !hasSingleBracketBefore && !hasDoubleBracketBefore) {
      parts.push(text.substring(lastIndex, match.startIndex))
    }

    // Check if there are brackets after the match
    const afterMatch = text.substring(match.endIndex, Math.min(text.length, match.endIndex + 2))
    const hasDoubleBracketAfter = afterMatch === ']]'
    const hasSingleBracketAfter = afterMatch.startsWith(']') && !hasDoubleBracketAfter

    // Determine the display text with appropriate brackets
    let displayText = match.originalText
    if (hasDoubleBracketBefore && hasDoubleBracketAfter) {
      displayText = `[[${match.originalText}]]`
    } else if (hasSingleBracketBefore && hasSingleBracketAfter) {
      displayText = `[${match.originalText}]`
    } else {
      displayText = match.originalText
    }

    // Add clickable reference button
    parts.push(
      <button
        key={`ref-${idx}-${match.type}-${match.id}`}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onReferenceClick(match.type, match.id)
        }}
        className="text-primary hover:underline cursor-pointer inline font-medium"
        type="button"
      >
        {displayText}
      </button>
    )

    // Update lastIndex to skip the closing brackets
    if (hasDoubleBracketAfter) {
      lastIndex = match.endIndex + 2
    } else if (hasSingleBracketAfter) {
      lastIndex = match.endIndex + 1
    } else {
      lastIndex = match.endIndex
    }
  })

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return <>{parts}</>
}

/**
 * Convert references in text to markdown links
 * Use this BEFORE passing text to ReactMarkdown
 *
 * Handles complex patterns including:
 * - Plain references: source:abc → [source:abc](#ref-source-abc)
 * - Bracketed: [source:abc] → [[source:abc]](#ref-source-abc)
 * - Double brackets: [[source:abc]] → [[[source:abc]]](#ref-source-abc)
 * - With bold: [**source:abc**] → [**source:abc**](#ref-source-abc)
 * - After commas: [source:a, note:b] → each converted separately
 * - Nested: [**source:a**, [source_insight:b]] → both converted
 * - URL references: [url:https://...] or plain https://... → clickable links
 *
 * @param text - Original text with references
 * @returns Text with references converted to markdown links
 */
export function convertReferencesToMarkdownLinks(text: string): string {
  // Step 1: Find ALL document references (see parseSourceReferences for why
  // the inner double-prefix is tolerated).
  const refPattern = /(source_insight|insight|note|source):(?:(?:source_insight|insight|note|source):)?([a-zA-Z0-9_]+)/g
  const references: Array<{ type: string; id: string; index: number; length: number }> = []

  let match
  while ((match = refPattern.exec(text)) !== null) {
    const rawType = match[1]
    const id = match[2]
    const validTypes = ['source', 'source_insight', 'insight', 'note']
    if (!validTypes.includes(rawType) || !id || id.length === 0 || id.length > 100) continue
    const type = rawType === 'insight' ? 'source_insight' : rawType
    references.push({ type, id, index: match.index, length: match[0].length })
  }

  // Step 2: Find URL references
  const urlBracketedPattern = /\[url:([^\]]+)\]/g
  while ((match = urlBracketedPattern.exec(text)) !== null) {
    references.push({ type: 'url', id: match[1], index: match.index, length: match[0].length })
  }

  // Plain URLs (not already captured)
  const urlPattern = /(?<![\[])https?:\/\/[^\s\]\"'<>]+/g
  while ((match = urlPattern.exec(text)) !== null) {
    const alreadyCaptured = references.some(r =>
      r.type === 'url' && match!.index >= r.index && match!.index + match![0].length <= r.index + r.length
    )
    if (!alreadyCaptured) {
      references.push({ type: 'url', id: match[0], index: match.index, length: match[0].length })
    }
  }

  // If no references found, return original text
  if (references.length === 0) return text

  // Step 3: Process references from end to start (to preserve indices)
  let result = text
  for (let i = references.length - 1; i >= 0; i--) {
    const ref = references[i]
    const refStart = ref.index
    const refEnd = refStart + ref.length

    if (ref.type === 'url') {
      // For URLs, create a proper markdown link
      const urlMarkdown = `[${ref.id}](${ref.id})`
      result = result.substring(0, refStart) + urlMarkdown + result.substring(refEnd)
    } else {
      // Document reference processing
      const refText = `${ref.type}:${ref.id}`
      const contextBefore = result.substring(Math.max(0, refStart - 50), refStart)
      const contextAfter = result.substring(refEnd, Math.min(result.length, refEnd + 50))

      let displayText = refText
      let replaceStart = refStart
      let replaceEnd = refEnd

      if (contextBefore.endsWith('[[') && contextAfter.startsWith(']]')) {
        displayText = `[[${refText}]]`
        replaceStart = refStart - 2
        replaceEnd = refEnd + 2
      } else if (contextBefore.endsWith('[') && contextAfter.startsWith(']')) {
        displayText = `[${refText}]`
        replaceStart = refStart - 1
        replaceEnd = refEnd + 1
      } else if (contextBefore.endsWith('[**') && contextAfter.startsWith('**]')) {
        displayText = `[**${refText}**]`
        replaceStart = refStart - 3
        replaceEnd = refEnd + 3
      } else if (contextBefore.endsWith('**') && contextAfter.startsWith('**')) {
        displayText = `**${refText}**`
        replaceStart = refStart - 2
        replaceEnd = refEnd + 2
      }

      const href = `#ref-${ref.type}-${ref.id}`
      const markdownLink = `[${displayText}](${href})`
      result = result.substring(0, replaceStart) + markdownLink + result.substring(replaceEnd)
    }
  }

  return result
}

/**
 * Create a custom link component for ReactMarkdown that handles reference links
 *
 * @param onReferenceClick - Callback for when a reference link is clicked
 * @returns React component for rendering links
 */
export function createReferenceLinkComponent(
  onReferenceClick: (type: ReferenceType, id: string) => void
) {
  const ReferenceLinkComponent = ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href?: string
    children?: React.ReactNode
  }) => {
    // Check if this is a URL link (external link)
    if (href?.startsWith('http://') || href?.startsWith('https://')) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
          {...props}
        >
          {children}
        </a>
      )
    }

    // Check if this is a reference link (starts with #ref-)
    if (href?.startsWith('#ref-')) {
      // Parse: #ref-source-abc123 → type=source, id=abc123
      const parts = href.substring(5).split('-') // Remove '#ref-'
      const type = parts[0] as ReferenceType
      const id = parts.slice(1).join('-') // Rejoin in case ID has dashes

      // Select appropriate icon based on reference type
      const IconComponent =
        type === 'source' ? FileText :
        type === 'source_insight' ? Lightbulb :
        FileEdit // note

      return (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReferenceClick(type, id)
          }}
          className="text-primary hover:underline cursor-pointer inline font-medium"
          type="button"
        >
          <IconComponent className="h-3 w-3 inline mr-1" aria-hidden="true" />
          {children}
        </button>
      )
    }

    // Regular link - open in new tab
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props} className="text-primary hover:underline">
        {children}
      </a>
    )
  }

  ReferenceLinkComponent.displayName = 'ReferenceLinkComponent'
  return ReferenceLinkComponent
}

/**
 * Convert references in text to compact numbered format with reference list
 *
 * This function transforms verbose inline references like [source:abc123] into
 * compact numbered citations [1], [2], etc., and appends a "References:" section
 * at the bottom of the message with the full reference details.
 *
 * Algorithm:
 * 1. Parse all references using parseSourceReferences()
 * 2. Build a reference map to deduplicate and assign numbers
 * 3. Replace inline references with numbered citations
 * 4. Append reference list at the bottom
 *
 * @param text - Original text with references
 * @param referencesLabel - Locales label for "References" title (default: "References")
 * @returns Text with numbered citations and reference list appended
 *
 * @example
 * Input: "See [source:abc] and [note:xyz]. Also [source:abc] again."
 * Output: "See [1] and [2]. Also [1] again.\n\nReferences:\n[1] - [source:abc]\n[2] - [note:xyz]"
 */
export function convertReferencesToCompactMarkdown(
  text: string,
  referencesLabel: string = 'References',
  options: { appendList?: boolean } = {}
): string {
  const appendList = options.appendList ?? true
  return convertReferencesToCompactMarkdownImpl(text, referencesLabel, appendList)
}

function convertReferencesToCompactMarkdownImpl(text: string, referencesLabel: string, appendList: boolean): string {
  // Step 1: Parse all references using existing function
  const references = parseSourceReferences(text)

  // Step 2: If no references found, return original text
  if (references.length === 0) {
    return text
  }

  // Step 3: Build reference map (deduplicate and assign numbers)
  const referenceMap = new Map<string, ReferenceData>()
  let nextNumber = 1

  for (const reference of references) {
    const key = `${reference.type}:${reference.id}`
    if (!referenceMap.has(key)) {
      referenceMap.set(key, {
        number: nextNumber++,
        type: reference.type,
        id: reference.id
      })
    }
  }

  // Step 4: Replace references with numbered citations (process from end to start)
  let result = text
  for (let i = references.length - 1; i >= 0; i--) {
    const reference = references[i]
    const key = `${reference.type}:${reference.id}`
    const refData = referenceMap.get(key)!
    const number = refData.number

    const refStart = reference.startIndex
    const refEnd = reference.endIndex
    const contextBefore = result.substring(Math.max(0, refStart - 2), refStart)
    const contextAfter = result.substring(refEnd, Math.min(result.length, refEnd + 2))

    let replaceStart = refStart
    let replaceEnd = refEnd

    // Check for double brackets [[ref]]
    if (contextBefore === '[[' && contextAfter.startsWith(']]')) {
      replaceStart = refStart - 2
      replaceEnd = refEnd + 2
    }
    // Check for single brackets [ref]
    else if (contextBefore.endsWith('[') && contextAfter.startsWith(']')) {
      replaceStart = refStart - 1
      replaceEnd = refEnd + 1
    }

    // Build the numbered citation
    if (reference.type === 'url') {
      // For URLs, keep the full URL as the link
      const citationLink = `[${number}](${reference.id})`
      result = result.substring(0, replaceStart) + citationLink + result.substring(replaceEnd)
    } else {
      const citationLink = `[${number}](#ref-${reference.type}-${reference.id})`
      result = result.substring(0, replaceStart) + citationLink + result.substring(replaceEnd)
    }
  }

  // Step 5+6: Optionally append reference list at the bottom of the message.
  // Skipped when the caller renders references separately below the message
  // bubble (e.g. AskChatView's unified ReferencesList).
  if (!appendList) {
    return result
  }
  const refListLines: string[] = [`\n\n${referencesLabel}:`]
  for (const [, refData] of referenceMap) {
    let refListItem: string
    if (refData.type === 'url') {
      refListItem = `[${refData.number}] - [${refData.id}](${refData.id})`
    } else {
      refListItem = `[${refData.number}] - [${refData.type}:${refData.id}](#ref-${refData.type}-${refData.id})`
    }
    refListLines.push(refListItem)
  }
  return result + refListLines.join('\n')
}

/**
 * Extract the sources / notes / URLs actually cited in a message, deduplicated
 * and preserving first-appearance order. IDs are stripped of the `source:` /
 * `note:` prefix so callers can join them with a display name from a lookup.
 */
export function extractCitedReferences(text: string): {
  sources: string[]
  notes: string[]
  urls: string[]
} {
  const parsed = parseSourceReferences(text)
  const sources = new Set<string>()
  const notes = new Set<string>()
  const urls = new Set<string>()
  for (const ref of parsed) {
    if (ref.type === 'source' || ref.type === 'source_insight') {
      sources.add(ref.id)
    } else if (ref.type === 'note') {
      notes.add(ref.id)
    } else if (ref.type === 'url') {
      urls.add(ref.id)
    }
  }
  return {
    sources: [...sources],
    notes: [...notes],
    urls: [...urls],
  }
}

/**
 * Create a custom link component for ReactMarkdown that handles compact reference links
 *
 * This component handles two types of reference links:
 * 1. Numbered citations in text: [1](#ref-source-abc123)
 * 2. Reference list items: [source:abc123](#ref-source-abc123)
 * 3. External URLs: [https://example.com](https://example.com)
 *
 * Both use the same href format: #ref-{type}-{id}
 * The component extracts the type and id from the href and triggers the click handler.
 *
 * @param onReferenceClick - Callback for when a reference link is clicked
 * @returns React component for rendering links in ReactMarkdown
 *
 * @example
 * const LinkComponent = createCompactReferenceLinkComponent((type, id) => openModal(type, id))
 * <ReactMarkdown components={{ a: LinkComponent }}>...</ReactMarkdown>
 */
export function createCompactReferenceLinkComponent(
  onReferenceClick: (type: ReferenceType, id: string) => void
) {
  const CompactReferenceLinkComponent = ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href?: string
    children?: React.ReactNode
  }) => {
    // Check if this is a URL link (external link)
    if (href?.startsWith('http://') || href?.startsWith('https://')) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
          {...props}
        >
          {children}
        </a>
      )
    }

    // Check if this is a reference link (starts with #ref-)
    if (href?.startsWith('#ref-')) {
      // Parse: #ref-source-abc123 → type=source, id=abc123
      const parts = href.substring(5).split('-') // Remove '#ref-'
      const type = parts[0] as ReferenceType
      const id = parts.slice(1).join('-') // Rejoin in case ID has dashes

      return (
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onReferenceClick(type, id)
          }}
          className="text-primary hover:underline cursor-pointer inline font-medium"
          type="button"
        >
          {children}
        </button>
      )
    }

    // Regular link - open in new tab
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props} className="text-primary hover:underline">
        {children}
      </a>
    )
  }

  CompactReferenceLinkComponent.displayName = 'CompactReferenceLinkComponent'
  return CompactReferenceLinkComponent
}

/**
 * Legacy function for backward compatibility
 * Converts old Link-based references to new click handler approach
 *
 * @deprecated Use extractReferences + replacePlaceholdersWithButtons instead
 */
export function convertSourceReferencesLegacy(text: string): React.ReactNode {
  // For legacy support, just return text as-is
  // Components should migrate to new convertSourceReferences function
  return text
}
