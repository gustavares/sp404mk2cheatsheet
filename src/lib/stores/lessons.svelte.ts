import type { Lesson } from '#lib/lessons/types.js';

const STORAGE_KEY = 'sp404mk2-lesson-progress-v1';
const isBrowser = typeof window !== 'undefined';

interface PersistedLessons {
	doneByLesson: Record<string, string[]>;
	stepByLesson: Record<string, number>;
	openLessonId: string | null;
}

function emptyState(): PersistedLessons {
	return { doneByLesson: {}, stepByLesson: {}, openLessonId: null };
}

function load(): PersistedLessons {
	if (!isBrowser) return emptyState();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return emptyState();
		const parsed = JSON.parse(raw) as Partial<PersistedLessons>;
		return {
			doneByLesson:
				parsed.doneByLesson && typeof parsed.doneByLesson === 'object' ? parsed.doneByLesson : {},
			stepByLesson:
				parsed.stepByLesson && typeof parsed.stepByLesson === 'object' ? parsed.stepByLesson : {},
			openLessonId: null
		};
	} catch {
		return emptyState();
	}
}

class LessonProgressStore {
	doneByLesson = $state<Record<string, string[]>>({});
	stepByLesson = $state<Record<string, number>>({});
	openLessonId = $state<string | null>(null);
	private hydrated = false;

	/** Load after mount so prerendered HTML matches the first client render. */
	init() {
		if (!isBrowser || this.hydrated) return;
		this.hydrated = true;
		const saved = load();
		this.doneByLesson = saved.doneByLesson;
		this.stepByLesson = saved.stepByLesson;
	}

	private save() {
		if (!isBrowser) return;
		try {
			const payload: PersistedLessons = {
				doneByLesson: this.doneByLesson,
				stepByLesson: this.stepByLesson,
				openLessonId: this.openLessonId
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
		} catch {
			// Ignore storage write errors (private mode, full disk).
		}
	}

	doneIds(lessonId: string): string[] {
		return this.doneByLesson[lessonId] ?? [];
	}

	isStepDone(lessonId: string, stepId: string): boolean {
		return this.doneIds(lessonId).includes(stepId);
	}

	doneCount(lesson: Lesson): number {
		const done = new Set(this.doneIds(lesson.id));
		return lesson.steps.filter((step) => done.has(step.id)).length;
	}

	isLessonComplete(lesson: Lesson): boolean {
		return lesson.steps.length > 0 && this.doneCount(lesson) === lesson.steps.length;
	}

	completedLessonCount(lessons: Lesson[]): number {
		return lessons.filter((lesson) => this.isLessonComplete(lesson)).length;
	}

	resumeIndex(lesson: Lesson): number {
		if (this.isLessonComplete(lesson)) return 0;
		const saved = this.stepByLesson[lesson.id] ?? 0;
		if (!Number.isFinite(saved) || saved < 0) return 0;
		return Math.min(saved, lesson.steps.length - 1);
	}

	open(lessonId: string) {
		this.openLessonId = lessonId;
		this.save();
	}

	close() {
		this.openLessonId = null;
		this.save();
	}

	setStep(lessonId: string, index: number) {
		this.stepByLesson = { ...this.stepByLesson, [lessonId]: index };
		this.save();
	}

	markDone(lessonId: string, stepId: string) {
		const prev = this.doneIds(lessonId);
		if (prev.includes(stepId)) return;
		this.doneByLesson = { ...this.doneByLesson, [lessonId]: [...prev, stepId] };
		this.save();
	}

	resetLesson(lessonId: string) {
		const doneByLesson = { ...this.doneByLesson };
		const stepByLesson = { ...this.stepByLesson };
		delete doneByLesson[lessonId];
		delete stepByLesson[lessonId];
		this.doneByLesson = doneByLesson;
		this.stepByLesson = stepByLesson;
		this.save();
	}

	resetAll() {
		this.doneByLesson = {};
		this.stepByLesson = {};
		this.openLessonId = null;
		this.save();
	}
}

export const lessonProgress = new LessonProgressStore();
