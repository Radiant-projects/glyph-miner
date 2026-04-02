import { useSignals } from "@preact/signals-react/runtime";
import { useRef, useEffect, useState } from "react";
import { hashrate } from "./signals";

const fixed = (n: number) => n.toFixed(2);

// Exponential moving average for smooth hashrate display
const SMOOTHING_FACTOR = 0.15; // Lower = smoother but slower to react

export default function Hashrate() {
  useSignals();
  const rawValue = hashrate.value;
  const smoothedRef = useRef(rawValue);
  const [displayValue, setDisplayValue] = useState(rawValue);

  useEffect(() => {
    // Apply exponential moving average smoothing
    if (rawValue === 0) {
      smoothedRef.current = 0;
    } else {
      smoothedRef.current = smoothedRef.current * (1 - SMOOTHING_FACTOR) + rawValue * SMOOTHING_FACTOR;
    }
    setDisplayValue(smoothedRef.current);
  }, [rawValue]);

  const value = displayValue;

  if (value > 1000000000) {
    return `${fixed(value / 1000000000)} Gh/s`;
  } else if (value > 1000000) {
    return `${fixed(value / 1000000)} Mh/s`;
  } else if (value > 1000) {
    return `${fixed(value / 1000)} Kh/s`;
  }
  return `${fixed(value)} H/s`;
}
