import { verifyYouTubeStream } from '../services/youtubeService.ts';
import type { YouTubeStreamVerification } from '../services/youtubeService.ts';

export type YouTubeVerificationResult = YouTubeStreamVerification;

export async function verifyYouTubeVideoAvailability(
  rawInput: string
): Promise<YouTubeVerificationResult> {
  return verifyYouTubeStream(rawInput);
}
