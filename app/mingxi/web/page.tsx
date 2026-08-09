import type { Metadata } from "next";
import { headers } from "next/headers";
import MingxiWebClient from "./MingxiWebClient";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:4320";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/mingxi-demo-5-og.png`;
  const title = "明晰 Demo 5.0 · 网页工作台";
  const description = "明晰 AI 智能笔记网页端高保真交互演示：卡片、领域旭日、梳理逻辑线与知识补全。";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "明晰 Demo 5.0 网页工作台" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function MingxiWebPage() {
  return <MingxiWebClient />;
}
