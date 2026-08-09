/**
 * 工具注册表
 *
 * 每个 Agent 能力都被包成一个显式声明的工具：
 * 有 schema、有人机边界、有失败降级、有真实性标注（Live / Replay / Fixture / Simulated）。
 * 编排器只能通过注册表调用能力 —— 不允许直接摸引擎。
 */
import type { Line, Material, ProfileStore } from "../types.ts";
import type { Provenance, Trace } from "./trace.ts";

export interface JsonSchemaProp {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaProp>;
  required?: string[];
}

/** 工具运行时能看到的上下文（只读，工具不得直接改） */
export interface AgentContext {
  materials: Material[];
  store: ProfileStore;
  line?: Line;
  now: string;
  trace: Trace;
  /** 局部重生成：只重建该节点子树（产品 UI 传入） */
  scopeNodeId?: string;
}

export interface ToolResult<O = unknown> {
  ok: boolean;
  data?: O;
  /** 给轨迹与界面看的一句话 */
  summary: string;
  error?: string;
  /** 停下来等人确认 */
  needsApproval?: boolean;
  /** 命中的人机边界说明 */
  boundary?: string;
  /** 这一步用到的习得档条目 */
  memoryUsed?: string[];
  /** 对上下文的建议改动，由编排器统一应用 —— 工具本身不写状态 */
  patch?: Partial<Pick<AgentContext, "line" | "store" | "materials">>;
}

export interface ToolSpec<I = Record<string, unknown>, O = unknown> {
  name: string;
  title: string;
  description: string;
  /** 谁说了算 */
  humanBoundary: string;
  /** 是否必须人确认才生效 */
  requiresApproval: boolean;
  /** 失败时怎么降级（写进规格，不是临场发挥） */
  degradation: string;
  provenance: Provenance;
  inputSchema: JsonSchema;
  /** 同步或异步均可；网络工具请返回 Promise，调用方用 executeAsync */
  run(input: I, ctx: AgentContext): ToolResult<O> | Promise<ToolResult<O>>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolSpec>();

  register<I, O>(tool: ToolSpec<I, O>): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具重名：${tool.name}`);
    }
    this.tools.set(tool.name, tool as unknown as ToolSpec);
    return this;
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name);
  }

  list(): ToolSpec[] {
    return Array.from(this.tools.values());
  }

  /** 导出成模型可消费的函数声明（接真实模型时直接用） */
  toFunctionSpecs() {
    return this.list().map((t) => ({
      name: t.name,
      description: `${t.description}\n人机边界：${t.humanBoundary}\n失败降级：${t.degradation}`,
      parameters: t.inputSchema as unknown as Record<string, unknown>,
    }));
  }
}
