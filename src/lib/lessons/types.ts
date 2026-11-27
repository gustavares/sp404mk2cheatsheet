/**
 * Lesson data contract. Add a lesson by appending an object to
 * `src/lib/data/lessons.json`. `scripts/validate-lessons.mjs` checks button
 * ids, the sense of each step, and verbatim manual quotes on `npm run check`.
 */
import type { ListenFor } from '#lib/sense/decode.js';

/** How a step can notice that it happened. Manual steps always use Done / Next. */
export type LessonSense = 'midi' | 'audio' | 'manual';

export type LessonTrack = 'normal' | 'dj';

/** Core lessons are the short path. Side lessons branch off a core lesson and never gate it. */
export type LessonRole = 'core' | 'side';

export interface LessonCitation {
	/** Path under docs/reference/. Manual chapters use a page anchor; firmware notes may omit page. */
	doc: string;
	page?: number;
	/** Verbatim substring of that document (whitespace is collapsed when checking). */
	quote: string;
}

export interface LessonStep {
	id: string;
	title: string;
	/** What to press, turn, or plug in. */
	action: string;
	/** What to listen for. */
	listen: string;
	note?: string;
	/** Faceplate control ids. The first id is scrolled into view. */
	highlight: string[];
	/** Short line for the round screen on the drawing. */
	screen: string;
	showShiftLabels?: boolean;
	showDjLabels?: boolean;
	/** Something on the real SP that this drawing does not include. */
	offPanel?: string;
	/** Claims we could not confirm in the v5.50 manual or the firmware notes. */
	unverified?: string[];
	/**
	 * midi: a documented message can complete the step.
	 * audio: sustained input level can complete it.
	 * manual: the control does not report itself; Done / Next is the way through.
	 */
	sense: LessonSense;
	/** Required for midi and audio. Omitted for manual. */
	listenFor?: ListenFor;
	citations: LessonCitation[];
}

export interface Lesson {
	id: string;
	title: string;
	blurb: string;
	/** What to have within reach. */
	bring: string;
	/** Which path or paths show this lesson. */
	tracks: LessonTrack[];
	role: LessonRole;
	/** Manual chapter name, used to browse side lessons. */
	chapter: string;
	/** Order of a core lesson inside a track. Sides use it only for sorting under a parent. */
	order: number;
	/** Set on side lessons. The core lesson this branch hangs from. */
	parentId?: string;
	steps: LessonStep[];
}
