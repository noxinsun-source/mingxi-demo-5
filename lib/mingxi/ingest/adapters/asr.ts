/**
 * 音视频 → 转写文本（可插拔 ASR）
 *
 * 本机现状：有 ffmpeg + yt-dlp，无 whisper CLI。
 * 适配器优先级：
 *   1. OPENAI_API_KEY → OpenAI Whisper API（成熟、易接）
 *   2. ASR_LOCAL_CMD  → 自定义命令（如 whisper.cpp / FunASR）
 *   3. 否则诚实失败，返回可配置提示（不假装转写出内容）
 *
 * DeepSeek 聊天 API 不做 ASR，不要把音频塞进 chat/completions。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chunkText } from "../chunk.ts";
import type { IngestArtifact, IngestSource } from "../types.ts";
import { loadMingxiEnv } from "../../llm/env.ts";

function which(bin: string): string | null {
  try {
    return execFileSync("which", [bin], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

/** 视频/远程链接先抽音频到 wav */
function extractAudioWav(input: string): string {
  const ffmpeg = which("ffmpeg");
  if (!ffmpeg) throw new Error("需要 ffmpeg 才能从视频抽音轨");
  const out = resolve(tmpdir(), `mingxi_asr_${Date.now()}.wav`);
  execFileSync(
    ffmpeg,
    ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", out],
    { stdio: "ignore" },
  );
  return out;
}

async function openaiWhisper(filePath: string): Promise<string> {
  loadMingxiEnv();
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.ASR_API_KEY;
  const base = (process.env.ASR_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.ASR_MODEL ?? "whisper-1";
  if (!apiKey) {
    throw new Error("未配置 OPENAI_API_KEY 或 ASR_API_KEY，无法调用 Whisper API");
  }

  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([buf]), basename(filePath));
  form.append("response_format", "text");

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ASR HTTP ${res.status}: ${text.slice(0, 240)}`);
  return text.trim();
}

function localAsrCmd(filePath: string): string {
  const tmpl = process.env.ASR_LOCAL_CMD;
  if (!tmpl) throw new Error("未配置 ASR_LOCAL_CMD");
  // 例：whisper "{input}" --language zh --output_format txt
  const cmd = tmpl.replaceAll("{input}", filePath);
  return execFileSync("bash", ["-lc", cmd], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

export async function ingestMedia(
  source: IngestSource,
  opt: { snapshotDir?: string } = {},
): Promise<IngestArtifact> {
  loadMingxiEnv();
  let mediaPath = source.uri;
  const warnings: string[] = [];
  const kind = source.kind ?? (/\.(mp3|wav|m4a)$/i.test(mediaPath) ? "audio" : "video");

  // 远程视频：yt-dlp 拉音频
  if (/^https?:\/\//i.test(mediaPath)) {
    const ytdlp = which("yt-dlp");
    if (!ytdlp) throw new Error("远程视频需要 yt-dlp");
    const outTpl = resolve(tmpdir(), `mingxi_vid_${Date.now()}.%(ext)s`);
    execFileSync(
      ytdlp,
      ["-x", "--audio-format", "wav", "-o", outTpl, mediaPath],
      { stdio: "ignore", timeout: 300_000 },
    );
    // yt-dlp 会写成 .wav
    mediaPath = outTpl.replace("%(ext)s", "wav");
    if (!existsSync(mediaPath)) {
      throw new Error("yt-dlp 未能产出 wav，请检查链接是否可访问");
    }
    warnings.push("远程媒体已用 yt-dlp 抽取音轨");
  } else if (kind === "video") {
    mediaPath = extractAudioWav(mediaPath);
    warnings.push("本地视频已用 ffmpeg 抽取音轨");
  }

  if (!existsSync(mediaPath)) throw new Error(`音视频文件不存在：${mediaPath}`);

  let transcript = "";
  let provider = "none";
  try {
    if (process.env.ASR_LOCAL_CMD) {
      transcript = localAsrCmd(mediaPath);
      provider = "local-cmd";
    } else {
      transcript = await openaiWhisper(mediaPath);
      provider = "openai-whisper";
    }
  } catch (err) {
    const tip = (err as Error).message;
    return {
      id: `asr_fail_${Date.now().toString(36)}`,
      kind,
      title: source.titleHint ?? basename(source.uri),
      sourceUri: source.uri,
      provider: "asr-unavailable",
      capturedAt: new Date().toISOString(),
      fullText: "",
      blocks: [],
      warnings: [
        `语音转写失败：${tip}`,
        "可选方案：① 配置 OPENAI_API_KEY 用 Whisper API；② 安装 whisper 后设 ASR_LOCAL_CMD；③ 国内可用 FunASR / 硅基流动 Whisper 兼容接口（ASR_BASE_URL）。",
        "DeepSeek 聊天 API 不支持 ASR，请勿把音频发给 deepseek-chat。",
      ],
      meta: {},
    };
  }

  const id = `asr_${basename(source.uri).replace(/\W+/g, "_").slice(0, 40)}_${Date.now().toString(36)}`;
  const capturedAt = new Date().toISOString();
  const dir = resolve(opt.snapshotDir ?? "data/mingxi/snapshots");
  mkdirSync(dir, { recursive: true });
  const snapshotPath = resolve(dir, `${id}.txt`);
  writeFileSync(snapshotPath, transcript, "utf8");

  return {
    id,
    kind,
    title: source.titleHint ?? basename(source.uri),
    sourceUri: source.uri,
    provider,
    capturedAt,
    fullText: transcript,
    snapshotPath,
    blocks: chunkText(transcript, { kind: kind === "video" ? "字幕" : "口述", maxLen: 220 }),
    warnings,
  };
}
