"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

// Talking instead of typing.
//
// Uses the browser's own speech recognition, which costs nothing, needs no account and sends no audio to the
// Hub or to us. On Chrome and Edge that is Google's service; on Safari it is Apple's. Firefox has none, and
// on Firefox this button simply is not there - a control that does nothing is worse than no control.
//
// Aimed squarely at the phone. Describing a goal, writing a comment on a task in a hangar, or recording what
// a donation was worth are all things somebody does standing up with one hand, and a squadron member typing
// a paragraph on a phone keyboard mostly just does not do it.

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

export function Dictate({ onText, label = "Dictate", compact = false }: {
  /** Called with each finished phrase. The caller decides whether to append or replace. */
  onText: (text: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const engine = useRef<Recognition | null>(null);
  // Held in a ref so the running recogniser always calls the newest handler rather than the one it was
  // created with, which is how a dictated sentence ends up appended to a stale copy of the field.
  const sink = useRef(onText);
  sink.current = onText;

  useEffect(() => {
    setSupported(Boolean(recognitionClass()));
    return () => {
      try { engine.current?.stop(); } catch { /* already stopped */ }
    };
  }, []);

  function start() {
    const Engine = recognitionClass();
    if (!Engine) return;
    setProblem(null);

    const instance = new Engine();
    instance.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    // Keeps going between sentences, so somebody can think mid-thought without it hanging up on them.
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
      // Said plainly. "not-allowed" is the one that actually happens, and it is a browser permission, not a
      // fault in the Hub - telling somebody to check their microphone when the browser blocked it is useless.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setProblem("Your browser blocked the microphone. Allow it for this site and try again.");
      } else if (event.error === "no-speech") {
        setProblem("Nothing was heard.");
      } else if (event.error === "network") {
        setProblem("Speech recognition needs a connection and could not reach it.");
      } else if (event.error !== "aborted") {
        setProblem("That did not work.");
      }
      setListening(false);
    };

    instance.onend = () => setListening(false);

    try {
      instance.start();
      engine.current = instance;
      setListening(true);
    } catch {
      setProblem("The microphone could not be started.");
    }
  }

  function stop() {
    try { engine.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
  }

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        className={"dictate" + (listening ? " is-live" : "") + (compact ? " dictate--compact" : "")}
        onClick={() => (listening ? stop() : start())}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictating" : label}
        title={listening ? "Stop dictating" : label}
      >
        {listening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
        {compact ? null : <span>{listening ? "Listening…" : label}</span>}
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
  // Listening has to be obvious. A microphone that is on and does not look on is a privacy problem.
  ".dictate.is-live{background:#d03b3b;border-color:#d03b3b;color:#fff;animation:dictate-pulse 1.6s ease-in-out infinite}",
  "@keyframes dictate-pulse{0%,100%{opacity:1}50%{opacity:.72}}",
  "@media (prefers-reduced-motion:reduce){.dictate.is-live{animation:none}}",
  ".dictate-problem{font-size:12px;color:#d03b3b}"
].join("");
