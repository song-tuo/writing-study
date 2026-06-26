import { Schema } from "prosemirror-model";
import { nodes as basicNodes } from "prosemirror-schema-basic";
import { provenanceMarkSpec } from "./provenance.js";

export const schema = new Schema({
  nodes: {
    doc: basicNodes.doc,
    paragraph: basicNodes.paragraph,
    text: basicNodes.text,
  },
  marks: {
    provenance: provenanceMarkSpec,
  },
});
