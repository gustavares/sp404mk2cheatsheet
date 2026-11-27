<script lang="ts">
	import { audioStore } from '#lib/stores/audio.svelte.js';
	import { midiStore } from '#lib/stores/midi.svelte.js';
	import { Cable, Headphones, Unplug } from '@lucide/svelte';

	const bars = $derived(Math.round(audioStore.level * 12));
	const meterSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
</script>

<section class="link" aria-label="Optional connection to the SP-404">
	<div class="link__row">
		{#if midiStore.status === 'connected'}
			<button type="button" class="link__btn link__btn--on" onclick={() => midiStore.disconnect()}>
				<Unplug size={14} />
				MIDI connected
			</button>
		{:else}
			<button
				type="button"
				class="link__btn"
				disabled={midiStore.status === 'requesting'}
				onclick={() => midiStore.connect()}
			>
				<Cable size={14} />
				{midiStore.status === 'requesting' ? 'Waiting…' : 'Connect SP-404'}
			</button>
		{/if}

		{#if audioStore.isRunning}
			<button type="button" class="link__btn link__btn--on" onclick={() => audioStore.stop()}>
				<Headphones size={14} />
				Listening
			</button>
		{:else}
			<button
				type="button"
				class="link__btn"
				disabled={audioStore.status === 'requesting'}
				onclick={() => audioStore.start()}
			>
				<Headphones size={14} />
				{audioStore.status === 'requesting' ? 'Waiting…' : 'Listen to the SP'}
			</button>
		{/if}

		{#if audioStore.isRunning}
			<div class="meter" aria-hidden="true" title="Input level. Nothing is sent to the speakers.">
				{#each meterSlots as index (index)}
					<span class:meter__on={index < bars}></span>
				{/each}
			</div>
			{#if audioStore.tempoBpm}
				<p class="hint">About {audioStore.tempoBpm} BPM, if the hits stay even.</p>
			{/if}
		{/if}
	</div>
	<p class="status">
		Optional, and only if you want the page to notice. Chrome or Edge for MIDI. The meter never goes
		to the speakers. Done / Next always works.
	</p>

	{#if midiStore.status === 'connected'}
		<label class="pick">
			<span class="visually-hidden">MIDI input</span>
			<select
				value={midiStore.inputId}
				onchange={(event) => midiStore.selectInput(event.currentTarget.value)}
			>
				<option value="">Choose the SP-404 port</option>
				{#each midiStore.inputs as port (port.id)}
					<option value={port.id}>{port.name}{port.connected ? '' : ' (unplugged)'}</option>
				{/each}
			</select>
		</label>
		<p class="status">
			{#if midiStore.inputReady}
				Hearing {midiStore.portName}.
				{#if midiStore.lastHit}
					Last: {midiStore.lastHit.label}.
				{:else}
					Waiting for a pad or a knob. If a pad stays dark, PAD Note Out may be off (SHIFT + pad 13,
					then SYSTEM). The manual says those notes leave the MIDI OUT jack, so USB still needs a
					check on your unit.
				{/if}
				{#if midiStore.clockSeen}
					MIDI clock is arriving (Sync Out is on).
				{/if}
			{:else}
				No SP-404 port picked itself. Choose it above if you see it in the list. A 5-pin MIDI cable
				does not reach the browser; this is the USB port.
			{/if}
		</p>
	{/if}

	{#if audioStore.isRunning && audioStore.devices.length > 1}
		<label class="pick">
			<span class="visually-hidden">Audio input</span>
			<select
				value={audioStore.deviceId}
				onchange={(event) => audioStore.selectDevice(event.currentTarget.value)}
			>
				{#each audioStore.devices as device (device.deviceId)}
					<option value={device.deviceId}>{device.label}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if midiStore.message || audioStore.message}
		<p class="status status--warn">{midiStore.message || audioStore.message}</p>
	{/if}
	{#if midiStore.note}
		<p class="status">{midiStore.note}</p>
	{/if}
</section>

<style>
	.link {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin: 0.75rem 0 0.9rem;
		padding: 0.7rem 0.8rem;
		background: #10141b;
		border: 1px solid #262c38;
		border-radius: 0.65rem;
	}

	.link__row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
	}

	.link__btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.7rem;
		border-radius: 999px;
		border: 1px solid #334155;
		background: #171b22;
		color: #e2e8f0;
		font-size: 0.78rem;
		font-weight: 800;
		cursor: pointer;
	}

	.link__btn:hover:not(:disabled) {
		border-color: #ea580c;
		color: #fff;
	}

	.link__btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.link__btn--on {
		border-color: rgba(234, 88, 12, 0.7);
		background: rgba(234, 88, 12, 0.16);
		color: #ffedd5;
	}

	.pick select {
		width: 100%;
		padding: 0.35rem 0.5rem;
		border-radius: 0.4rem;
		border: 1px solid #334155;
		background: #0b0d12;
		color: #e2e8f0;
		font-size: 0.78rem;
	}

	.status {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.4;
		color: #94a3b8;
	}

	.status--warn {
		color: #fdba74;
	}

	.hint {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 700;
		color: #7dd3fc;
	}

	.meter {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 1rem;
	}

	.meter span {
		width: 4px;
		height: 35%;
		border-radius: 1px;
		background: #1e293b;
	}

	.meter span:nth-child(n + 5) {
		height: 60%;
	}

	.meter span:nth-child(n + 9) {
		height: 100%;
	}

	.meter__on {
		background: #fb923c !important;
	}
</style>
