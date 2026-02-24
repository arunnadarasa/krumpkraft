/**
 * Simple in-place "dance" routine for Mineflayer bots: arm swings and jumps
 * to suggest Krump-style movement (stomps/jabs/chest pop vibe).
 */

import type { Bot } from 'mineflayer';

const ARM_INTERVAL_MS = 1200;
const JUMP_INTERVAL_MS = 1500;
const JUMP_DURATION_MS = 200;

/**
 * Run a short dance routine for the bot: periodically swingArm and jump.
 * Stops after durationMs. Safe to call while bot is pathfinding (we only swing/jump).
 */
export function runDanceRoutine(bot: Bot, durationMs: number = 12_000): void {
  const armTimer = setInterval(() => {
    try {
      bot.swingArm('right');
    } catch {
      // ignore if bot disconnected
    }
  }, ARM_INTERVAL_MS);

  const jumpTimer = setInterval(() => {
    try {
      bot.setControlState('jump', true);
      setTimeout(() => {
        try {
          bot.setControlState('jump', false);
        } catch {
          // ignore
        }
      }, JUMP_DURATION_MS);
    } catch {
      // ignore
    }
  }, JUMP_INTERVAL_MS);

  setTimeout(() => {
    clearInterval(armTimer);
    clearInterval(jumpTimer);
    try {
      bot.setControlState('jump', false);
    } catch {
      // ignore
    }
  }, durationMs);
}
