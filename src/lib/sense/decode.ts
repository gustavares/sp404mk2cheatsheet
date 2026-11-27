/**
 * Decode what the SP-404MKII actually transmits, from the v5.50 MIDI implementation
 * chart (docs/reference/roland-v550/12-appendix-specs-midi.md, pp. 167–172) and the
 * PAD Note Out parameter (10-appendix-parameters-mfx.md, p. 138).
 *
 * Mode A is the chart's default. One channel per bank (1 = A … 10 = J). Pads share
 * notes 36–51; note 35 is EXT SOURCE. Note-off is not transmitted.
 *
 * Mode B's printed map uses channel *ranges* plus a Note offset, so a single
 * channel+note does not name one pad. Those note-ons still count as "a pad" for a
 * lesson that asked for any pad, and the activity line keeps the raw numbers.
 */

export const MODE_A_BANKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

/** Note number → pad, mode A, every bank. From the note map, pp. 171–172. */
export const MODE_A_PAD_BY_NOTE: Record<number, number> = {
	48: 1,
	49: 2,
	50: 3,
	51: 4,
	44: 5,
	45: 6,
	46: 7,
	47: 8,
	40: 9,
	41: 10,
	42: 11,
	43: 12,
	36: 13,
	37: 14,
	38: 15,
	39: 16
};

export type ListenFor =
	| { type: 'any-pad' }
	| { type: 'pad'; pad: number }
	| { type: 'note'; note: number; channel?: number }
	| { type: 'knob' }
	| { type: 'dj-play'; channel: 1 | 2 }
	| { type: 'dj-sync' }
	| { type: 'dj-cue' }
	| { type: 'dj-xfade' }
	| { type: 'dj-bend' }
	| { type: 'dj-bpm' }
	| { type: 'sound'; sustainMs?: number };

export interface SpHit {
	/** Faceplate ids to light. Empty when the chart cannot name one control. */
	controls: string[];
	kind:
		| 'pad'
		| 'ext'
		| 'knob'
		| 'dj-play'
		| 'dj-sync'
		| 'dj-cue'
		| 'dj-xfade'
		| 'dj-bend'
		| 'dj-bpm'
		| 'clock'
		| 'other';
	pad?: number;
	bank?: string;
	channel: number;
	note?: number;
	cc?: number;
	value?: number;
	/** One short line for the connect bar. */
	label: string;
}

const STATUS_NOTE_ON = 0x90;
const STATUS_CC = 0xb0;
const STATUS_CLOCK = 0xf8;

function padId(pad: number): string {
	return `PAD ${pad}`;
}

/** Mode A note-on. Returns null for velocity 0 (the chart does not transmit note-off). */
export function decodeModeA(channel: number, note: number, velocity: number): SpHit | null {
	if (velocity <= 0) return null;
	// Chromatic mode transmits notes 36–60 on channel 16. The chart does not name which pad is which key.
	if (channel === 16 && note >= 36 && note <= 60) {
		return {
			controls: [],
			kind: 'pad',
			channel,
			note,
			value: velocity,
			label: `chromatic note ${note}`
		};
	}
	if (channel < 1 || channel > 10) return null;
	const bank = MODE_A_BANKS[channel - 1];
	if (note === 35) {
		return {
			controls: ['EXT SOURCE'],
			kind: 'ext',
			bank,
			channel,
			note,
			value: velocity,
			label: `EXT SOURCE (bank ${bank})`
		};
	}
	const pad = MODE_A_PAD_BY_NOTE[note];
	if (!pad) return null;
	return {
		controls: [padId(pad)],
		kind: 'pad',
		pad,
		bank,
		channel,
		note,
		value: velocity,
		label: `pad ${pad}, bank ${bank}`
	};
}

/**
 * A mode B note-on we can treat as "some pad" without naming it.
 * Notes 12–91 are the chart's transmitted mode B range, excluding note 0 (EXT SOURCE).
 */
function decodeModeBAnyPad(channel: number, note: number, velocity: number): SpHit | null {
	if (velocity <= 0 || channel < 1 || channel > 10) return null;
	if (note === 0) {
		return {
			controls: ['EXT SOURCE'],
			kind: 'ext',
			channel,
			note,
			value: velocity,
			label: 'EXT SOURCE (MIDI mode B)'
		};
	}
	if (note < 12 || note > 91) return null;
	return {
		controls: [],
		kind: 'pad',
		channel,
		note,
		value: velocity,
		label: `a pad (mode B, note ${note} ch ${channel})`
	};
}

function decodeCC(channel: number, cc: number, value: number): SpHit | null {
	if (channel < 1 || channel > 16) return null;

	// DJ mode transport and levels. Chart p. 169, footnote *8. Not recognized, only transmitted.
	if (cc === 7 && (channel === 1 || channel === 2)) {
		return {
			controls: [channel === 1 ? 'CTRL 1' : 'CTRL 2'],
			kind: 'knob',
			channel,
			cc,
			value,
			label: channel === 1 ? 'CH1 level' : 'CH2 level'
		};
	}
	if (cc === 8 && channel === 1) {
		return {
			controls: ['CTRL 3'],
			kind: 'dj-xfade',
			channel,
			cc,
			value,
			label: 'crossfade'
		};
	}
	if (cc === 20 && (channel === 1 || channel === 2) && value >= 64) {
		return {
			controls: [channel === 1 ? 'PAD 13' : 'PAD 15'],
			kind: 'dj-play',
			pad: channel === 1 ? 13 : 15,
			channel,
			cc,
			value,
			label: channel === 1 ? 'CH1 play' : 'CH2 play'
		};
	}
	if (cc === 22 && (channel === 1 || channel === 2) && value >= 64) {
		return {
			controls: [channel === 1 ? 'PAD 10' : 'PAD 12'],
			kind: 'dj-sync',
			channel,
			cc,
			value,
			label: channel === 1 ? 'CH1 sync' : 'CH2 sync'
		};
	}
	if (cc === 23 && (channel === 1 || channel === 2) && value >= 64) {
		return {
			controls: [channel === 1 ? 'PAD 14' : 'PAD 16'],
			kind: 'dj-cue',
			channel,
			cc,
			value,
			label: channel === 1 ? 'CH1 cue' : 'CH2 cue'
		};
	}
	// Other DJ pads (bend, bpm, cue-return). Light them; lessons don't auto-advance on these.
	const djPad = djPadFor(channel, cc, value);
	if (djPad) {
		const bend = cc === 24 || cc === 25;
		const bpm = cc === 26 || cc === 27;
		return {
			controls: [padId(djPad)],
			kind: bend ? 'dj-bend' : bpm ? 'dj-bpm' : 'other',
			pad: djPad,
			channel,
			cc,
			value,
			label: bend ? 'pitch bend' : bpm ? 'BPM nudge' : `DJ pad ${djPad}`
		};
	}

	// Effect knobs. Chart p. 169: CC16–18 are Ctrl 1–3 on the bus channels.
	if ((cc === 16 || cc === 17 || cc === 18) && channel >= 1 && channel <= 5) {
		const knob = cc === 16 ? 'CTRL 1' : cc === 17 ? 'CTRL 2' : 'CTRL 3';
		return {
			controls: [knob],
			kind: 'knob',
			channel,
			cc,
			value,
			label: knob
		};
	}

	return {
		controls: [],
		kind: 'other',
		channel,
		cc,
		value,
		label: `CC ${cc} ch ${channel} = ${value}`
	};
}

function djPadFor(channel: number, cc: number, value: number): number | null {
	if (value < 64 || (channel !== 1 && channel !== 2)) return null;
	const table: Record<number, [number, number]> = {
		21: [9, 11],
		24: [1, 3],
		25: [5, 7],
		26: [2, 4],
		27: [6, 8]
	};
	const pair = table[cc];
	return pair ? pair[channel - 1] : null;
}

/** One Web MIDI message. Program change and note-off are ignored: the chart says they are not transmitted. */
export function decodeMessage(data: Uint8Array | number[]): SpHit | null {
	if (data.length < 1) return null;
	const status = data[0];
	if (status === STATUS_CLOCK) {
		return { controls: [], kind: 'clock', channel: 0, label: 'MIDI clock' };
	}
	if (data.length < 3) return null;
	const kind = status & 0xf0;
	const channel = (status & 0x0f) + 1;
	if (kind === STATUS_NOTE_ON) {
		return decodeModeA(channel, data[1], data[2]) ?? decodeModeBAnyPad(channel, data[1], data[2]);
	}
	if (kind === STATUS_CC) return decodeCC(channel, data[1], data[2]);
	return null;
}

export function matchesListen(listenFor: ListenFor, hit: SpHit): boolean {
	switch (listenFor.type) {
		case 'sound':
			return false;
		case 'any-pad':
			return hit.kind === 'pad';
		case 'pad':
			return hit.kind === 'pad' && hit.pad === listenFor.pad;
		case 'note':
			return (
				hit.note === listenFor.note &&
				(listenFor.channel === undefined || hit.channel === listenFor.channel)
			);
		case 'knob':
			return (
				hit.kind === 'knob' && (hit.cc === 16 || hit.cc === 17 || hit.cc === 18 || hit.cc === 7)
			);
		case 'dj-play':
			return hit.kind === 'dj-play' && hit.channel === listenFor.channel;
		case 'dj-sync':
			return hit.kind === 'dj-sync';
		case 'dj-cue':
			return hit.kind === 'dj-cue';
		case 'dj-xfade':
			return hit.kind === 'dj-xfade';
		case 'dj-bend':
			return hit.kind === 'dj-bend';
		case 'dj-bpm':
			return hit.kind === 'dj-bpm';
		default:
			return false;
	}
}
