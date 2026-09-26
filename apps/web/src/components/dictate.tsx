"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

// Talking instead of typing, in any browser.
//
// Two paths, and the free one is always tried first. Chrome, Edge and Safari each have their own speech
// service: the audio goes straight from the browser to them, costs the squadron nothing, and never touches
// the Hub. That is the path everybody should be on.
//
// The Web Speech API needs a key that only those browsers ship, so Firefox has none at all, and the other
// Chromium browsers - DuckDuckGo, Brave, Vivaldi - have the API and no key, which fails in a way that looks
// like the Hub is broken. Those record the audio and send it to the Hub to transcribe, which works
// everywhere and is billed to the squadron. Hence the order: never pay for what the browser will do free.
//
// The fallback is only chosen when the browser has proved it cannot, not when we guess it cannot - and once
// it has proved it, it is remembered, so nobody sits through the same failure twice.

const REMEMBER_KEY = "hub-dictate-native-failed";
/** A stuck microphone is the failure worth designing against, so recording stops on its own. */
const MAX_SECONDS = 60;

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const holder = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  return typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";
}

function nativeKnownBad(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberNativeBad(): void {
  try { localStorage.setItem(REMEMBER_KEY, "1"); } catch { /* private window */ }
}

export function Dictate({ onText, label = "Dictate", compact = false }: {
  /** Called with each finished phrase. The caller decides whether to append or replace. */
  onText: (text: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const [usable, setUsable] = useState(false);
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const engine = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so the running recogniser always calls the newest handler rather than the one it was
  // created with, which is how a dictated sentence ends up appended to a stale copy of the field.
  const sink = useRef(onText);
  sink.current = onText;

  useEffect(() => {
    setUsable(Boolean(recognitionClass()) || canRecord());
    return () => {
      try { engine.current?.stop(); } catch { /* already stopped */ }
      try { recorder.current?.stop(); } catch { /* already stopped */ }
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // ---------------------------------------------------------------- the browser's own, tried first
  function startNative(): boolean {
    const Engine = recognitionClass();
    if (!Engine) return false;

    const instance = new Engine();
    instance.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    instance.continuous = true;
    instance.interimResults = false;

    instance.onresult = (event) => {
      let said = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) said += result[0].transcript;
      }
      if (said.trim()) sink.current(said.trim());
    };

    instance.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setProblem("Your browser blocked the microphone. Allow it for this site and try again.");
        setListening(false);
        return;
      }
      if (event.error === "network") {
        // This browser has the speech API and not the key for it. Remembered, so it is the last time
        // anybody here sits through it, and the recording path takes over from now on.
        rememberNativeBad();
        setListening(false);
        setProblem(null);
        startRecording();
        return;
      }
      if (event.error === "no-speech") setProblem("Nothing was heard.");
      else if (event.error !== "aborted") setProblem("That did not work.");
      setListening(false);
    };

    instance.onend = () => setListening(false);

    try {
      instance.start();
      engine.current = instance;
      setListening(true);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- recording, for the ones that cannot
  async function startRecording() {
    if (!canRecord()) {
      setProblem("This browser cannot record audio. Chrome, Edge or Safari will work.");
      return;
    }
    setProblem(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const instance = new MediaRecorder(stream);
      chunks.current = [];

      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };

      instance.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setListening(false);
        const blob = new Blob(chunks.current, { type: instance.mimeType || "audio/webm" });
        chunks.current = [];
        if (blob.size < 1200) {
          setProblem("Nothing was recorded.");
          return;
        }

        setWorking(true);
        try {
          const response = await fetch("/api/dictate", {
            method: "POST",
            headers: { "Content-Type": blob.type || "audio/webm" },
            body: blob
          });
          const data = (await response.json().catch(() => ({}))) as { text?: string; message?: string };
          if (!response.ok) throw new Error(data.message || "That could not be transcribed.");
          if (data.text) sink.current(data.text);
          else setProblem(data.message ?? "Nothing could be made out of that.");
        } catch (caught) {
          setProblem(caught instanceof Error ? caught.message : "That could not be transcribed.");
        } finally {
          setWorking(false);
        }
      };

      instance.start();
      recorder.current = instance;
      setListening(true);
      timer.current = setTimeout(() => {
        try { instance.stop(); } catch { /* already stopped */ }
      }, MAX_SECONDS * 1000);
    } catch {
      setProblem("The microphone could not be started. Check the browser has permission.");
      setListening(false);
    }
  }

  function start() {
    setProblem(null);
    // Free first, always. The recorder is only for browsers that have already shown they cannot.
    if (!nativeKnownBad() && startNative()) return;
    startRecording();
  }

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    try { engine.current?.stop(); } catch { /* already stopped */ }
    try { if (recorder.current?.state === "recording") recorder.current.stop(); } catch { /* already stopped */ }
    setListening(false);
  }

  if (!usable) return null;

  return (
    <>
      <button
        type="button"
        className={"dictate" + (listening ? " is-live" : "") + (compact ? " dictate--compact" : "")}
        onClick={() => (listening ? stop() : start())}
        disabled={working}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictating" : label}
        title={listening ? "Stop dictating" : label}
      >
        {listening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
        {compact ? null : <span>{working ? "Writing it down…" : listening ? "Listening…" : label}</span>}
      </button>
      {problem ? <span className="dictate-problem" role="status">{problem}</span> : null}
      <style>{dictateCss}</style>
    </>
  );
}

const dictateCss = [
  ".dictate{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer;white-space:nowrap}",
  ".dictate--compact{padding:6px 8px}",
  ".dictate:hover{border-color:#7b68ee}",
  ".dictate:disabled{opacity:.6;cursor:default}",
  // Listening has to be obvious. A microphone that is on and does not look on is a privacy problem.
  ".dictate.is-live{background:#d03b3b;border-color:#d03b3b;color:#fff;animation:dictate-pulse 1.6s ease-in-out infinite}",
  "@keyframes dictate-pulse{0%,100%{opacity:1}50%{opacity:.72}}",
  "@media (prefers-reduced-motion:reduce){.dictate.is-live{animation:none}}",
  ".dictate-problem{font-size:12px;color:#d03b3b}"
].join("");
