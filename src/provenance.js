/**
 * Token-level provenance tracking for AI/HUMAN source inheritance.
 *
 * Source inheritance rules (frozen per PROTOTYPE_GATE.md §1):
 *   - Typed text → HUMAN
 *   - AI-inserted text → AI
 *   - Editing an AI token = delete AI token + insert HUMAN token → new text is HUMAN
 *   - Deleting an AI token removes it from final text → no longer AI-positive
 *   - Copy/paste/move → source travels with the text (mark is preserved)
 *   - Undo/redo → provenance mark is restored with the content
 *
 * Implementation: ProseMirror inline mark "provenance" with attr source ∈ {"AI","HUMAN"}.
 * Text without the mark is treated as HUMAN (safe default).
 * Only AI-sourced text carries an explicit mark to keep the schema minimal.
 */

// ---------------------------------------------------------------------------
// Schema extension — call addProvenanceMark(schema) on your base schema
// ---------------------------------------------------------------------------

export const provenanceMarkSpec = {
  attrs: { source: { default: "HUMAN" } },
  inclusive: false,   // mark does NOT extend when user types at the boundary
  parseDOM: [
    {
      tag: "span[data-src]",
      getAttrs(dom) {
        return { source: dom.getAttribute("data-src") };
      },
    },
  ],
  toDOM(mark) {
    return ["span", { "data-src": mark.attrs.source, class: `src-${mark.attrs.source.toLowerCase()}` }, 0];
  },
};

// ---------------------------------------------------------------------------
// Insert AI text into the editor at the current selection
// ---------------------------------------------------------------------------

export function insertAIText(view, text) {
  const { state, dispatch } = view;
  const { schema, selection } = state;
  const from = selection.from;

  const aiMark = schema.marks.provenance.create({ source: "AI" });
  const node = schema.text(text, [aiMark]);
  const tr = state.tr.replaceSelectionWith(node, false);
  dispatch(tr);
}

// ---------------------------------------------------------------------------
// Sentence segmentation
// Processes at the paragraph level so sentences that span multiple text nodes
// (e.g., one HUMAN node + one AI node forming a single sentence) are treated
// as one unit. Returns array of {text, from, to} as document positions.
// ---------------------------------------------------------------------------

export function segmentSentences(doc) {
  const sentences = [];

  doc.forEach((paraNode, paraOffset) => {
    if (!paraNode.isBlock) return;

    // Build a flat array of {char, docPos} for the whole paragraph
    const chars = [];
    paraNode.forEach((child, childOffset) => {
      if (!child.isText) return;
      for (let i = 0; i < child.text.length; i++) {
        chars.push({
          ch: child.text[i],
          // +1 accounts for the paragraph's opening token
          docPos: paraOffset + 1 + childOffset + i,
        });
      }
    });

    if (chars.length === 0) return;

    const fullText = chars.map((c) => c.ch).join("");
    const re = /[^.!?]*[.!?]+/g;
    let match;
    let lastEnd = 0;

    while ((match = re.exec(fullText)) !== null) {
      const trimmed = match[0].trim();
      if (trimmed.length > 0) {
        // Find actual start/end in chars array (skip leading whitespace)
        const leadingSpaces = match[0].length - match[0].trimStart().length;
        const startIdx = match.index + leadingSpaces;
        const endIdx = match.index + match[0].length; // exclusive
        sentences.push({
          text: trimmed,
          from: chars[startIdx].docPos,
          to: endIdx < chars.length ? chars[endIdx - 1].docPos + 1
                                    : chars[chars.length - 1].docPos + 1,
        });
      }
      lastEnd = re.lastIndex;
    }

    // Trailing fragment without terminal punctuation
    if (lastEnd < fullText.length) {
      const frag = fullText.slice(lastEnd).trim();
      if (frag.length > 0) {
        const leadingSpaces = fullText.slice(lastEnd).length - frag.length;
        const startIdx = lastEnd + leadingSpaces;
        sentences.push({
          text: frag,
          from: chars[startIdx].docPos,
          to: chars[chars.length - 1].docPos + 1,
          incomplete: true,
        });
      }
    }
  });

  return sentences;
}

// ---------------------------------------------------------------------------
// Ground truth: is a sentence AI-positive?
// A sentence is AI-positive if any retained token has source=AI.
// ---------------------------------------------------------------------------

export function computeSentenceLabel(doc, sentence, schema) {
  let hasAI = false;
  doc.nodesBetween(sentence.from, sentence.to, (node) => {
    if (!node.isText) return;
    const provMark = node.marks.find(
      (m) => m.type === schema.marks.provenance && m.attrs.source === "AI"
    );
    if (provMark) hasAI = true;
  });
  return hasAI ? "AI" : "HUMAN";
}

// ---------------------------------------------------------------------------
// Provenance log snapshot
// Call this after every writing session to get the full ground-truth log.
// ---------------------------------------------------------------------------

export function buildProvenanceLog(doc, schema, participantId, taskId) {
  const sentences = segmentSentences(doc);
  return {
    participant_id: participantId,
    task_id: taskId,
    logged_at: new Date().toISOString(),
    sentences: sentences.map((s, idx) => {
      const label = computeSentenceLabel(doc, s, schema);
      // Compute AI token share within the sentence
      let totalChars = 0;
      let aiChars = 0;
      doc.nodesBetween(s.from, s.to, (node) => {
        if (!node.isText) return;
        const len = node.text.length;
        totalChars += len;
        const isAI = node.marks.some(
          (m) => m.type === schema.marks.provenance && m.attrs.source === "AI"
        );
        if (isAI) aiChars += len;
      });
      return {
        sentence_index: idx,
        text: s.text,
        ground_truth: label,       // "AI" | "HUMAN"
        ai_token_share: totalChars > 0 ? aiChars / totalChars : 0,
        incomplete: s.incomplete ?? false,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Edge-case verification helpers (used in provenance.test.js)
// ---------------------------------------------------------------------------

export function countTokensBySource(doc, schema) {
  let ai = 0, human = 0;
  doc.descendants((node) => {
    if (!node.isText) return;
    const isAI = node.marks.some(
      (m) => m.type === schema.marks.provenance && m.attrs.source === "AI"
    );
    if (isAI) ai += node.text.length;
    else human += node.text.length;
  });
  return { ai, human };
}
