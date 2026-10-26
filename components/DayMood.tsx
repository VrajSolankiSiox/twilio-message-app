"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { GREETING, type DayPhase } from "@/lib/day-phase";
import "./DayMood.css";

const RAYS = [-16, -9, -3, 2, 8, 14, 21];
const MOTES: Array<[number, number, number]> = [
  [18, 28, 6],
  [26, 46, 11],
  [34, 22, 4],
  [42, 58, 15],
  [55, 34, 8],
  [63, 18, 13],
  [71, 48, 5],
  [78, 30, 9],
  [48, 16, 17],
  [22, 64, 7],
];

export interface DayMoodFact {
  label?: string;
  value: string | number;
}

export interface DayMoodProps {
  phase?: DayPhase;
  name?: string;
  scope?: string;
  facts?: DayMoodFact[];
}

export default function DayMood({
  phase = "morning",
  name,
  scope,
  facts = [],
}: DayMoodProps) {
  const mood: DayPhase = GREETING[phase] ? phase : "morning";
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleFacts = facts.filter(
    (fact) => fact && (fact.value !== "" && fact.value !== null && fact.value !== undefined)
  );

  return (
    <section
      className={`mood mood--${mood}${entering ? " mood--enter" : ""}`}
      aria-label={GREETING[mood]}
    >
      <div className="mood-sky" aria-hidden="true">
        <div className="mood-haze" />
        <div className="mood-rays">
          {RAYS.map((angle) => (
            <span
              key={angle}
              className="mood-ray"
              style={{ "--ray": `${angle}deg` } as CSSProperties}
            />
          ))}
        </div>
        <div className="mood-orb mood-sun" />
        <div className="mood-orb mood-moon">
          <span className="mood-moon-face" />
        </div>
        <div className="mood-clouds">
          <span />
          <span />
          <span />
        </div>
        <div className="mood-ground" />
        <div className="mood-motes">
          {MOTES.map(([x, y, delay], i) => (
            <span
              key={i}
              style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}s` }}
            />
          ))}
        </div>
        <div className="mood-stars">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <div className="mood-body">
        <div className="mood-copy">
          <p className="mood-greet">
            {GREETING[mood]}
            {name ? <span className="mood-name">, {name}</span> : null}
          </p>
          {scope ? <p className="mood-scope">{scope}</p> : null}
        </div>
        {visibleFacts.length > 0 && (
          <ul className="mood-facts">
            {visibleFacts.map((fact) => (
              <li key={`${fact.label ?? "note"}-${String(fact.value)}`}>
                <strong>{fact.value}</strong>
                {fact.label ? <span>{fact.label}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
