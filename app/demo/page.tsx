"use client";

import Link from "next/link";
import { startProductTour } from "@/components/mingxi/ProductDemoTour";
import { TOUR_STEP_COUNT } from "@/lib/mingxi/demo/product-tour-script";
import "@/components/mingxi/product-demo-tour.css";

/**
 * 完整产品 Demo 入口（非精简 HTML）
 * - 全自动演示 + 可交互逐步指引（真手机 + 真网页，含产品逻辑旁白）
 * - /demo/phone · /mingxi/web · /mingxi/phone
 */
export default function DemoHubPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        margin: 0,
        padding: "48px 24px 64px",
        fontFamily:
          '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif',
        color: "#1c1a17",
        background:
          "radial-gradient(ellipse 70% 40% at 15% 0%, rgba(10,143,108,.14), transparent), linear-gradient(165deg,#dfe8e2,#f4f7f5 50%,#d5ddd7)",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div data-tour="hub-hero">
          <p
            style={{
              margin: 0,
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#0a8f6c",
              fontWeight: 600,
            }}
          >
            Mingxi · Full Product Demo
          </p>
          <h1
            style={{
              margin: "10px 0 12px",
              fontFamily: '"Songti SC","STSong",Georgia,serif',
              fontSize: "clamp(1.8rem,4vw,2.4rem)",
              fontWeight: 600,
              lineHeight: 1.25,
            }}
          >
            完整产品 Demo 入口
          </h1>
          <p style={{ margin: "0 0 22px", color: "#6f675c", lineHeight: 1.6, fontSize: "0.95rem" }}>
            这里进入的是<strong>仓库里真实运行的前后端 Demo</strong>（React + API），
            不是精简单页 HTML。两端功能都不做省略。
          </p>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div className="mx-tour-launch-grid" data-tour="hub-tour-launch">
            <button
              type="button"
              className="mx-tour-launch"
              onClick={() => startProductTour(0, "auto")}
            >
              <strong>▶ 全自动演示（推荐先看）</strong>
              <span>
                自动切页、聚光、操作并播放旁白；可暂停、跳过本步或直接跳到任意功能。
              </span>
            </button>
            <button
              type="button"
              className="mx-tour-launch is-guided"
              onClick={() => startProductTour(0, "guided")}
            >
              <strong>☝ 交互式逐步体验</strong>
              <span>
                页面保持可点击，每一步给出操作提示；体验后手动继续，也可随时跳过。
              </span>
            </button>
          </div>

          <p style={{ margin: "-2px 2px 0", color: "#6f675c", fontSize: 12, lineHeight: 1.6 }}>
            共 {TOUR_STEP_COUNT} 步：手机捕获 / 用途扇区 / 语音新建 / 微信 PDF / 网页切片 /
            领域热力与 Icicle / 全屏旭日图 / 待定确认 / 知识补全 / 梳逻辑回忆 / 评测。
          </p>

          <div
            data-tour="hub-principles"
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              background: "rgba(255,252,248,.72)",
              border: "1px solid rgba(40,32,24,.1)",
              fontSize: "0.86rem",
              lineHeight: 1.6,
              color: "#3d3830",
            }}
          >
            <strong style={{ color: "#0a8f6c" }}>产品原则</strong>
            <div style={{ marginTop: 6 }}>
              C1 知识领域 · AI 全自动 · C2 用途 · 人以主（可待定，可回流确认）· 闭环：收下 → 对齐 →
              确认 → 切片 → 梳链
            </div>
          </div>

          <Link
            href="/demo/phone"
            style={{
              display: "block",
              padding: "18px 20px",
              borderRadius: 16,
              background: "#fffcf8",
              border: "1px solid rgba(40,32,24,.12)",
              textDecoration: "none",
              color: "inherit",
              boxShadow: "0 12px 32px rgba(40,32,24,.06)",
            }}
          >
            <strong style={{ display: "block", fontSize: "1.05rem", marginBottom: 6 }}>
              手机 Demo · OPPO 高保真壳
            </strong>
            <span style={{ fontSize: "0.85rem", color: "#6f675c", lineHeight: 1.5 }}>
              桌面 / 小红书 / B站 / 微信 · 悬浮球短按待定 · 长按用途扇区 · 笔记库 · 领域识别
            </span>
          </Link>

          <Link
            href="/mingxi/web"
            style={{
              display: "block",
              padding: "18px 20px",
              borderRadius: 16,
              background: "#fffcf8",
              border: "1px solid rgba(40,32,24,.12)",
              textDecoration: "none",
              color: "inherit",
              boxShadow: "0 12px 32px rgba(40,32,24,.06)",
            }}
          >
            <strong style={{ display: "block", fontSize: "1.05rem", marginBottom: 6 }}>
              网页工作台 · 全功能
            </strong>
            <span style={{ fontSize: "0.85rem", color: "#6f675c", lineHeight: 1.5 }}>
              笔记库 · 用途筛选 · 领域侧栏（热力/Icicle）· 旭日图 · 梳逻辑线回忆 Demo · 捕获抽屉 ·
              待定用途确认 · 评测
            </span>
          </Link>

          <Link
            href="/mingxi/phone"
            style={{
              display: "block",
              padding: "18px 20px",
              borderRadius: 16,
              background: "#fffcf8",
              border: "1px solid rgba(40,32,24,.12)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <strong style={{ display: "block", fontSize: "1.05rem", marginBottom: 6 }}>
              手机端（产品壳 PhoneApp）
            </strong>
            <span style={{ fontSize: "0.85rem", color: "#6f675c", lineHeight: 1.5 }}>
              与网页联动的另一手机入口（用途声明 / 捕获流）
            </span>
          </Link>
        </div>

        <p style={{ margin: "28px 0 0", fontSize: "0.78rem", color: "#6f675c", lineHeight: 1.55 }}>
          本地启动：在项目根目录执行 <code>npm run dev</code>，浏览器打开{" "}
          <code>http://localhost:4317/demo</code>。也可带参数直接开演：自动版
          <code>?autotour=1</code>，交互版 <code>?guidedtour=1</code>。
        </p>
      </div>
    </main>
  );
}
