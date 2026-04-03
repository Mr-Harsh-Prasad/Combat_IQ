/**
 * voice.ts
 * Voice command recognition + Text-to-Speech for TKD AI Coach.
 *
 * Commands recognized:
 *   "start"   → start the tracking session
 *   "stop"    → stop the tracking session
 *   "analyze" → request an immediate AI analysis
 *   "repeat"  → repeat the last verdict aloud
 *   "pause"   → alias for stop
 *
 * Uses the Web Speech API (SpeechRecognition + SpeechSynthesis).
 * Both are available on Android Chrome 33+ and iOS Safari 14.1+.
 */

export type VoiceCommand = 'start' | 'stop' | 'analyze' | 'repeat';

export interface VoiceController {
  startListening: () => void;
  stopListening:  () => void;
  speak:          (text: string, interrupt?: boolean) => void;
  isSupported:    boolean;
}

// ─── Type shims for Web Speech API (not in default TS lib) ─────────────────

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror:  ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend:    (() => void) | null;
  start():  void;
  stop():   void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const SpeechRecognitionAPI: SpeechRecognitionConstructor | undefined =
  (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
  (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

// ─── Command matching ─────────────────────────────────────────────────────

const COMMAND_MAP: Record<string, VoiceCommand> = {
  start:   'start',
  begin:   'start',
  go:      'start',
  stop:    'stop',
  pause:   'stop',
  end:     'stop',
  analyze: 'analyze',
  analysis:'analyze',
  check:   'analyze',
  scan:    'analyze',
  repeat:  'repeat',
  again:   'repeat',
  replay:  'repeat',
};

function matchCommand(transcript: string): VoiceCommand | null {
  const words = transcript.toLowerCase().trim().split(/\s+/);
  for (const word of words) {
    if (COMMAND_MAP[word]) return COMMAND_MAP[word];
  }
  return null;
}

// ─── Factory ──────────────────────────────────────────────────────────────

/**
 * Creates a VoiceController instance. Call `startListening()` to begin
 * continuous recognition and `speak(text)` to read verdicts aloud.
 *
 * @param onCommand - Callback fired when a command is recognized
 * @param onTranscript - Optional callback for raw transcript (for UI display)
 */
export function createVoiceController(
  onCommand: (cmd: VoiceCommand) => void,
  onTranscript?: (text: string) => void,
): VoiceController {
  const isSupported = !!SpeechRecognitionAPI && !!window.speechSynthesis;

  if (!isSupported) {
    console.warn('[Voice] Web Speech API not supported in this browser.');
    return {
      startListening: () => {},
      stopListening:  () => {},
      speak:          () => {},
      isSupported:    false,
    };
  }

  // ── SpeechRecognition setup ──────────────────────────────────────────────
  const recognition = new SpeechRecognitionAPI() as SpeechRecognitionInstance;
  recognition.continuous     = true;
  recognition.interimResults = false;
  recognition.lang           = 'en-US';
  recognition.maxAlternatives = 3;

  let isListening = false;
  let shouldRestart = false;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      console.log('[Voice] Heard:', transcript);
      onTranscript?.(transcript);

      const cmd = matchCommand(transcript);
      if (cmd) {
        console.log('[Voice] Command:', cmd);
        onCommand(cmd);
      }
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    // 'no-speech' and 'aborted' are non-fatal — just restart
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.warn('[Voice] Recognition error:', event.error);
    }
  };

  recognition.onend = () => {
    isListening = false;
    // Auto-restart to keep continuous listening
    if (shouldRestart) {
      setTimeout(() => {
        try { recognition.start(); isListening = true; } catch { /* already started */ }
      }, 300);
    }
  };

  // ── TTS setup ────────────────────────────────────────────────────────────

  function speak(text: string, interrupt = true) {
    if (!window.speechSynthesis) return;
    if (interrupt) window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang  = 'en-US';
    utterance.rate  = 0.92;   // slightly slower for clarity mid-kick
    utterance.pitch = 0.85;   // deeper, more authoritative
    utterance.volume = 1;

    // Pick a deep male voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith('en') &&
      (v.name.includes('Male') || v.name.includes('Daniel') || v.name.includes('Google UK'))
    );
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  }

  return {
    isSupported,
    startListening() {
      if (isListening) return;
      shouldRestart = true;
      try {
        recognition.start();
        isListening = true;
        console.log('[Voice] Listening for commands...');
      } catch (err) {
        console.warn('[Voice] Could not start recognition:', err);
      }
    },
    stopListening() {
      shouldRestart = false;
      try { recognition.stop(); } catch { /* ignore */ }
      isListening = false;
    },
    speak,
  };
}
