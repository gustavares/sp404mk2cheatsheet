<script lang="ts">
	import { untrack } from 'svelte';
	import { CHAPTER_ORDER, lessons, lessonsIn } from '#lib/lessons/catalog.js';
	import type { Lesson, LessonCitation, LessonTrack } from '#lib/lessons/types.js';
	import { matchesListen } from '#lib/sense/decode.js';
	import { lessonProgress } from '#lib/stores/lessons.svelte.js';
	import { midiStore } from '#lib/stores/midi.svelte.js';
	import { audioStore } from '#lib/stores/audio.svelte.js';
	import Faceplate from '#lib/components/Faceplate.svelte';
	import LessonLink from '#lib/components/LessonLink.svelte';
	import {
		BookOpen,
		Check,
		ChevronLeft,
		ChevronRight,
		Headphones,
		Info,
		RotateCcw
	} from '@lucide/svelte';

	let track = $state<LessonTrack>('normal');
	let stepIndex = $state(0);
	let phase = $state<'step' | 'finished'>('step');
	let syncedLessonId = $state<string | null>(null);
	let openedAt = $state(0);
	let heard = $state('');
	let audioMark = 0;
	let advanceTimer: ReturnType<typeof setTimeout> | null = null;

	const liveButtons = $derived(Object.keys(midiStore.flashing));
	const trackLessons = $derived(lessonsIn(track));
	const coreLessons = $derived(
		trackLessons.filter((lesson) => lesson.role === 'core').sort((a, b) => a.order - b.order)
	);
	const sideLessons = $derived(trackLessons.filter((lesson) => lesson.role === 'side'));
	const coreDone = $derived(
		coreLessons.filter((lesson) => lessonProgress.isLessonComplete(lesson)).length
	);
	const sideDone = $derived(
		sideLessons.filter((lesson) => lessonProgress.isLessonComplete(lesson)).length
	);
	const chapterGroups = $derived(
		CHAPTER_ORDER.map((chapter) => ({
			chapter,
			items: trackLessons
				.filter((lesson) => lesson.chapter === chapter)
				.sort((a, b) => a.order - b.order)
		})).filter((group) => group.items.length > 0)
	);

	const openLesson = $derived(
		lessons.find((lesson) => lesson.id === lessonProgress.openLessonId) ?? null
	);
	const step = $derived(openLesson && phase === 'step' ? openLesson.steps[stepIndex] : null);
	const doneCount = $derived(lessonProgress.completedLessonCount(lessons));

	$effect(() => {
		const lesson = openLesson;
		if (!lesson) {
			syncedLessonId = null;
			return;
		}
		if (syncedLessonId === lesson.id) return;
		stepIndex = lessonProgress.resumeIndex(lesson);
		phase = 'step';
		syncedLessonId = lesson.id;
	});

	function openLessonAt(lesson: Lesson, fromTrack: LessonTrack = track) {
		track = fromTrack;
		stepIndex = lessonProgress.resumeIndex(lesson);
		phase = 'step';
		syncedLessonId = lesson.id;
		lessonProgress.open(lesson.id);
	}

	function sidesOf(parentId: string): Lesson[] {
		return sideLessons
			.filter((lesson) => lesson.parentId === parentId)
			.sort((a, b) => a.order - b.order);
	}

	function closeLesson() {
		lessonProgress.close();
	}

	function goBack() {
		if (!openLesson) return;
		if (phase === 'finished') {
			phase = 'step';
			stepIndex = openLesson.steps.length - 1;
			return;
		}
		if (stepIndex <= 0) {
			closeLesson();
			return;
		}
		stepIndex -= 1;
		lessonProgress.setStep(openLesson.id, stepIndex);
	}

	function clearAdvance() {
		if (advanceTimer) clearTimeout(advanceTimer);
		advanceTimer = null;
	}

	function doneNext() {
		if (!openLesson || !step) return;
		clearAdvance();
		heard = '';
		lessonProgress.markDone(openLesson.id, step.id);
		if (stepIndex < openLesson.steps.length - 1) {
			stepIndex += 1;
			lessonProgress.setStep(openLesson.id, stepIndex);
		} else {
			lessonProgress.setStep(openLesson.id, stepIndex);
			phase = 'finished';
		}
	}

	function resetThisLesson() {
		if (!openLesson || typeof window === 'undefined') return;
		const ok = window.confirm(
			`Start “${openLesson.title}” over? Checkmarks for this lesson will clear on this device.`
		);
		if (!ok) return;
		lessonProgress.resetLesson(openLesson.id);
		stepIndex = 0;
		phase = 'step';
	}

	function resetEverything() {
		if (typeof window === 'undefined') return;
		const ok = window.confirm('Clear saved lesson progress on this device?');
		if (!ok) return;
		lessonProgress.resetAll();
		phase = 'step';
		stepIndex = 0;
	}

	function scheduleAdvance(label: string) {
		if (!step || advanceTimer) return;
		heard = label;
		const stepId = step.id;
		advanceTimer = setTimeout(() => {
			advanceTimer = null;
			if (step?.id === stepId) doneNext();
		}, 700);
	}

	$effect(() => {
		const id = step?.id;
		const sense = step?.sense;
		if (!id || !step) return;
		clearAdvance();
		heard = '';
		openedAt = performance.now();
		audioMark = untrack(() => audioStore.confirmSerial);
		if (sense === 'audio' && step.listenFor?.type === 'sound') {
			audioStore.arm(step.listenFor.sustainMs ?? 700);
		}
	});

	$effect(() => {
		const serial = midiStore.serial;
		const confirm = audioStore.confirmSerial;
		const current = step;
		if (!current || phase !== 'step' || advanceTimer) return;
		if (current.sense === 'midi' && current.listenFor && midiStore.isConnected) {
			const hit = midiStore.lastHit;
			if (!hit || serial === 0 || midiStore.lastHitAt < openedAt) return;
			if (!matchesListen(current.listenFor, hit)) return;
			scheduleAdvance(hit.label);
			return;
		}
		if (
			current.sense === 'audio' &&
			audioStore.isRunning &&
			confirm > audioMark &&
			audioStore.hot
		) {
			const bpm = audioStore.tempoBpm;
			scheduleAdvance(bpm ? `the loop, about ${bpm} BPM` : 'the SP playing');
		}
	});

	function nextLesson(): Lesson | null {
		if (!openLesson || openLesson.role !== 'core') return null;
		const index = coreLessons.findIndex((lesson) => lesson.id === openLesson.id);
		if (index < 0) return null;
		return coreLessons[index + 1] ?? null;
	}

	function parentLesson(): Lesson | null {
		if (!openLesson?.parentId) return null;
		return lessons.find((lesson) => lesson.id === openLesson.parentId) ?? null;
	}

	function sourceLabel(citation: LessonCitation): string {
		if (citation.doc.includes('sys-5.52')) {
			return 'Roland system program 5.52 notes';
		}
		const page = citation.page ? `, p. ${citation.page}` : '';
		return `Reference Manual v5.50${page}`;
	}

	function statusLabel(lesson: Lesson): string {
		if (lessonProgress.isLessonComplete(lesson)) return 'Finished';
		const done = lessonProgress.doneCount(lesson);
		if (done > 0 || (lessonProgress.stepByLesson[lesson.id] ?? 0) > 0) return 'In progress';
		return 'Not started';
	}
</script>

<main id="main-content" class="container lessons" tabindex="-1">
	{#if !openLesson}
		<header class="lessons-intro">
			<div class="lessons-intro__mark" aria-hidden="true">
				<BookOpen size={22} />
			</div>
			<div>
				<p class="lessons-kicker">Lessons</p>
				<h2>Two paths, one drawing</h2>
				<p class="lessons-lead">
					Normal mode is how you make tracks on the SP. DJ mode is how you play a set. Each path has
					a short core you can walk in order. The side lessons are optional branches. They never
					gate the core. Nothing here keeps score.
				</p>
				<p class="lessons-meta">
					Core {coreDone} of {coreLessons.length}
					<span aria-hidden="true">·</span>
					Side lessons {sideDone} finished
					<span aria-hidden="true">·</span>
					Saved in this browser
				</p>
			</div>
		</header>

		<div class="track-switch" role="tablist" aria-label="Lesson path">
			<button
				type="button"
				role="tab"
				class="track-switch__btn"
				class:track-switch__btn--active={track === 'normal'}
				aria-selected={track === 'normal'}
				onclick={() => (track = 'normal')}
			>
				Normal mode
			</button>
			<button
				type="button"
				role="tab"
				class="track-switch__btn"
				class:track-switch__btn--active={track === 'dj'}
				aria-selected={track === 'dj'}
				onclick={() => (track = 'dj')}
			>
				DJ mode
			</button>
		</div>

		<LessonLink />

		{#snippet lessonCard(lesson: Lesson, index: number)}
			{@const done = lessonProgress.doneCount(lesson)}
			{@const complete = lessonProgress.isLessonComplete(lesson)}
			<article class="lesson-card" class:lesson-card--done={complete}>
				<div class="lesson-card__index" aria-hidden="true">{index}</div>
				<div class="lesson-card__body">
					<div class="lesson-card__title-row">
						<h3>{lesson.title}</h3>
						<span class="status-pill" class:status-pill--done={complete}>
							{#if complete}
								<Check size={12} />
							{/if}
							{statusLabel(lesson)}
						</span>
					</div>
					<p>{lesson.blurb}</p>
					<p class="lesson-card__meta">
						{lesson.steps.length} steps
						{#if done > 0 && !complete}
							<span aria-hidden="true">·</span>
							{done} done
						{/if}
					</p>
					<button type="button" class="lesson-open" onclick={() => openLessonAt(lesson)}>
						{complete ? 'Play again' : done > 0 ? 'Continue' : 'Start'}
						<ChevronRight size={16} />
					</button>
				</div>
			</article>
		{/snippet}

		<section class="core-path" aria-labelledby="core-path-title">
			<h3 id="core-path-title">Core path</h3>
			<p class="core-path__note">
				{track === 'normal'
					? 'Make a beat, print it, chain it, and keep the project. Take these in order if you want a line to follow.'
					: 'Play a first set on two decks. The loops themselves are made on the Normal path.'}
			</p>
			<ol class="lesson-list">
				{#each coreLessons as lesson, index (lesson.id)}
					{@const branches = sidesOf(lesson.id)}
					<li>
						{@render lessonCard(lesson, index + 1)}
						{#if branches.length > 0}
							<div class="branches">
								<p class="branches__label">Side lessons</p>
								<ul>
									{#each branches as branch (branch.id)}
										<li>
											<button type="button" class="branch" onclick={() => openLessonAt(branch)}>
												<span>{branch.title}</span>
												{#if lessonProgress.isLessonComplete(branch)}
													<Check size={12} />
												{/if}
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		</section>

		<section class="chapter-browse" aria-labelledby="chapter-browse-title">
			<h3 id="chapter-browse-title">Browse by manual chapter</h3>
			<p class="core-path__note">
				The same lessons, in the order of the v5.50 Reference Manual. Side lessons are optional.
			</p>
			{#each chapterGroups as group (group.chapter)}
				<details class="chapter">
					<summary>
						{group.chapter}
						<span>{group.items.length}</span>
					</summary>
					<ul>
						{#each group.items as lesson (lesson.id)}
							<li>
								<button type="button" class="chapter__link" onclick={() => openLessonAt(lesson)}>
									<span class="chapter__role">{lesson.role === 'core' ? 'Core' : 'Side'}</span>
									{lesson.title}
								</button>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
		</section>

		<p class="lessons-footnote">
			Steps are checked against the Roland SP-404MKII Reference Manual v5.50 in this repo. Roland’s
			system program as of June 2026 is 5.52, which Roland says does not change specifications.
			Anything a step could not confirm is marked on that step.
		</p>
		{#if doneCount > 0}
			<button type="button" class="text-reset" onclick={resetEverything}>
				Clear saved lesson progress
			</button>
		{/if}
	{:else}
		{@const lesson = openLesson}
		{@const following = nextLesson()}
		{@const parent = parentLesson()}
		<div class="player">
			<div class="player__column">
				<div class="player__steps">
					<div class="player__toolbar">
						<button type="button" class="text-back" onclick={closeLesson}>All lessons</button>
						<p class="player__count">
							{#if lesson.role === 'core'}
								Core {coreLessons.findIndex((item) => item.id === lesson.id) + 1} of {coreLessons.length}
							{:else}
								Side lesson
							{/if}
						</p>
					</div>
					<h2>{lesson.title}</h2>
					<p class="player__bring">{lesson.bring}</p>
					<LessonLink />

					{#if phase === 'finished'}
						<section class="finish-card" aria-labelledby="lesson-finished-title">
							<p class="lessons-kicker">That’s the lesson</p>
							<h3 id="lesson-finished-title">You walked the whole thing.</h3>
							<p>
								It stays marked on this device. The SP remembers the sounds. Come back and play it
								again whenever, or keep going.
							</p>
							<div class="finish-card__actions">
								{#if following}
									<button
										type="button"
										class="btn btn--primary"
										onclick={() => openLessonAt(following)}
									>
										Next: {following.title}
										<ChevronRight size={16} />
									</button>
								{/if}
								{#if parent}
									<button type="button" class="btn btn--ghost" onclick={() => openLessonAt(parent)}>
										Back to {parent.title}
									</button>
								{/if}
								<button type="button" class="btn btn--ghost" onclick={closeLesson}>
									Back to all lessons
								</button>
							</div>
						</section>
					{:else if step}
						<article id="lesson-step" class="step-card" aria-live="polite">
							<div class="step-card__progress" aria-hidden="true">
								{#each lesson.steps as dot, dotIndex (dot.id)}
									<span
										class="step-dot"
										class:step-dot--done={lessonProgress.isStepDone(lesson.id, dot.id)}
										class:step-dot--now={dotIndex === stepIndex}
									></span>
								{/each}
							</div>
							<p class="step-card__count">
								Step {stepIndex + 1} of {lesson.steps.length}
							</p>
							<h3>{step.title}</h3>
							<p class="sense-line">
								{#if step.sense === 'midi'}
									The SP can check this one in. Hit it, and the step moves on. Done / Next still
									works if it stays quiet.
								{:else if step.sense === 'audio'}
									If Listen to the SP is on, a steady signal moves this step on. A loop that is
									already playing does not count.
								{:else}
									This control doesn't report itself. The hatching means it's on you. Done / Next
									when you've done it.
								{/if}
							</p>
							{#if heard}
								<p class="heard">Heard it. {heard}</p>
							{/if}

							<div class="callout callout--do">
								<p class="callout__label">Press this</p>
								<p>{step.action}</p>
							</div>
						</article>
					{/if}
				</div>

				{#if step}
					<div class="player__listen">
						<div class="callout callout--listen">
							<p class="callout__label">
								<Headphones size={14} />
								Listen for
							</p>
							<p>{step.listen}</p>
						</div>

						{#if step.note}
							<p class="step-note">{step.note}</p>
						{/if}

						{#if step.offPanel}
							<div class="callout callout--off">
								<p class="callout__label">
									<Info size={14} />
									On the machine, not on this drawing
								</p>
								<p>{step.offPanel}</p>
							</div>
						{/if}

						{#if step.unverified && step.unverified.length > 0}
							<div class="callout callout--unverified">
								<p class="callout__label">Could not verify</p>
								<ul>
									{#each step.unverified as note (note)}
										<li>{note}</li>
									{/each}
								</ul>
							</div>
						{/if}

						<details class="sources">
							<summary>Where this step comes from</summary>
							<ul>
								{#each step.citations as citation (`${citation.doc}-${citation.page ?? ''}-${citation.quote}`)}
									<li>
										<p class="sources__label">{sourceLabel(citation)}</p>
										<blockquote>{citation.quote}</blockquote>
									</li>
								{/each}
							</ul>
						</details>
					</div>
				{/if}
			</div>

			<aside class="player__panel" aria-label="Highlighted SP-404MKII controls">
				{#if step}
					<Faceplate
						activeButtons={step.highlight}
						selectedTip={null}
						matchCount={0}
						onToggleButton={() => {}}
						onClearButtons={() => {}}
						guideLock={true}
						showShiftLabels={step.showShiftLabels === true}
						showDjLabels={step.showDjLabels === true}
						{liveButtons}
						hatchHighlights={step.sense === 'manual'}
						lessonCue={{
							kicker: `STEP ${stepIndex + 1}/${lesson.steps.length}`,
							headline: step.screen,
							detail: step.title
						}}
					/>
				{:else}
					<Faceplate
						activeButtons={[]}
						selectedTip={null}
						matchCount={0}
						onToggleButton={() => {}}
						onClearButtons={() => {}}
						lessonCue={{
							kicker: 'DONE',
							headline: lesson.title,
							detail: 'The whole lesson'
						}}
					/>
				{/if}
			</aside>
		</div>

		<div class="lesson-dock">
			<button type="button" class="btn btn--ghost" onclick={goBack}>
				<ChevronLeft size={16} />
				Back
			</button>
			<button type="button" class="btn btn--ghost" onclick={resetThisLesson}>
				<RotateCcw size={15} />
				Reset
			</button>
			{#if phase === 'step' && step}
				<button type="button" class="btn btn--primary" onclick={doneNext}>
					{stepIndex < lesson.steps.length - 1 ? 'Done / Next' : 'Done'}
					<ChevronRight size={16} />
				</button>
			{:else if following}
				<button type="button" class="btn btn--primary" onclick={() => openLessonAt(following)}>
					Next lesson
					<ChevronRight size={16} />
				</button>
			{:else}
				<button type="button" class="btn btn--primary" onclick={closeLesson}>All lessons</button>
			{/if}
		</div>
	{/if}
</main>

<style>
	.lessons {
		padding-block: 1rem 3rem;
	}

	.lessons-intro {
		display: flex;
		gap: 0.9rem;
		align-items: flex-start;
		padding: 1.1rem 1.2rem;
		margin-bottom: 1.1rem;
		background: linear-gradient(135deg, rgba(234, 88, 12, 0.14), rgba(19, 22, 28, 0.4));
		border: 1px solid rgba(234, 88, 12, 0.35);
		border-radius: 0.8rem;
	}

	.lessons-intro__mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.4rem;
		height: 2.4rem;
		flex-shrink: 0;
		border-radius: 0.55rem;
		color: #fdba74;
		background: rgba(234, 88, 12, 0.12);
		border: 1px solid rgba(234, 88, 12, 0.35);
	}

	.lessons-kicker {
		margin: 0 0 0.2rem;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #fdba74;
	}

	.lessons-intro h2,
	.player h2 {
		margin: 0 0 0.35rem;
		font-size: 1.25rem;
		font-weight: 800;
		color: #f8fafc;
		letter-spacing: -0.02em;
	}

	.lessons-lead,
	.player__bring,
	.lessons-footnote {
		margin: 0;
		color: #cbd5e1;
		font-size: 0.9rem;
		line-height: 1.5;
		max-width: 68ch;
	}

	.lessons-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.7rem 0 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: #94a3b8;
	}

	.track-switch {
		display: flex;
		gap: 0.4rem;
		margin: 0.9rem 0 0.2rem;
	}

	.track-switch__btn {
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		border: 1px solid #334155;
		background: #141822;
		color: #cbd5e1;
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
	}

	.track-switch__btn--active {
		background: #ea580c;
		border-color: #fb923c;
		color: #fff;
	}

	.core-path h3,
	.chapter-browse h3 {
		margin: 0.4rem 0 0.25rem;
		font-size: 0.95rem;
		color: #f8fafc;
	}

	.core-path__note {
		margin: 0 0 0.75rem;
		color: #94a3b8;
		font-size: 0.82rem;
	}

	.core-path .lesson-list > li {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.branches {
		margin: 0.45rem 0 0;
	}

	.branches__label {
		margin: 0 0 0.3rem;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #64748b;
	}

	.branches ul,
	.chapter ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.branch,
	.chapter__link {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.28rem 0.55rem;
		border-radius: 999px;
		border: 1px dashed #475569;
		background: transparent;
		color: #e2e8f0;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}

	.branch:hover,
	.chapter__link:hover {
		border-color: #ea580c;
		color: #fff;
	}

	.chapter-browse {
		margin-top: 1.4rem;
	}

	.chapter {
		border-top: 1px solid #1e2430;
		padding: 0.45rem 0;
	}

	.chapter summary {
		cursor: pointer;
		font-weight: 800;
		color: #cbd5e1;
		display: flex;
		justify-content: space-between;
	}

	.chapter summary span {
		color: #64748b;
		font-size: 0.75rem;
	}

	.chapter ul {
		flex-direction: column;
		align-items: flex-start;
		margin-top: 0.45rem;
	}

	.chapter__role {
		font-size: 0.65rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fdba74;
	}

	.lesson-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 0.75rem;
		align-items: start;
	}

	.lesson-card {
		display: flex;
		gap: 0.75rem;
		padding: 0.9rem;
		background: #13161c;
		border: 1px solid #222731;
		border-radius: 0.75rem;
	}

	.lesson-card--done {
		border-color: rgba(234, 88, 12, 0.45);
	}

	.lesson-card__index {
		font-size: 1.35rem;
		font-weight: 800;
		color: #ea580c;
		line-height: 1;
		min-width: 1.4rem;
	}

	.lesson-card__body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
		flex: 1;
	}

	.lesson-card__title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.35rem 0.6rem;
	}

	.lesson-card h3,
	.step-card h3,
	.finish-card h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
		color: #f8fafc;
	}

	.lesson-card p,
	.callout p,
	.step-note,
	.finish-card p,
	.sources li {
		margin: 0;
		color: #cbd5e1;
		font-size: 0.84rem;
		line-height: 1.45;
	}

	.lesson-card__meta {
		font-size: 0.75rem !important;
		font-weight: 700;
		color: #94a3b8 !important;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		border: 1px solid #2e3748;
		background: #171b22;
		color: #94a3b8;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.02em;
	}

	.status-pill--done {
		color: #ffedd5;
		background: rgba(234, 88, 12, 0.18);
		border-color: rgba(234, 88, 12, 0.5);
	}

	.lesson-open {
		margin-top: auto;
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.38rem 0.7rem;
		border-radius: 0.45rem;
		border: 1px solid #ea580c;
		background: #ea580c;
		color: #fff;
		font-size: 0.8rem;
		font-weight: 800;
		cursor: pointer;
	}

	.lesson-open:hover {
		background: #f97316;
	}

	.lessons-footnote {
		margin-top: 1rem;
		font-size: 0.78rem;
		color: #94a3b8;
	}

	.text-reset,
	.text-back {
		margin-top: 0.75rem;
		padding: 0;
		border: 0;
		background: none;
		color: #fdba74;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.15rem;
	}

	.player {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
		padding-bottom: 5.5rem;
	}

	.player__toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.35rem;
	}

	.player__count {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 800;
		color: #94a3b8;
	}

	.player__bring {
		margin-bottom: 0.85rem;
		font-size: 0.82rem;
		color: #94a3b8;
	}

	.step-card,
	.finish-card {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 0.95rem 1rem;
		background: #13161c;
		border: 1px solid #222731;
		border-radius: 0.75rem;
	}

	.step-card__progress {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.step-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: #1e2430;
		border: 1px solid #334155;
	}

	.step-dot--done {
		background: #9a3412;
		border-color: #ea580c;
	}

	.step-dot--now {
		background: #fb923c;
		border-color: #ffedd5;
	}

	.step-card__count {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #fdba74;
	}

	.sense-line {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #94a3b8;
	}

	.heard {
		margin: 0;
		padding: 0.45rem 0.65rem;
		border-radius: 0.45rem;
		background: rgba(56, 189, 248, 0.12);
		border: 1px solid rgba(56, 189, 248, 0.4);
		color: #e0f2fe;
		font-size: 0.82rem;
		font-weight: 700;
	}

	.callout {
		padding: 0.75rem 0.85rem;
		border-radius: 0.55rem;
		background: #0f131a;
		border: 1px solid #262c38;
	}

	.callout--do {
		border-left: 3px solid #ea580c;
	}

	.callout--listen {
		border-left: 3px solid #38bdf8;
	}

	.callout--off {
		border-left: 3px solid #a78bfa;
	}

	.callout--unverified {
		border-left: 3px solid #fbbf24;
		background: rgba(251, 191, 36, 0.06);
	}

	.callout__label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.25rem !important;
		font-size: 0.72rem !important;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #fdba74 !important;
	}

	.callout--listen .callout__label {
		color: #7dd3fc !important;
	}

	.callout--off .callout__label {
		color: #c4b5fd !important;
	}

	.callout--unverified .callout__label {
		color: #fcd34d !important;
	}

	.callout ul {
		margin: 0.35rem 0 0;
		padding-left: 1.1rem;
	}

	.callout li {
		margin: 0.2rem 0;
		color: #e2e8f0;
		font-size: 0.82rem;
	}

	.step-note {
		color: #94a3b8;
	}

	.sources {
		color: #94a3b8;
		font-size: 0.78rem;
	}

	.sources summary {
		cursor: pointer;
		font-weight: 700;
		color: #cbd5e1;
	}

	.sources ul {
		list-style: none;
		padding: 0.6rem 0 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.sources__label {
		margin: 0 0 0.2rem;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #64748b;
	}

	.sources blockquote {
		margin: 0;
		padding-left: 0.65rem;
		border-left: 2px solid #334155;
		color: #cbd5e1;
	}

	.player__listen {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.lesson-dock {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.45rem;
		padding: 0.65rem clamp(0.75rem, 2.5vw, 1.5rem) calc(0.65rem + env(safe-area-inset-bottom));
		background: rgba(13, 15, 19, 0.94);
		border-top: 1px solid #222731;
		backdrop-filter: blur(8px);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.5rem 0.85rem;
		border-radius: 0.45rem;
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
		border: 1px solid transparent;
	}

	.btn--primary {
		background: #ea580c;
		border-color: #f97316;
		color: #fff;
	}

	.btn--primary:hover {
		background: #f97316;
	}

	.btn--ghost {
		background: #141822;
		border-color: #273042;
		color: #cbd5e1;
	}

	.btn--ghost:hover {
		border-color: #ea580c;
		color: #fff;
	}

	.finish-card__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.player__column {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		min-width: 0;
	}

	@media (min-width: 860px) {
		.player {
			grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
			align-items: start;
			padding-bottom: 5.5rem;
		}

		.player__panel {
			position: sticky;
			top: 4.5rem;
			max-height: calc(100dvh - 10rem);
			overflow-y: auto;
			scrollbar-width: thin;
		}
	}

	@media (max-width: 859px) {
		.player__column {
			display: contents;
		}

		.player__steps {
			order: 1;
		}

		.player__panel {
			order: 2;
		}

		.player__listen {
			order: 3;
		}

		.step-card {
			position: sticky;
			top: 3.15rem;
			z-index: 30;
		}
	}

	@media (pointer: coarse) {
		.btn,
		.lesson-open {
			min-height: 2.6rem;
		}
	}

	@media print {
		.lesson-dock,
		.lesson-open,
		.text-reset {
			display: none !important;
		}

		.player {
			padding-bottom: 0;
		}
	}
</style>
