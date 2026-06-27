import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { schema } from "./schema.js";
import { insertAIText, buildProvenanceLog } from "./provenance.js";
import { fetchSuggestion, getLLMConfig } from "./llm.js";
import { saveLog } from "./storage.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let participantId = null;
let taskId = null;
let apiKey = null;
let view = null;
let suggestionPending = false;

// ---------------------------------------------------------------------------
// Editor setup
// ---------------------------------------------------------------------------

export function initEditor(mountEl, config) {
  participantId = config.participantId;
  taskId = config.taskId;
  apiKey = config.apiKey;

  const state = EditorState.create({
    schema,
    plugins: [
      history(),
      keymap({ "Mod-z": undo, "Mod-y": redo, ...baseKeymap }),
    ],
  });

  view = new EditorView(mountEl, {
    state,
    dispatchTransaction(tr) {
      const newState = view.state.apply(tr);
      view.updateState(newState);
    },
  });

  return view;
}

// ---------------------------------------------------------------------------
// Request AI suggestion and insert as AI-marked text
// ---------------------------------------------------------------------------

export async function requestSuggestion() {
  if (!view || suggestionPending) return;
  suggestionPending = true;

  const { state } = view;
  const { from } = state.selection;

  // Build context: last ~300 characters before cursor
  let context = "";
  state.doc.nodesBetween(0, from, (node) => {
    if (node.isText) context += node.text;
  });
  context = context.slice(-300);

  if (context.replace(/\s/g, "").length < 20) {
    suggestionPending = false;
    throw new Error("请先写一些内容，再获取 AI 建议。");
  }

  try {
    const suggestion = await fetchSuggestion(context, apiKey);
    insertAIText(view, " " + suggestion);
  } finally {
    suggestionPending = false;
  }
}

// ---------------------------------------------------------------------------
// Export provenance log (call at task completion)
// ---------------------------------------------------------------------------

export function exportLog() {
  if (!view) return null;
  const log = buildProvenanceLog(view.state.doc, schema, participantId, taskId);
  log.llm_model = getLLMConfig().model;
  log.prolific_id = window._studyConfig?.prolificId ?? null;
  log.writing_duration_seconds = window._studyConfig?.writing_duration_seconds ?? null;
  return log;
}

export async function submitLog(ratings, ownership) {
  const log = exportLog();
  if (!log) return { ok: false, error: "No log" };
  if (ratings) log.participant_ratings = ratings;
  if (ownership) log.ownership_ratings = ownership;
  return await saveLog(log);
}

export function downloadLog() {
  const log = exportLog();
  if (!log) return;
  const blob = new Blob([JSON.stringify(log, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `provenance_${participantId}_${taskId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getLLMInfo() {
  return getLLMConfig();
}
