/**
 * Checks the SP-404 MIDI decoder against the v5.50 note map and CC table,
 * and the audio helpers against steady vs wobbly onsets.
 */
import { decodeMessage, matchesListen, MODE_A_PAD_BY_NOTE } from '../src/lib/sense/decode.ts';
import { sustainedAbove, tempoHint } from '../src/lib/sense/level.ts';

const errors: string[] = [];

function check(name: string, ok: boolean) {
	if (!ok) errors.push(name);
}

const noteOn = (channel: number, note: number, velocity = 100) => [
	0x90 | (channel - 1),
	note,
	velocity
];

check('pad 13 is note 36', decodeMessage(noteOn(1, 36))?.pad === 13);
check('pad 1 is note 48', decodeMessage(noteOn(1, 48))?.pad === 1);
check('pad 4 is note 51', decodeMessage(noteOn(1, 51))?.pad === 4);
check('pad 16 is note 39', decodeMessage(noteOn(1, 39))?.pad === 16);
check('bank J is channel 10', decodeMessage(noteOn(10, 48))?.bank === 'J');
check('note 35 is EXT SOURCE', decodeMessage(noteOn(1, 35))?.kind === 'ext');
check('velocity 0 is ignored', decodeMessage(noteOn(1, 36, 0)) === null);
check('every mode A pad note is unique', new Set(Object.values(MODE_A_PAD_BY_NOTE)).size === 16);

check('any pad matches', matchesListen({ type: 'any-pad' }, decodeMessage(noteOn(2, 40))!));
check('mode B note still counts as a pad', decodeMessage(noteOn(3, 60))?.kind === 'pad');
check('mode B does not invent a pad number', decodeMessage(noteOn(3, 60))?.pad === undefined);

check('CC16 is CTRL 1', decodeMessage([0xb0, 16, 40])?.controls[0] === 'CTRL 1');
check('CC8 is crossfade', decodeMessage([0xb0, 8, 10])?.kind === 'dj-xfade');
check('CC20 ch1 play', decodeMessage([0xb0, 20, 127])?.kind === 'dj-play');
check('CC20 pause is not play', decodeMessage([0xb0, 20, 0])?.kind !== 'dj-play');
check('CC22 ch2 sync', matchesListen({ type: 'dj-sync' }, decodeMessage([0xb1, 22, 127])!));
check('program change is ignored', decodeMessage([0xc0, 4, 0]) === null);
check('clock is clock', decodeMessage([0xf8])?.kind === 'clock');

check('steady onsets hint 120', tempoHint([0, 500, 1000, 1500, 2000, 2500]) === 120);
check('wobbly onsets stay quiet', tempoHint([0, 400, 900, 1500, 2300, 2800]) === null);

const samples = [0, 100, 200, 300, 400, 500, 600].map((at) => ({ at, rms: 0.2 }));
check('sustained rise confirms', sustainedAbove(samples, 0.02, 500, 600));
check('already-loud baseline does not', !sustainedAbove(samples, 0.2, 500, 600));

if (errors.length) {
	console.error(`❌ Sense checks failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
	process.exit(1);
}
console.log('✅ SP-404 sense checks (MIDI map + level/tempo).');
