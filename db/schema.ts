import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const captures = sqliteTable("captures", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceTitle: text("source_title").notNull(),
  sourceUrl: text("source_url"),
  sourceLocator: text("source_locator"),
  originalText: text("original_text").notNull(),
  imageDataUrl: text("image_data_url"),
  ocrText: text("ocr_text"),
  ocrConfidence: integer("ocr_confidence"),
  selectedScope: text("selected_scope").notNull(),
  ...timestamps,
});

export const memoryCards = sqliteTable("memory_cards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  captureId: text("capture_id")
    .notNull()
    .references(() => captures.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  context: text("context").notNull().default(""),
  intent: text("intent").notNull(),
  clarification: text("clarification"),
  clarificationSkipped: integer("clarification_skipped", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  status: text("status").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  confidence: text("confidence").notNull().default("low"),
  validUntil: text("valid_until"),
  frozenAt: text("frozen_at"),
  ...timestamps,
});

export const memoryCardVersions = sqliteTable("memory_card_versions", {
  id: text("id").primaryKey(),
  memoryCardId: text("memory_card_id")
    .notNull()
    .references(() => memoryCards.id),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  context: text("context").notNull().default(""),
  intent: text("intent").notNull(),
  changedBy: text("changed_by").notNull(),
  changeReason: text("change_reason").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  memoryCardId: text("memory_card_id")
    .notNull()
    .references(() => memoryCards.id),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  query: text("query").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  stoppedAt: text("stopped_at"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  agentRunId: text("agent_run_id")
    .notNull()
    .references(() => agentRuns.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  publisher: text("publisher").notNull(),
  summary: text("summary").notNull(),
  stance: text("stance").notNull(),
  relevance: integer("relevance").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  publishedAt: text("published_at"),
});

export const decisionCards = sqliteTable("decision_cards", {
  id: text("id").primaryKey(),
  memoryCardId: text("memory_card_id")
    .notNull()
    .references(() => memoryCards.id),
  agentRunId: text("agent_run_id")
    .notNull()
    .references(() => agentRuns.id),
  recommendation: text("recommendation").notNull(),
  reasoning: text("reasoning").notNull(),
  counterEvidence: text("counter_evidence").notNull(),
  risk: text("risk").notNull(),
  alternative: text("alternative").notNull(),
  experiment: text("experiment").notNull(),
  confidence: integer("confidence").notNull(),
  evidenceIdsJson: text("evidence_ids_json").notNull().default("[]"),
  approvedAt: text("approved_at"),
  rejectedAt: text("rejected_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const actions = sqliteTable("actions", {
  id: text("id").primaryKey(),
  decisionCardId: text("decision_card_id")
    .notNull()
    .references(() => decisionCards.id),
  userId: text("user_id").notNull(),
  description: text("description").notNull(),
  verificationMethod: text("verification_method").notNull(),
  status: text("status").notNull(),
  approvedBy: text("approved_by").notNull(),
  approvedAt: text("approved_at").notNull(),
  dueAt: text("due_at"),
  ...timestamps,
});

export const outcomes = sqliteTable("outcomes", {
  id: text("id").primaryKey(),
  actionId: text("action_id")
    .notNull()
    .references(() => actions.id),
  completed: integer("completed", { mode: "boolean" }).notNull(),
  result: text("result").notNull(),
  usefulness: integer("usefulness").notNull(),
  evidenceUrl: text("evidence_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memoryRevisions = sqliteTable("memory_revisions", {
  id: text("id").primaryKey(),
  memoryCardId: text("memory_card_id")
    .notNull()
    .references(() => memoryCards.id),
  outcomeId: text("outcome_id")
    .notNull()
    .references(() => outcomes.id),
  previousVersion: integer("previous_version").notNull(),
  newVersion: integer("new_version").notNull(),
  previousBody: text("previous_body").notNull(),
  proposedBody: text("proposed_body").notNull(),
  accepted: integer("accepted", { mode: "boolean" }).notNull(),
  confirmedBy: text("confirmed_by").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workflowTransitions = sqliteTable("workflow_transitions", {
  id: text("id").primaryKey(),
  memoryCardId: text("memory_card_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentLogs = sqliteTable("agent_logs", {
  id: text("id").primaryKey(),
  agentRunId: text("agent_run_id")
    .notNull()
    .references(() => agentRuns.id),
  tool: text("tool").notNull(),
  phase: text("phase").notNull(),
  message: text("message").notNull(),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const shares = sqliteTable("shares", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  memoryCardId: text("memory_card_id")
    .notNull()
    .references(() => memoryCards.id),
  tokenHash: text("token_hash").notNull().unique(),
  fieldsJson: text("fields_json").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** Derived ThoughtGraph JSON; layout modes do not create new rows. */
export const thoughtGraphs = sqliteTable("thought_graphs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  caseId: text("case_id").notNull(),
  lensSpecId: text("lens_spec_id").notNull(),
  sourceNoteIdsJson: text("source_note_ids_json").notNull().default("[]"),
  nodesJson: text("nodes_json").notNull(),
  edgesJson: text("edges_json").notNull(),
  depth: integer("depth").notNull().default(3),
  layoutMode: text("layout_mode").notNull().default("tree"),
  currentRevisionId: text("current_revision_id"),
  schemaVersion: text("schema_version").notNull().default("1.0"),
  ...timestamps,
});

export const graphRevisions = sqliteTable("graph_revisions", {
  id: text("id").primaryKey(),
  thoughtGraphId: text("thought_graph_id")
    .notNull()
    .references(() => thoughtGraphs.id),
  parentRevisionId: text("parent_revision_id"),
  lensSpecId: text("lens_spec_id").notNull(),
  reason: text("reason").notNull(),
  impactJson: text("impact_json").notNull(),
  diffSummaryJson: text("diff_summary_json").notNull(),
  status: text("status").notNull(),
  acceptedBy: text("accepted_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  acceptedAt: text("accepted_at"),
});

export const lensSpecs = sqliteTable("lens_specs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  rawInstruction: text("raw_instruction").notNull(),
  organizingPrinciple: text("organizing_principle").notNull(),
  scope: text("scope").notNull().default("corpus"),
  selectedNodeIdsJson: text("selected_node_ids_json").notNull().default("[]"),
  maxDepth: integer("max_depth").notNull().default(5),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/** Versioned, user-approved knowledge maps. Draft exploration stays client-side until frozen. */
export const knowledgeMaps = sqliteTable(
  "knowledge_maps",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    seriesId: text("series_id").notNull().default(""),
    parentVersionId: text("parent_version_id"),
    seedNoteId: text("seed_note_id").notNull(),
    goal: text("goal").notNull(),
    status: text("status").notNull().default("frozen"),
    version: integer("version").notNull().default(1),
    specJson: text("spec_json").notNull(),
    nodesJson: text("nodes_json").notNull(),
    edgesJson: text("edges_json").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    convergence: integer("convergence").notNull().default(0),
    frozenAt: text("frozen_at").notNull(),
    ...timestamps,
  },
  (table) => [
    index("idx_knowledge_maps_user_updated").on(table.userId, table.updatedAt),
    uniqueIndex("uq_knowledge_maps_user_series_version").on(
      table.userId,
      table.seriesId,
      table.version,
    ),
  ],
);

/** Learning evidence is separate from note coverage: saving a note is never treated as mastery. */
export const masteryEvidenceRecords = sqliteTable(
  "mastery_evidence_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    mapId: text("map_id").notNull(),
    conceptId: text("concept_id").notNull(),
    evidenceType: text("evidence_type").notNull(),
    score: integer("score").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_mastery_user_map_concept").on(
      table.userId,
      table.mapId,
      table.conceptId,
    ),
  ],
);

/** User-owned notes that participate in atlas scans and dynamic discovery. */
export const atlasNotes = sqliteTable(
  "atlas_notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull(),
    capturedAt: text("captured_at").notNull(),
    confidence: integer("confidence").notNull().default(72),
    ...timestamps,
  },
  (table) => [
    index("idx_atlas_notes_user_updated").on(table.userId, table.updatedAt),
  ],
);

/** Human review queue for concept names, merges, and rejected candidates. */
export const atlasConceptCorrections = sqliteTable(
  "atlas_concept_corrections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    mapId: text("map_id").notNull(),
    conceptId: text("concept_id").notNull(),
    action: text("action").notNull(),
    proposedValue: text("proposed_value").notNull().default(""),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("pending"),
    ...timestamps,
  },
  (table) => [
    index("idx_atlas_corrections_user_map_concept").on(
      table.userId,
      table.mapId,
      table.conceptId,
    ),
  ],
);
