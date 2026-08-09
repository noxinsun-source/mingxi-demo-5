import type { Metadata } from "next";
import { PhoneApp } from "@/components/mingxi/PhoneApp";

export const metadata: Metadata = {
  title: "明晰 · 手机端",
};

export default function MingxiPhonePage() {
  return <PhoneApp />;
}
