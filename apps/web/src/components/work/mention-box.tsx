"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Naming somebody in a comment.
//
// A mention is stored as @[Full Name](user id). The name is in the text so the comment still reads
// properly anywhere that knows nothing about mentions - an email, a notification body, an export - and the
// id is there so the person is reached even if they are later renamed.

const PATTERN = /@\[([^\]]{1,80})\]\(([A-Za-z0-9_-]{1,80})\)/g;

interface Person {
  userId: string;
  fullName: string;
  capid?: string | null;
  availability?: "ACTIVE" | "LEAVE" | "INACTIVE";
}

/** Shows a stored comment with its mentions as names rather than markup. */
export function renderMentions(body: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(PATTERN.source, "g");
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > last) parts.push(body.slice(last, match.index));
    parts.push(<span key={match.index} className="mb-chip">@{match[1]}</span>);
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts.length ? parts : body;
}

export function MentionBox({
  value,
  onChange,
  onSend,
  placeholder = "Write a comment… type @ to name somebody"
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  // Where the @ was typed, so the chosen name replaces what was typed after it and nothing else.
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!at || people.length) return;
    fetch("/api/directory")
      .then((response) => response.json() as Promise<{ people?: Person[] }>)
      .then((data) => setPeople((data.people ?? []).filter((person) => person.userId)))
      .catch(() => undefined);
  }, [at, people.length]);

  const matches = at
    ? people
        .filter((person) => person.fullName.toLowerCase().includes(at.query.toLowerCase()))
        // Somebody on leave can still be named - it is a conversation, not an assignment - but the people
        // who can act come first.
        .sort((left, right) => Number(left.availability && left.availability !== "ACTIVE") - Number(right.availability && right.availability !== "ACTIVE"))
        .slice(0, 6)
    : [];

  function read(element: HTMLTextAreaElement) {
    const caret = element.selectionStart ?? 0;
    const before = element.value.slice(0, caret);
    // An @ that starts a word, with no space since - anything else is an email address or a stray @.
    const found = /(^|\s)@([\p{L}\s'-]{0,40})$/u.exec(before);
    setAt(found ? { start: caret - found[2].length - 1, query: found[2] } : null);
    setHighlighted(0);
  }

  function choose(person: Person) {
    if (!at) return;
    const element = ref.current;
    const caret = element?.selectionStart ?? value.length;
    const next = value.slice(0, at.start) + "@[" + person.fullName + "](" + person.userId + ") " + value.slice(caret);
    onChange(next);
    setAt(null);
    window.requestAnimationFrame(() => {
      element?.focus();
      const position = at.start + person.fullName.length + person.userId.length + 5;
      element?.setSelectionRange(position, position);
    });
  }

  return (
    <div className="mb">
      <style>{mbCss}</style>
      <textarea
        ref={ref}
        rows={3}
        value={value}
        placeholder={placeholder}
        aria-label="Comment"
        onChange={(event) => { onChange(event.target.value); read(event.target); }}
        onClick={(event) => read(event.currentTarget)}
        onKeyUp={(event) => { if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) read(event.currentTarget); }}
        onKeyDown={(event) => {
          if (at && matches.length) {
            if (event.key === "ArrowDown") { event.preventDefault(); setHighlighted((index) => (index + 1) % matches.length); return; }
            if (event.key === "ArrowUp") { event.preventDefault(); setHighlighted((index) => (index - 1 + matches.length) % matches.length); return; }
            if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(matches[highlighted]); return; }
            if (event.key === "Escape") { setAt(null); return; }
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); onSend(); }
        }}
      />
      {at && matches.length ? (
        <ul className="mb-list" role="listbox">
          {matches.map((person, index) => (
            <li key={person.userId}>
              <button
                type="button"
                className={"mb-option" + (index === highlighted ? " is-on" : "")}
                onMouseDown={(event) => { event.preventDefault(); choose(person); }}
              >
                <span className="mb-name">{person.fullName}</span>
                {person.availability && person.availability !== "ACTIVE"
                  ? <span className="mb-away">{person.availability === "LEAVE" ? "on leave" : "inactive"}</span>
                  : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const mbCss = [
  ".mb{position:relative;display:flex;flex-direction:column}",
  ".mb textarea{width:100%;box-sizing:border-box}",
  ".mb-list{position:absolute;bottom:calc(100% + 4px);left:0;right:0;z-index:40;margin:0;padding:5px;list-style:none;border-radius:10px;border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff);box-shadow:0 14px 34px rgba(9,20,44,.24);max-height:210px;overflow-y:auto}",
  "html[data-theme=dark] .mb-list{background:#26272b;border-color:#3a3c42}",
  ".mb-option{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:none;color:inherit;font:inherit;font-size:13.5px;padding:7px 9px;border-radius:7px;cursor:pointer}",
  ".mb-option:hover,.mb-option.is-on{background:rgba(123,104,238,.16)}",
  ".mb-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mb-away{font-size:11px;opacity:.6;flex:none}",
  ".mb-chip{background:rgba(123,104,238,.16);color:#5f55ee;border-radius:5px;padding:1px 4px;font-weight:600}",
  "html[data-theme=dark] .mb-chip{color:#b9b1ff}"
].join("");
