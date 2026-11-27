/**
 * Opt-in audio input for lesson steps that are waiting to hear the SP.
 *
 * Nothing is requested until `start()` runs from a click. The input feeds one AnalyserNode
 * and is never connected to the speakers. Echo cancellation, noise suppression, and auto
 * gain are off so the meter sees the SP, not the browser's idea of a phone call.
 */
import { sustainedAbove, tempoHint, type LevelSample } from '#lib/sense/level.js';

export type AudioStatus =
	| 'idle'
	| 'requesting'
	| 'running'
	| 'denied'
	| 'no-device'
	| 'disconnected'
	| 'unsupported'
	| 'error';

export interface AudioDeviceInfo {
	deviceId: string;
	label: string;
}

const SP_DEVICE_LABEL = /sp-?\s?404/i;
const FFT = 2048;

class AudioInputStore {
	status = $state<AudioStatus>('idle');
	message = $state('');
	devices = $state<AudioDeviceInfo[]>([]);
	deviceId = $state('');
	deviceLabel = $state('');
	/** 0–1, updated a few times a second. */
	level = $state(0);
	/** True once the signal has stayed above this step's baseline. */
	hot = $state(false);
	/** Bumps when `hot` becomes true, so a lesson notices a new confirmation. */
	confirmSerial = $state(0);
	/** BPM only when recent onsets agree. Otherwise null — no guess. */
	tempoBpm = $state<number | null>(null);

	#ctx: AudioContext | null = null;
	#stream: MediaStream | null = null;
	#source: MediaStreamAudioSourceNode | null = null;
	#analyser: AnalyserNode | null = null;
	#timer: ReturnType<typeof setInterval> | null = null;
	#generation = 0;
	#samples: LevelSample[] = [];
	#onsets: number[] = [];
	#above = false;
	#baseline: number | null = null;
	#armedAt = 0;
	#sustainMs = 600;

	get isRunning(): boolean {
		return this.status === 'running';
	}

	/**
	 * Ask for the input. Call it from a click so the AudioContext may start.
	 */
	async start() {
		if (this.status === 'requesting' || this.status === 'running') return;
		const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
		if (
			!media?.getUserMedia ||
			typeof AudioContext === 'undefined' ||
			typeof window === 'undefined' ||
			!window.isSecureContext
		) {
			this.status = 'unsupported';
			this.message = 'This browser can’t use an audio input here. Chrome or Edge over HTTPS can.';
			return;
		}

		this.#ctx ??= new AudioContext({ latencyHint: 'interactive' });
		this.status = 'requesting';
		this.message = 'Waiting for permission to hear the input…';
		media.addEventListener('devicechange', this.#onDeviceChange);

		try {
			const known = await this.#listInputs();
			const sp = known.find((device) => SP_DEVICE_LABEL.test(device.label));
			await this.#openStream(sp?.deviceId);
			if (!sp) {
				const listed = await this.#refreshDevices();
				const found = listed.find((device) => SP_DEVICE_LABEL.test(device.label));
				if (found && found.deviceId !== this.deviceId) await this.#openStream(found.deviceId);
			}
		} catch (err) {
			this.#fail(err);
		}
	}

	async selectDevice(deviceId: string) {
		if (!deviceId || this.status === 'idle') return;
		try {
			await this.#openStream(deviceId);
		} catch (err) {
			this.#fail(err);
		}
	}

	/** Call when a lesson step opens, so a loop that is already playing does not confirm itself. */
	arm(sustainMs = 600) {
		this.#sustainMs = sustainMs;
		this.#baseline = null;
		this.#armedAt = performance.now();
		this.#samples = [];
		this.#onsets = [];
		this.#above = false;
		this.hot = false;
		this.tempoBpm = null;
	}

	stop() {
		this.#generation++;
		this.#teardownStream();
		if (typeof navigator !== 'undefined') {
			navigator.mediaDevices?.removeEventListener('devicechange', this.#onDeviceChange);
		}
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
		this.#analyser?.disconnect();
		this.#analyser = null;
		if (this.#ctx && this.#ctx.state !== 'closed') void this.#ctx.close();
		this.#ctx = null;
		this.status = 'idle';
		this.message = '';
		this.devices = [];
		this.deviceId = '';
		this.deviceLabel = '';
		this.level = 0;
		this.hot = false;
		this.tempoBpm = null;
	}

	async #openStream(deviceId?: string) {
		const generation = ++this.#generation;
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
				channelCount: { ideal: 2 },
				...(deviceId ? { deviceId: { exact: deviceId } } : {})
			}
		});
		const ctx = this.#ctx;
		if (generation !== this.#generation || !ctx) {
			for (const track of stream.getTracks()) track.stop();
			return;
		}

		this.#teardownStream();
		const track = stream.getAudioTracks()[0];
		track?.addEventListener('ended', this.#onTrackEnded);
		this.#stream = stream;
		this.#source = ctx.createMediaStreamSource(stream);
		if (!this.#analyser) {
			this.#analyser = ctx.createAnalyser();
			this.#analyser.fftSize = FFT;
			this.#analyser.smoothingTimeConstant = 0.2;
		}
		// Analyser only. Never connected to ctx.destination, so nothing comes out of the speakers.
		this.#source.connect(this.#analyser);
		if (ctx.state === 'suspended') await ctx.resume();

		const settings = track?.getSettings() ?? {};
		this.deviceId = settings.deviceId ?? deviceId ?? '';
		this.deviceLabel = track?.label ?? '';
		this.status = 'running';
		this.message = '';
		this.#ensureMeter();
		await this.#refreshDevices();
	}

	#ensureMeter() {
		if (this.#timer || !this.#analyser) return;
		const buffer = new Float32Array(this.#analyser.fftSize);
		this.#timer = setInterval(() => {
			const analyser = this.#analyser;
			if (!analyser) return;
			analyser.getFloatTimeDomainData(buffer);
			let sum = 0;
			for (const sample of buffer) sum += sample * sample;
			const rms = Math.sqrt(sum / buffer.length);
			const now = performance.now();
			this.level = Math.max(0, Math.min(1, rms * 4));
			this.#samples.push({ at: now, rms });
			if (this.#samples.length > 80) this.#samples.shift();

			if (this.#baseline === null && now - this.#armedAt > 280) {
				const armWindow = this.#samples.filter((sample) => sample.at >= this.#armedAt);
				if (armWindow.length >= 3) {
					const sorted = armWindow.map((sample) => sample.rms).sort((a, b) => a - b);
					this.#baseline = sorted[Math.floor(sorted.length / 2)];
				}
			}

			const floor = (this.#baseline ?? 0) + 0.05;
			if (rms >= Math.max(0.06, floor)) {
				if (!this.#above && (this.#onsets.at(-1) ?? 0) < now - 280) this.#onsets.push(now);
				this.#above = true;
			} else if (rms < Math.max(0.04, floor * 0.6)) {
				this.#above = false;
			}
			if (this.#onsets.length > 12) this.#onsets.shift();
			this.tempoBpm = tempoHint(this.#onsets);

			if (
				!this.hot &&
				this.#baseline !== null &&
				sustainedAbove(this.#samples, this.#baseline, this.#sustainMs, now)
			) {
				this.hot = true;
				this.confirmSerial += 1;
			}
		}, 70);
	}

	#teardownStream() {
		this.#source?.disconnect();
		this.#source = null;
		if (this.#stream) {
			for (const track of this.#stream.getTracks()) {
				track.removeEventListener('ended', this.#onTrackEnded);
				track.stop();
			}
			this.#stream = null;
		}
	}

	async #listInputs(): Promise<AudioDeviceInfo[]> {
		const all = await navigator.mediaDevices.enumerateDevices();
		return all
			.filter(
				(device) =>
					device.kind === 'audioinput' &&
					device.deviceId !== 'default' &&
					device.deviceId !== 'communications'
			)
			.map((device, index) => ({
				deviceId: device.deviceId,
				label: device.label || `Audio input ${index + 1}`
			}));
	}

	async #refreshDevices(): Promise<AudioDeviceInfo[]> {
		const list = await this.#listInputs();
		if (this.status === 'running') this.devices = list;
		return list;
	}

	#onDeviceChange = async () => {
		if (this.status === 'idle') return;
		try {
			const list = await this.#refreshDevices();
			if (
				this.status === 'disconnected' &&
				list.some((device) => device.deviceId === this.deviceId)
			) {
				await this.#openStream(this.deviceId);
			}
		} catch (err) {
			this.#fail(err);
		}
	};

	#onTrackEnded = () => {
		if (this.status !== 'running') return;
		this.#teardownStream();
		this.status = 'disconnected';
		this.message = 'The input disconnected. Plug the SP back in, or pick another input.';
	};

	#fail(err: unknown) {
		this.#teardownStream();
		const name = err instanceof Error ? err.name : '';
		if (name === 'NotAllowedError' || name === 'SecurityError') {
			this.status = 'denied';
			this.message =
				'The browser blocked the audio input. Allow the microphone for this site, then press Listen again. Nothing is sent to the speakers.';
		} else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
			this.status = 'no-device';
			this.message = 'No audio input found. Connect the SP with USB, then press Listen again.';
		} else {
			this.status = 'error';
			this.message = `Couldn’t open the input: ${err instanceof Error ? err.message : String(err)}`;
		}
	}
}

export const audioStore = new AudioInputStore();
