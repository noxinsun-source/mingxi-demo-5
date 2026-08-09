/**
 * 视频 → 分镜关键帧（图片）
 *
 * 依赖本机 ffmpeg。场景阈值可用 VIDEO_SCENE_THRESHOLD（默认 0.35）。
 * 无 ffmpeg / 非视频文件时诚实返回 warnings，不假装抽帧。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { ImageUnit } from "./types.ts";

function which(bin: string): string | null {
  try {
    return execFileSync("which", [bin], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

export interface SceneSplitResult {
  images: ImageUnit[];
  warnings: string[];
  pipelineNote: string;
}

/**
 * 按场景变化抽关键帧到 outDir。
 * 返回 ImageUnit[]（role=video_keyframe）。
 */
export function splitVideoScenes(
  videoPath: string,
  outDir: string,
  opt: { threshold?: number; maxFrames?: number } = {},
): SceneSplitResult {
  const warnings: string[] = [];
  if (!existsSync(videoPath)) {
    return {
      images: [],
      warnings: [`视频不存在：${videoPath}`],
      pipelineNote: "video_scene_split:skipped_missing",
    };
  }
  const ffmpeg = which("ffmpeg");
  if (!ffmpeg) {
    return {
      images: [],
      warnings: ["未安装 ffmpeg，无法分镜抽帧"],
      pipelineNote: "video_scene_split:skipped_no_ffmpeg",
    };
  }

  const threshold = opt.threshold ?? Number(process.env.VIDEO_SCENE_THRESHOLD ?? 0.35);
  const maxFrames = opt.maxFrames ?? 24;
  mkdirSync(outDir, { recursive: true });
  const pattern = resolve(outDir, "scene_%03d.jpg");

  try {
    // select=gt(scene,T) 在镜头切换处出帧；fps 上限防爆炸
    execFileSync(
      ffmpeg,
      [
        "-y",
        "-i",
        videoPath,
        "-vf",
        `select='gt(scene\\,${threshold})',scale=960:-2`,
        "-vsync",
        "vfr",
        "-frames:v",
        String(maxFrames),
        pattern,
      ],
      { stdio: "ignore", timeout: 120_000 },
    );
  } catch {
    // 短视频可能几乎无场景切换 —— 退化为均匀抽 1 帧封面
    warnings.push("场景检测无输出，退化为封面帧");
    try {
      const cover = resolve(outDir, "scene_001.jpg");
      execFileSync(
        ffmpeg,
        ["-y", "-i", videoPath, "-ss", "1", "-vframes", "1", "-q:v", "3", cover],
        { stdio: "ignore", timeout: 60_000 },
      );
    } catch (err) {
      return {
        images: [],
        warnings: [...warnings, `抽帧失败：${(err as Error).message}`],
        pipelineNote: "video_scene_split:failed",
      };
    }
  }

  const files = readdirSync(outDir)
    .filter((f) => /^scene_\d+\.jpe?g$/i.test(f))
    .sort()
    .slice(0, maxFrames);

  if (!files.length) {
    return {
      images: [],
      warnings: [...warnings, "未生成任何关键帧"],
      pipelineNote: "video_scene_split:empty",
    };
  }

  const stem = basename(videoPath).replace(/\W+/g, "_").slice(0, 24);
  const images: ImageUnit[] = files.map((f, i) => ({
    id: `kf_${stem}_${i + 1}`,
    role: "video_keyframe" as const,
    uri: resolve(outDir, f),
    mime: "image/jpeg",
    sceneIndex: i + 1,
    caption: `分镜 ${i + 1}`,
  }));

  return {
    images,
    warnings,
    pipelineNote: `video_scene_split:${images.length}_frames`,
  };
}
