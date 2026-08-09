"use client";

import Link from "next/link";
import { Badge } from "./shared";
import "./mingxi.css";

export function MingxiEntry() {
  return (
    <div className="mx">
      <main className="mx-entry">
        <p style={{ color: "var(--mx-muted)", fontSize: 13, marginBottom: 12 }}>
          OPPO 智能笔记 · 生产力赛道
        </p>
        <h1 className="mx-entry-brand">明晰</h1>
        <p className="mx-entry-lead">
          手机上 1 秒存下任何东西并说清是「学」还是「创」；网页上一句话就能把同一批笔记重新串成你要的那条逻辑链，每个节点都能点回原始出处。
        </p>

        <div className="mx-entry-ports">
          <Link href="/mingxi/phone" className="mx-port mx-glass">
            <h2>手机端</h2>
            <p>收 · 用途条 · 成件卡 · 凭据回点 · 我（习得档）</p>
          </Link>
          <Link href="/mingxi/web" className="mx-port mx-glass">
            <h2>网页端</h2>
            <p>梳链 · 外查 · 决断 · 锁定 · 捕获入库 · 页内评测</p>
          </Link>
          <Link href="/mingxi/annotate" className="mx-port mx-glass">
            <h2>人校工作台</h2>
            <p>点选 C1 / 极性 / stance · 25 条 · 写入仓库回传</p>
          </Link>
          <Link href="/mingxi/lab" className="mx-port mx-glass">
            <h2>Harness 实验室</h2>
            <p>完整工具面板 · 轨迹 · 冻结评测抽屉</p>
          </Link>
          <Link href="/demo/phone" className="mx-port mx-glass">
            <h2>OPPO 仿真壳</h2>
            <p>真实截图 · 小红书图文 / B站视频 · 推入动画</p>
          </Link>
        </div>

        <div className="mx-legend">
          <span>
            <Badge kind="Live" /> 本地引擎真跑
          </span>
          <span>
            <Badge kind="Replay" /> 外查录制回放
          </span>
          <span>
            <Badge kind="Fixture" /> 预置版面块
          </span>
          <span>
            <Badge kind="模拟" /> 悬浮球入口
          </span>
        </div>
      </main>
    </div>
  );
}
