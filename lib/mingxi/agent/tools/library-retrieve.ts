/**
 * library_retrieve：从银标+活知识库召回笔记，写入 AgentContext.materials
 */
import type { ToolSpec } from "../tool-registry.ts";
import {
  libraryNotesToMaterials,
  retrieveMergedNotes,
  type RetrieveFilter,
} from "../../web/retrieve.ts";
import type { LibraryNote } from "../../web/library-data.ts";

export const libraryRetrieveTool: ToolSpec<
  { query: string; limit?: number; filter?: RetrieveFilter },
  { notes: LibraryNote[]; count: number }
> = {
  name: "library_retrieve",
  title: "知识库召回",
  description:
    "按用户一句话从银标库+活知识库加权召回相关笔记，写入当前原料上下文，供 preview_angle / reline 建逻辑链。",
  humanBoundary: "只读召回，不改笔记原文；成链仍需人确认。",
  requiresApproval: false,
  degradation: "无命中时退回少量兜底笔记，并在 summary 标明召回偏弱。",
  provenance: "Live",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "用户意图 / 检索句" },
      limit: { type: "number", description: "最多召回条数，默认 14" },
      filter: {
        type: "string",
        description: "all | negative | positive",
        enum: ["all", "negative", "positive"],
      },
    },
    required: ["query"],
  },
  run(input, ctx) {
    const query = String(input.query || "").trim();
    if (!query) {
      return { ok: false, summary: "缺少检索句", error: "bad_input" };
    }
    const limit = Number(input.limit) > 0 ? Number(input.limit) : 14;
    const filter = (input.filter as RetrieveFilter) || "all";
    const profileHints = (ctx.store?.entries || [])
      .filter((e) => e.status === "active")
      .map((e) => e.statement)
      .filter(Boolean)
      .slice(0, 8);
    const notes = retrieveMergedNotes(query, { limit, filter, profileHints });
    const materials = libraryNotesToMaterials(notes);
    const weak = notes.length < 3;
    return {
      ok: true,
      data: { notes, count: notes.length },
      summary: weak
        ? `召回偏弱：仅 ${notes.length} 条，仍继续解析角度`
        : `已召回 ${notes.length} 条：${notes
            .slice(0, 3)
            .map((n) => n.title)
            .join("、")}${notes.length > 3 ? "…" : ""}`,
      patch: {
        materials: materials.length ? materials : ctx.materials,
      },
      memoryUsed: profileHints.length ? profileHints.slice(0, 3) : undefined,
    };
  },
};
