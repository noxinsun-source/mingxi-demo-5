import type { Metadata } from "next";
import { MingxiEntry } from "@/components/mingxi/MingxiEntry";

export const metadata: Metadata = {
  title: "明晰",
  description:
    "手机上 1 秒存下任何东西并说清是「学」还是「创」；网页上一句话重排逻辑链路。",
};

export default function MingxiPage() {
  return <MingxiEntry />;
}
