/**
 * Opt-in Web MIDI listen-only connection to a Roland SP-404MKII.
 *
 * Nothing touches the Web MIDI API until `connect()` runs from a click. SysEx is never
 * requested (the chart lists no System Exclusive messages). Nothing is sent.
 *
 * The same shape as the S-1 cheat sheet's connect button: auto-select a port whose name
 * looks like this instrument, and never grab some other device on its own.
 */
import { decodeMessage, type SpHit } from '#lib/sense/decode.js';

export type MidiStatus = 'idle' | 'unsupported' | 'requesting' | 'denied' | 'error' | 'connected';

export interface MidiPortInfo {
	id: string;
	name: string;
	connected: boolean;
}

const SP_PORT_NAME = /sp-?\s?404/i;
const FLASH_MS = 700;

const UNSUPPORTED_MESSAGE =
	'This browser can’t hear MIDI (Safari and Firefox aren’t supported). Chrome or Edge on a computer can connect the SP-404.';

function browserNote(): string | null {
	if (typeof navigator === 'undefined') return null;
	if (/firefox|fxios/i.test(navigator.userAgent)) {
		return 'Firefox doesn’t speak Web MIDI on its own. Chrome or Edge is the reliable way to connect the SP-404.';
	}
	if (/safari/i.test(navigator.userAgent) && !/chrome|crios|edg/i.test(navigator.userAgent)) {
		return 'Safari doesn’t speak Web MIDI. Chrome or Edge can connect the SP-404.';
	}
	return null;
}

class MidiStore {
	status = $state<MidiStatus>('idle');
	message = $state('');
	note = $state<string | null>(null);
	inputs = $state<MidiPortInfo[]>([]);
	inputId = $state('');
	/** Bumps on every decoded message so a lesson can notice a new hit. */
	serial = $state(0);
	lastHit = $state<SpHit | null>(null);
	lastHitAt = $state(0);
	clockSeen = $state(false);
	/** Faceplate ids lit by the latest hits. */
	flashing = $state<Record<string, boolean>>({});

	#access: MIDIAccess | null = null;
	#boundInput: MIDIInput | null = null;
	#flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

	get isConnected(): boolean {
		return this.status === 'connected' && this.inputReady;
	}

	get inputReady(): boolean {
		return this.inputs.some((port) => port.id === this.inputId && port.connected);
	}

	get portName(): string {
		return this.inputs.find((port) => port.id === this.inputId)?.name ?? '';
	}

	get liveButtons(): string[] {
		return Object.keys(this.flashing);
	}

	async connect() {
		if (this.status === 'requesting' || this.status === 'connected') return;
		this.note = browserNote();

		if (
			typeof navigator === 'undefined' ||
			!('requestMIDIAccess' in navigator) ||
			!window.isSecureContext
		) {
			this.status = 'unsupported';
			this.message = UNSUPPORTED_MESSAGE;
			return;
		}

		this.status = 'requesting';
		this.message = 'Waiting for MIDI permission…';
		try {
			const access = await navigator.requestMIDIAccess({ sysex: false });
			this.#access = access;
			access.onstatechange = () => this.#syncPorts();
			this.status = 'connected';
			this.message = '';
			this.#syncPorts();
		} catch (err) {
			const name = err instanceof DOMException ? err.name : '';
			if (name === 'NotAllowedError' || name === 'SecurityError') {
				this.status = 'denied';
				this.message =
					'MIDI access was blocked. Allow MIDI for this site (the icon by the address bar), then press Connect SP-404 again.';
			} else {
				this.status = 'error';
				this.message = `Couldn’t open MIDI: ${err instanceof Error ? err.message : String(err)}`;
			}
		}
	}

	disconnect() {
		this.#unbindInput();
		if (this.#access) this.#access.onstatechange = null;
		this.#access = null;
		for (const timer of this.#flashTimers.values()) clearTimeout(timer);
		this.#flashTimers.clear();
		this.status = 'idle';
		this.message = '';
		this.note = null;
		this.inputs = [];
		this.inputId = '';
		this.serial = 0;
		this.lastHit = null;
		this.lastHitAt = 0;
		this.clockSeen = false;
		this.flashing = {};
	}

	selectInput(id: string) {
		this.inputId = id;
		this.#bindInput();
	}

	#syncPorts() {
		const access = this.#access;
		if (!access) return;
		this.inputs = [...access.inputs.values()].map((port) => ({
			id: port.id,
			name: port.name ?? 'MIDI input',
			connected: port.state === 'connected'
		}));
		if (!this.inputs.some((port) => port.id === this.inputId)) {
			this.inputId = this.inputs.find((port) => SP_PORT_NAME.test(port.name))?.id ?? '';
		}
		this.#bindInput();
	}

	#bindInput() {
		const input = this.#access?.inputs.get(this.inputId) ?? null;
		const usable = input && input.state === 'connected' ? input : null;
		if (usable === this.#boundInput) return;
		this.#unbindInput();
		if (usable) {
			usable.onmidimessage = this.#handleMessage;
			this.#boundInput = usable;
		}
	}

	#unbindInput() {
		if (this.#boundInput) {
			this.#boundInput.onmidimessage = null;
			this.#boundInput = null;
		}
	}

	#handleMessage = (event: MIDIMessageEvent) => {
		const data = event.data;
		if (!data) return;
		const hit = decodeMessage(data);
		if (!hit) return;
		if (hit.kind === 'clock') {
			this.clockSeen = true;
			return;
		}
		this.lastHit = hit;
		this.lastHitAt = performance.now();
		this.serial += 1;
		for (const id of hit.controls) this.#flash(id);
	};

	#flash(id: string) {
		this.flashing[id] = true;
		clearTimeout(this.#flashTimers.get(id));
		this.#flashTimers.set(
			id,
			setTimeout(() => {
				delete this.flashing[id];
				this.#flashTimers.delete(id);
			}, FLASH_MS)
		);
	}
}

export const midiStore = new MidiStore();
