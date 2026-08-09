/** 确定性哈希：保证节点 ID 稳定，锁定与 diff 才成立 */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const shortHash = (input: string): string => fnv1a(input).toString(36);

/** 内容节点：ID 绑定原料块，跨角度切换保持稳定 */
export const blockNodeId = (blockId: string): string => `n_${blockId}`;

/** 主题节点：ID 绑定主题名 */
export const themeNodeId = (name: string): string => `t_${shortHash(name)}`;

/** 合成节点（外查写回等） */
export const synthNodeId = (text: string): string => `s_${shortHash(text)}`;
