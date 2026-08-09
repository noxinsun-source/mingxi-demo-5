/**
 * A5 · 外查（P0 走 Replay）
 *
 * 引擎不发起任何网络请求：用录制数据回放「检索 → 证据 → 冲突检出」。
 * 结果一律 status=awaiting_review，**人批准前不得写回**。
 */
import { lookupReplays } from "../../../data/mingxi/replay-lookup.ts";
import type { LookupCard } from "../types.ts";
import { shortHash } from "./hash.ts";
import { checkSafety } from "./safety.ts";

export function runLookup(question: string): LookupCard {
  const q = (question ?? "").trim();
  let best: (typeof lookupReplays)[number] | null = null;
  let bestHits = 0;

  for (const entry of lookupReplays) {
    const hits = entry.matchKeywords.filter((k) => q.includes(k)).length;
    if (hits > bestHits) {
      best = entry;
      bestHits = hits;
    }
  }

  if (!best) {
    return {
      id: `lk_${shortHash(q)}`,
      question: q,
      queries: [],
      findings: [],
      conflicts: [],
      status: "no_result",
      fallbackAdvice: [
        "这条我没查到可靠来源，不替你编。",
        "建议你自己确认两件事：① 这个说法有没有官方或一手出处；② 出处的时间是不是还在有效期内。",
      ],
      mode: "Replay",
    };
  }

  return { id: `lk_${shortHash(q)}`, ...best.card };
}

/** 人审：批准或否决 */
export function reviewLookup(
  card: LookupCard,
  decision: "approve" | "reject",
): LookupCard {
  return {
    ...card,
    status: decision === "approve" ? "approved" : "rejected",
  };
}

/** 写回前的安全检查：未经人批准一律拒绝 */
export function canWriteBack(card: LookupCard): boolean {
  return checkSafety({
    action: "write_back_lookup",
    approvedByHuman: card.status === "approved",
  }).allowed;
}
