import rawLessons from '#lib/data/lessons.json';
import moreLessons from '#lib/data/more-lessons.json';
import type { Lesson, LessonTrack } from '#lib/lessons/types.js';

export const lessons = [...(rawLessons as Lesson[]), ...(moreLessons as Lesson[])];

export const CHAPTER_ORDER = [
	'Panel',
	'Playback',
	'Sampling',
	'Sample edit',
	'Patterns',
	'Tempo',
	'Effects',
	'Inputs & projects',
	'Utility & SD',
	'DJ mode'
];

export function lessonsIn(track: LessonTrack): Lesson[] {
	return lessons.filter((lesson) => lesson.tracks.includes(track));
}
