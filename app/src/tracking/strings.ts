import { getLocales } from 'expo-localization';

const en = {
  recordingTitle: 'Recording your drive',
  recordingBody: 'Roadclaim records this drive. Keep your eyes on the road.',
  waitingTitle: 'Paused while you are stopped',
  waitingBody: 'Recording continues when you drive on.',
  finishedTitle: 'Drive finished',
  finishedBody: '{distance} from {from} to {to}. Tap to see your stats.',
  finishedBodyShort: '{distance} recorded. Tap to see your stats.',
  done: 'Done',
  stillDriving: 'Still driving',
  channel: 'Drives',
};

const de: typeof en = {
  recordingTitle: 'Deine Fahrt wird aufgezeichnet',
  recordingBody: 'Roadclaim zeichnet diese Fahrt auf. Achte auf die Straße.',
  waitingTitle: 'Pausiert, solange du stehst',
  waitingBody: 'Die Aufzeichnung geht weiter, sobald du losfährst.',
  finishedTitle: 'Fahrt beendet',
  finishedBody: '{distance} von {from} nach {to}. Tippe für deine Werte.',
  finishedBodyShort: '{distance} aufgezeichnet. Tippe für deine Werte.',
  done: 'Fertig',
  stillDriving: 'Ich fahre noch',
  channel: 'Fahrten',
};

export function s(key: keyof typeof en, vars: Record<string, string> = {}) {
  const table = getLocales()[0]?.languageCode === 'de' ? de : en;
  return table[key].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
