/**
 * GET  /api/mingxi/think/memory — 读取梳链工作区记忆
 * PUT  /api/mingxi/think/memory — 写入/合并一个工作区快照
 * DELETE — 清空或删单个 workspace
 */
import { NextResponse } from "next/server";
import {
  loadThinkMemory,
  saveThinkMemory,
  upsertWorkspaceMemory,
  workspaceHasRememberedRun,
  type ThinkWorkspaceSnapshot,
  emptyThinkMemory,
} from "@/lib/mingxi/web/think-memory";
import { appendSignals } from "@/lib/mingxi/web/profile-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const pack = loadThinkMemory();
  if (id) {
    const one = pack.workspaces.find((w) => w.id === id) || null;
    return NextResponse.json({
      ok: true,
      workspace: one,
      remembered: one ? workspaceHasRememberedRun(one) : false,
    });
  }
  return NextResponse.json({
    ok: true,
    ...pack,
    count: pack.workspaces.length,
    rememberedIds: pack.workspaces
      .filter(workspaceHasRememberedRun)
      .map((w) => w.id),
  });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      workspace?: ThinkWorkspaceSnapshot;
      activeWsId?: string;
      interaction?: {
        kind: "think_run" | "approve" | "reject" | "switch_ws" | "web_search";
        workspaceId: string;
        utterance?: string;
        detail: string;
      };
      pack?: {
        activeWsId?: string;
        workspaces: ThinkWorkspaceSnapshot[];
      };
    };

    // 全量同步（前端 localStorage 合并后回写）
    if (body.pack?.workspaces) {
      const prev = loadThinkMemory();
      const saved = saveThinkMemory({
        ...prev,
        activeWsId: body.pack.activeWsId ?? body.activeWsId ?? prev.activeWsId,
        workspaces: body.pack.workspaces,
      });
      return NextResponse.json({ ok: true, ...saved });
    }

    if (!body.workspace?.id) {
      return NextResponse.json({ error: "workspace required" }, { status: 400 });
    }

    const interaction = body.interaction
      ? {
          id: `ix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          at: new Date().toISOString(),
          ...body.interaction,
        }
      : undefined;

    const saved = upsertWorkspaceMemory(body.workspace, {
      activeWsId: body.activeWsId,
      interaction,
    });

    // 同步一条交互信号进习得档（用户逻辑行为记忆）
    if (interaction) {
      try {
        appendSignals([
          {
            kind: "dialog_pref",
            key: `think_${interaction.kind}`,
            detail: interaction.detail.slice(0, 200),
            at: interaction.at,
            weight: interaction.kind === "approve" ? 1.5 : 1,
          },
        ]);
      } catch {
        /* profile 失败不影响记忆主路径 */
      }
    }

    return NextResponse.json({
      ok: true,
      workspace: saved.workspaces.find((w) => w.id === body.workspace!.id),
      rememberedIds: saved.workspaces
        .filter(workspaceHasRememberedRun)
        .map((w) => w.id),
      updatedAt: saved.updatedAt,
    });
  } catch (e) {
    // vinext / Workers 沙箱常禁止写本地 data/；前端已有 localStorage 回放，这里降级为软失败
    const msg = e instanceof Error ? e.message : String(e);
    const sandbox =
      /not permitted|EROFS|EACCES|readonly|Read-only/i.test(msg);
    return NextResponse.json(
      {
        ok: false,
        softFail: true,
        sandbox,
        error: msg,
        hint: sandbox
          ? "服务端无法写盘，已依赖浏览器 localStorage 记忆；本地用 node 脚本可预置 think-memory.json"
          : msg,
      },
      { status: sandbox ? 200 : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const pack = loadThinkMemory();
  if (!id || id === "all") {
    const cleared = saveThinkMemory(emptyThinkMemory());
    return NextResponse.json({ ok: true, cleared: true, ...cleared });
  }
  const saved = saveThinkMemory({
    ...pack,
    workspaces: pack.workspaces.filter((w) => w.id !== id),
  });
  return NextResponse.json({ ok: true, ...saved });
}
