"use client";

import { useCallback, useId, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  MAX_TIME_MINUTES,
  MIN_TIME_MINUTES,
  TIME_STEP_MINUTES,
  minutesToTime,
  normalizeTime,
  parseTimeToMinutes,
} from "@/lib/skp";

// Used only for handle placement when no time is recorded yet. The first
// drag or click adopts these values, which the user can then adjust.
const FALLBACK_START_MINUTES = 8 * 60;
const FALLBACK_END_MINUTES = 17 * 60;
const MINUTE_RANGE = MAX_TIME_MINUTES - MIN_TIME_MINUTES;

type TimeRangeSliderProps = {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  disabled?: boolean;
};

function snapToStep(minutes: number): number {
  const snapped = Math.round(minutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return Math.min(Math.max(snapped, MIN_TIME_MINUTES), MAX_TIME_MINUTES);
}

export function TimeRangeSlider({ start, end, onChange, disabled = false }: TimeRangeSliderProps) {
  const titleId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activeThumb = useRef<"start" | "end" | null>(null);

  const startValue = normalizeTime(start) ?? "";
  const endValue = normalizeTime(end) ?? "";
  const startMinutes = parseTimeToMinutes(startValue) ?? FALLBACK_START_MINUTES;
  const endMinutes = parseTimeToMinutes(endValue) ?? FALLBACK_END_MINUTES;

  const moveThumb = useCallback((thumb: "start" | "end", value: number) => {
    if (thumb === "start") {
      // The start handle stops one step before the end handle.
      onChange(minutesToTime(Math.min(value, endMinutes - TIME_STEP_MINUTES)), minutesToTime(endMinutes));
    } else {
      onChange(minutesToTime(startMinutes), minutesToTime(Math.max(value, startMinutes + TIME_STEP_MINUTES)));
    }
  }, [endMinutes, onChange, startMinutes]);

  const valueFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return MIN_TIME_MINUTES;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return MIN_TIME_MINUTES;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    return snapToStep(MIN_TIME_MINUTES + ratio * MINUTE_RANGE);
  }, []);

  function beginDrag(thumb: "start" | "end", event: PointerEvent<HTMLElement>) {
    if (disabled) return;
    event.preventDefault();
    activeThumb.current = thumb;
    try {
      // Pointer capture is best-effort: some browsers reject it for an
      // already-released pointer. Dragging still works without capture.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore and keep dragging.
    }
    moveThumb(thumb, valueFromClientX(event.clientX));
  }

  function handleThumbPointerDown(thumb: "start" | "end", event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    beginDrag(thumb, event);
    event.currentTarget.focus();
  }

  function handleTrackPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const value = valueFromClientX(event.clientX);
    const thumb = Math.abs(value - startMinutes) <= Math.abs(value - endMinutes) ? "start" : "end";
    beginDrag(thumb, event);
  }

  // Moves from a captured thumb still bubble here, so one handler serves both.
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !activeThumb.current) return;
    event.preventDefault();
    moveThumb(activeThumb.current, valueFromClientX(event.clientX));
  }

  function handlePointerEnd() {
    activeThumb.current = null;
  }

  function handleThumbKeyDown(thumb: "start" | "end", event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const current = thumb === "start" ? startMinutes : endMinutes;
    let next: number;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = current - TIME_STEP_MINUTES;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = current + TIME_STEP_MINUTES;
        break;
      case "PageDown":
        next = current - 30;
        break;
      case "PageUp":
        next = current + 30;
        break;
      case "Home":
        next = MIN_TIME_MINUTES;
        break;
      case "End":
        next = MAX_TIME_MINUTES;
        break;
      default:
        return;
    }

    event.preventDefault();
    moveThumb(thumb, snapToStep(next));
  }

  const startRatio = (startMinutes - MIN_TIME_MINUTES) / MINUTE_RANGE;
  const endRatio = (endMinutes - MIN_TIME_MINUTES) / MINUTE_RANGE;
  const fillLeft = Math.min(startRatio, endRatio) * 100;
  const fillWidth = Math.abs(endRatio - startRatio) * 100;

  return (
    <div className="time-range">
      <span className="time-range-title" id={titleId}>Waktu Mulai-Selesai</span>
      <div className="time-range-box" role="group" aria-labelledby={titleId}>
        <div className="time-range-values">
          <input
            className="time-range-input"
            type="time"
            aria-label="Waktu mulai"
            value={startValue}
            disabled={disabled}
            onChange={event => onChange(event.target.value, endValue)}
          />
          <input
            className="time-range-input"
            type="time"
            aria-label="Waktu selesai"
            value={endValue}
            disabled={disabled}
            onChange={event => onChange(startValue, event.target.value)}
          />
        </div>
        <div
          className="time-range-track"
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="time-range-fill" style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }} />
          <button
            type="button"
            role="slider"
            className="time-range-thumb"
            style={{ left: `${startRatio * 100}%` }}
            aria-label="Waktu mulai"
            aria-orientation="horizontal"
            aria-valuemin={MIN_TIME_MINUTES}
            aria-valuemax={MAX_TIME_MINUTES}
            aria-valuenow={startMinutes}
            aria-valuetext={startValue ? minutesToTime(startMinutes) : "Belum diisi"}
            disabled={disabled}
            onPointerDown={event => handleThumbPointerDown("start", event)}
            onKeyDown={event => handleThumbKeyDown("start", event)}
          >
            <span className="time-range-grip" aria-hidden="true" />
            <span className="time-range-grip" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="slider"
            className="time-range-thumb"
            style={{ left: `${endRatio * 100}%` }}
            aria-label="Waktu selesai"
            aria-orientation="horizontal"
            aria-valuemin={MIN_TIME_MINUTES}
            aria-valuemax={MAX_TIME_MINUTES}
            aria-valuenow={endMinutes}
            aria-valuetext={endValue ? minutesToTime(endMinutes) : "Belum diisi"}
            disabled={disabled}
            onPointerDown={event => handleThumbPointerDown("end", event)}
            onKeyDown={event => handleThumbKeyDown("end", event)}
          >
            <span className="time-range-grip" aria-hidden="true" />
            <span className="time-range-grip" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
