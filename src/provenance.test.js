/**
 * Edge-case verification suite for token provenance.
 * Run with: node src/provenance.test.js
 *
 * Each test case maps to one row in PROTOTYPE_GATE.md §3 verification table.
 * All tests must pass before pilot data collection begins.
 */

// Minimal ProseMirror simulation without a browser DOM.
// We use the Node.js-compatible @prosemirror/... packages via require if
// available, otherwise we stub the schema for unit-testing provenance logic.

import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { history, undo, redo } from "prosemirror-history";
import { provenanceMarkSpec, buildProvenanceLog, countTokensBySource, insertAIText } from "./provenance.js";

// ---------------------------------------------------------------------------
// Minimal schema
// ---------------------------------------------------------------------------

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*", toDOM: () => ["p", 0] },
    text: {},
  },
  marks: { provenance: provenanceMarkSpec },
});

function aiMark() {
  return schema.marks.provenance.create({ source: "AI" });
}

function makeState(doc) {
  return EditorState.create({ schema, doc, plugins: [history()] });
}

function makeDoc(fragments) {
  // fragments: [{text, ai}]
  const nodes = fragments.map(({ text, ai }) => {
    const marks = ai ? [aiMark()] : [];
    return schema.text(text, marks);
  });
  return schema.node("doc", null, [schema.node("paragraph", null, nodes)]);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✅  ${name}`);
    passed++;
  } else {
    console.error(`  ❌  ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Direct AI insertion → sentence is AI-positive
// ---------------------------------------------------------------------------
console.log("\nTest 1: AI insertion → AI-positive");
{
  const doc = makeDoc([{ text: "Hello ", ai: false }, { text: "world.", ai: true }]);
  const log = buildProvenanceLog(doc, schema, "P_TEST", "T1");
  const s = log.sentences[0];
  assert("sentence labelled AI", s.ground_truth === "AI");
  assert("ai_token_share > 0", s.ai_token_share > 0);
}

// ---------------------------------------------------------------------------
// Test 2: All human text → AI-negative
// ---------------------------------------------------------------------------
console.log("\nTest 2: All human text → AI-negative");
{
  const doc = makeDoc([{ text: "Hello world.", ai: false }]);
  const log = buildProvenanceLog(doc, schema, "P_TEST", "T2");
  assert("sentence labelled HUMAN", log.sentences[0].ground_truth === "HUMAN");
  assert("ai_token_share = 0", log.sentences[0].ai_token_share === 0);
}

// ---------------------------------------------------------------------------
// Test 3: Partial replacement — user overwrites part of AI text
// Simulate: "AI wrote [Hello world.]; user deletes 'world' and types 'there'"
// Result: 'Hello ' still AI, 'there.' is HUMAN → still AI-positive (one AI token remains)
// ---------------------------------------------------------------------------
console.log("\nTest 3: Partial replacement → still AI-positive");
{
  const doc = makeDoc([
    { text: "Hello ", ai: true },   // AI token retained
    { text: "there.", ai: false },  // user replaced "world." with "there."
  ]);
  const log = buildProvenanceLog(doc, schema, "P_TEST", "T3");
  assert("sentence labelled AI (partial AI remains)", log.sentences[0].ground_truth === "AI");
}

// ---------------------------------------------------------------------------
// Test 4: Full replacement — user deletes all AI text, types own sentence
// ---------------------------------------------------------------------------
console.log("\nTest 4: Full replacement → AI-negative");
{
  const doc = makeDoc([{ text: "My own sentence.", ai: false }]);
  const log = buildProvenanceLog(doc, schema, "P_TEST", "T4");
  assert("sentence labelled HUMAN (no AI tokens remain)", log.sentences[0].ground_truth === "HUMAN");
}

// ---------------------------------------------------------------------------
// Test 5: Copy-paste of AI text preserves AI mark
// Simulated by constructing a doc where AI text appears twice
// ---------------------------------------------------------------------------
console.log("\nTest 5: Copy-paste AI text → AI mark preserved");
{
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("Original. ", []),
      schema.text("AI sentence.", [aiMark()]),
    ]),
    schema.node("paragraph", null, [
      schema.text("AI sentence.", [aiMark()]),  // pasted copy
    ]),
  ]);
  const log = buildProvenanceLog(doc, schema, "P_TEST", "T5");
  // Both paragraphs should have AI-positive sentences
  const aiPositive = log.sentences.filter((s) => s.ground_truth === "AI");
  assert("pasted AI text retains AI label", aiPositive.length === 2,
    `found ${aiPositive.length} AI-positive sentences, expected 2`);
}

// ---------------------------------------------------------------------------
// Test 6: Multiple sentences in one paragraph
// ---------------------------------------------------------------------------
console.log("\nTest 6: Sentence segmentation — mixed labels");
{
  const doc = makeDoc([
    { text: "Human sentence. ", ai: false },
    { text: "AI sentence. ", ai: true },
    { text: "Another human one.", ai: false },
  ]);
  const log = buildProvenanceLog(doc, schema, "P_TEST", "T6");
  assert("three sentences detected", log.sentences.length === 3,
    `got ${log.sentences.length}`);
  assert("first sentence HUMAN", log.sentences[0].ground_truth === "HUMAN");
  assert("second sentence AI", log.sentences[1].ground_truth === "AI");
  assert("third sentence HUMAN", log.sentences[2].ground_truth === "HUMAN");
}

// ---------------------------------------------------------------------------
// Test 7: countTokensBySource accuracy
// ---------------------------------------------------------------------------
console.log("\nTest 7: countTokensBySource");
{
  const doc = makeDoc([
    { text: "abc", ai: true },   // 3 AI chars
    { text: "de", ai: false },   // 2 HUMAN chars
  ]);
  const counts = countTokensBySource(doc, schema);
  assert("ai count = 3", counts.ai === 3, `got ${counts.ai}`);
  assert("human count = 2", counts.human === 2, `got ${counts.human}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(40)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
