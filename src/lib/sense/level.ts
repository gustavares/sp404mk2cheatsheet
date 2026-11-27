/**
 * Small, testable pieces of the audio check. The analyser itself lives in the store.
 * A tempo hint is returned only when recent onsets agree; otherwise it stays quiet.
 */

export interface LevelSample {
	at: number;
	rms: number;
}

/** True once the signal has stayed clearly above the step's baseline for sustainMs. */
export function sustainedAbove(
	samples: LevelSample[],
	baseline: number,
	sustainMs: number,
	now: number
): boolean {
	const floor = Math.max(0.06, baseline + 0.05);
	const needed = Math.max(280, sustainMs);
	const window = samples.filter((sample) => now - sample.at <= needed && sample.at <= now);
	if (window.length < 3) return false;
	const span = window[window.length - 1].at - window[0].at;
	if (span < needed * 0.85) return false;
	return window.every((sample) => sample.rms >= floor);
}

/**
 * BPM from onset times. Returns null unless at least five onsets sit in a steady
 * 70–180 range. A wobbly loop stays quiet rather than showing a wrong number.
 */
export function tempoHint(onsetTimes: number[]): number | null {
	if (onsetTimes.length < 6) return null;
	const recent = onsetTimes.slice(-8);
	const intervals: number[] = [];
	for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1]);
	if (intervals.some((interval) => interval < 330 || interval > 860)) return null;
	const mean = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
	const variance =
		intervals.reduce((sum, interval) => sum + (interval - mean) ** 2, 0) / intervals.length;
	const cv = Math.sqrt(variance) / mean;
	if (cv > 0.08) return null;
	return Math.round(60000 / mean);
}
