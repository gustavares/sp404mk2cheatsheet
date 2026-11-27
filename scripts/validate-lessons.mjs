/**
 * Checks src/lib/data/lessons.json:
 * - unique lesson and step ids
 * - highlight ids are real faceplate controls
 * - every step cites a verbatim quote on the named manual page
 *   (or, when page is omitted, anywhere in a firmware-notes file)
 */

import fs from 'node:fs';
import path from 'node:path';

const LESSONS_PATH = path.resolve('src/lib/data/lessons.json');

const VALID_BUTTON_IDS = new Set([
	'VOLUME',
	'CTRL 1',
	'CTRL 2',
	'CTRL 3',
	'FILTER+DRIVE',
	'RESONATOR',
	'DELAY',
	'ISOLATOR',
	'DJFX LOOPER',
	'MFX',
	'PATTERN SELECT',
	'PATTERN EDIT',
	'RECORD SETTING',
	'START/END',
	'PITCH/SPEED',
	'MARK',
	'VALUE',
	'DEL',
	'REC',
	'RESAMPLE',
	'BPM SYNC',
	'GATE',
	'LOOP',
	'REVERSE',
	'ROLL',
	'EXIT',
	'COPY',
	'REMAIN',
	'BANK',
	'BANK A/F',
	'BANK B/G',
	'BANK C/H',
	'BANK D/I',
	'BANK E/J',
	'SHIFT',
	'PAD',
	...Array.from({ length: 16 }, (_, i) => `PAD ${i + 1}`),
	'BUS FX',
	'HOLD',
	'EXT SOURCE',
	'SUB PAD'
]);

function normalizeWhitespace(str) {
	return str.replace(/\s+/g, ' ').trim();
}

const docCache = new Map();

function readDoc(docRelPath) {
	if (!docCache.has(docRelPath)) {
		const absPath = path.resolve(docRelPath);
		docCache.set(docRelPath, fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null);
	}
	return docCache.get(docRelPath);
}

function getPageText(docRelPath, pageNum) {
	const content = readDoc(docRelPath);
	if (!content) return null;
	const marker = `<!-- [Page ${pageNum}] -->`;
	const startIdx = content.indexOf(marker);
	if (startIdx === -1) return null;
	const nextMarkerIdx = content.indexOf('<!-- [Page ', startIdx + marker.length);
	const slice =
		nextMarkerIdx === -1 ? content.slice(startIdx) : content.slice(startIdx, nextMarkerIdx);
	return normalizeWhitespace(slice);
}

if (!fs.existsSync(LESSONS_PATH)) {
	console.error('❌ lessons.json not found at src/lib/data/lessons.json.');
	process.exit(1);
}

const lessons = JSON.parse(fs.readFileSync(LESSONS_PATH, 'utf8'));
const errors = [];

if (!Array.isArray(lessons) || lessons.length < 8) {
	errors.push('lessons.json must contain at least 8 lessons.');
}

const lessonIds = new Set();

for (const [lessonIndex, lesson] of lessons.entries()) {
	const prefix = `Lesson #${lessonIndex + 1} (${lesson?.id ?? 'missing-id'})`;

	if (typeof lesson.id !== 'string' || !/^[a-z0-9-]+$/.test(lesson.id)) {
		errors.push(`${prefix}: "id" must be kebab-case.`);
	} else if (lessonIds.has(lesson.id)) {
		errors.push(`${prefix}: duplicate lesson id.`);
	} else {
		lessonIds.add(lesson.id);
	}

	for (const field of ['title', 'blurb', 'bring']) {
		if (typeof lesson[field] !== 'string' || lesson[field].trim().length < 8) {
			errors.push(`${prefix}: "${field}" must be a string of at least 8 characters.`);
		}
	}

	if (!Array.isArray(lesson.steps) || lesson.steps.length < 3) {
		errors.push(`${prefix}: needs at least 3 steps.`);
		continue;
	}

	const stepIds = new Set();
	for (const [stepIndex, step] of lesson.steps.entries()) {
		const stepPrefix = `${prefix} step #${stepIndex + 1} (${step?.id ?? 'missing-id'})`;

		if (typeof step.id !== 'string' || !/^[a-z0-9-]+$/.test(step.id)) {
			errors.push(`${stepPrefix}: "id" must be kebab-case.`);
		} else if (stepIds.has(step.id)) {
			errors.push(`${stepPrefix}: duplicate step id.`);
		} else {
			stepIds.add(step.id);
		}

		for (const field of ['title', 'action', 'listen', 'screen']) {
			if (typeof step[field] !== 'string' || step[field].trim().length < 3) {
				errors.push(`${stepPrefix}: "${field}" is missing or too short.`);
			}
		}

		const midiTypes = new Set([
			'any-pad',
			'pad',
			'note',
			'knob',
			'dj-play',
			'dj-sync',
			'dj-cue',
			'dj-xfade'
		]);
		if (step.sense === 'manual') {
			if (step.listenFor) errors.push(`${stepPrefix}: manual steps do not take listenFor.`);
		} else if (step.sense === 'midi') {
			if (!step.listenFor || !midiTypes.has(step.listenFor.type)) {
				errors.push(`${stepPrefix}: midi steps need a listenFor type the chart can match.`);
			}
			if (step.listenFor?.type === 'pad' && (step.listenFor.pad < 1 || step.listenFor.pad > 16)) {
				errors.push(`${stepPrefix}: pad listenFor must be 1–16.`);
			}
			if (
				step.listenFor?.type === 'dj-play' &&
				step.listenFor.channel !== 1 &&
				step.listenFor.channel !== 2
			) {
				errors.push(`${stepPrefix}: dj-play channel must be 1 or 2.`);
			}
		} else if (step.sense === 'audio') {
			if (!step.listenFor || step.listenFor.type !== 'sound') {
				errors.push(`${stepPrefix}: audio steps need listenFor type "sound".`);
			}
		} else {
			errors.push(`${stepPrefix}: "sense" must be midi, audio, or manual.`);
		}

		if (!Array.isArray(step.highlight) || step.highlight.length === 0) {
			errors.push(`${stepPrefix}: "highlight" must list at least one control.`);
		} else {
			for (const id of step.highlight) {
				if (!VALID_BUTTON_IDS.has(id)) {
					errors.push(`${stepPrefix}: unknown highlight id "${id}".`);
				}
			}
		}

		if (step.unverified !== undefined) {
			if (!Array.isArray(step.unverified) || step.unverified.length === 0) {
				errors.push(`${stepPrefix}: "unverified" must be a non-empty string array when present.`);
			} else {
				for (const note of step.unverified) {
					if (typeof note !== 'string' || note.trim().length < 12) {
						errors.push(`${stepPrefix}: each unverified note must be a sentence.`);
					}
				}
			}
		}

		if (
			step.offPanel !== undefined &&
			(typeof step.offPanel !== 'string' || step.offPanel.length < 8)
		) {
			errors.push(`${stepPrefix}: "offPanel" must be a sentence when present.`);
		}

		if (!Array.isArray(step.citations) || step.citations.length === 0) {
			errors.push(`${stepPrefix}: needs at least one citation.`);
			continue;
		}

		for (const citation of step.citations) {
			if (typeof citation?.doc !== 'string' || !citation.doc.startsWith('docs/reference/')) {
				errors.push(`${stepPrefix}: citation doc must live under docs/reference/.`);
				continue;
			}
			if (typeof citation.quote !== 'string' || citation.quote.trim().length < 12) {
				errors.push(`${stepPrefix}: citation quote must be at least 12 characters.`);
				continue;
			}
			const content = readDoc(citation.doc);
			if (!content) {
				errors.push(`${stepPrefix}: missing document ${citation.doc}.`);
				continue;
			}
			const quote = normalizeWhitespace(citation.quote);
			if (citation.page === undefined) {
				if (!normalizeWhitespace(content).includes(quote)) {
					errors.push(
						`${stepPrefix}: quote not found in ${citation.doc}: "${citation.quote.slice(0, 80)}"`
					);
				}
			} else {
				const pageText = getPageText(citation.doc, citation.page);
				if (!pageText) {
					errors.push(`${stepPrefix}: page ${citation.page} not found in ${citation.doc}.`);
				} else if (!pageText.includes(quote)) {
					errors.push(
						`${stepPrefix}: quote not on page ${citation.page} of ${citation.doc}: "${citation.quote.slice(0, 80)}"`
					);
				}
			}
		}
	}
}

if (errors.length > 0) {
	console.error(`❌ Lesson validation failed with ${errors.length} error(s):\n`);
	for (const error of errors) console.error(`  - ${error}`);
	process.exit(1);
}

const stepCount = lessons.reduce((sum, lesson) => sum + lesson.steps.length, 0);
console.log(`✅ ${lessons.length} lessons, ${stepCount} steps, citations checked.`);
