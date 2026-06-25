import { useEffect, useLayoutEffect, useRef, useId } from "react";

interface EdcLogoMarkProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

const PETAL_PATHS = [
  "M40.595,105.669c-8.677-13.724-16.314-29.262-21.72-47.64C16.31,49.312,13.962,40,13.115,29.11c-0.969-12.44,0.386-26.477,10.559-28.92c3.232-0.776,7.688,1,10.08,2.28c7.774,4.161,13.416,10.982,18.96,18.12c2.741,3.529,5.02,7.154,7.2,11.4c2.485,4.842,4.94,10.979,4.08,17.76c-0.312,2.453-1.489,4.95-2.521,7.44C54.795,73.326,47.35,89.827,40.595,105.669z",
  "M47.434,108.669c5.987-13.801,11.193-27.285,17.4-40.92c1.929-4.237,3.477-9.505,6-13.32c6.917-10.458,24.385-14.367,41.04-15.12c10.341-0.468,25.571,1.158,25.92,11.76c0.169,5.148-3.074,9.834-5.641,12.96c-8.271,10.074-19.558,17.917-31.199,24.24C84.506,97.203,67.304,104.102,47.434,108.669z",
  "M17.075,75.669c5.155,12.605,11.332,24.187,18.119,35.16c-12.604,1.567-32.716,2.03-35.039-9.36c-0.56-2.747,0.491-6.64,1.68-9.12c1.536-3.207,4.096-6.138,6.6-9c2.44-2.79,5.543-5.281,8.16-7.44C16.731,75.797,16.807,75.681,17.075,75.669z",
  "M85.715,103.629c0.097,0.023,0.119,0.121,0.24,0.12c0.92,9.873,0.559,20.411-3.601,26.64c-4.016,6.015-11.721,5.081-17.76,1.56c-6.547-3.817-13.038-10.661-16.92-16.2C61.546,112.9,74.091,108.727,85.715,103.629z",
];

const DELAYS = [0.25, 0.72, 1.25, 1.62];
const DRAW_DUR = 1.1;
const FILL_LAG = 0.72;

export function EdcLogoMark({
  size = 40,
  animated = true,
  className,
}: EdcLogoMarkProps) {
  const uid = useId().replace(/:/g, "");
  const gradientId = `edcGold-${uid}`;
  const filterId = `edcGlow-${uid}`;
  const groupClassName = `edc-logo-group-${uid}`;
  const breatheClassName = `edc-breathing-${uid}`;

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const petalRefs = useRef<(SVGPathElement | null)[]>([]);
  const groupRef = useRef<SVGGElement | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Set initial animation state synchronously (before paint) to avoid flash.
  // Skip if reduced-motion is preferred — petals will render fully filled via
  // their static attributes and useEffect will not try to restore them.
  useLayoutEffect(() => {
    if (!animated || reducedMotion) return;

    petalRefs.current.forEach((petal) => {
      if (!petal) return;
      const len = petal.getTotalLength();
      petal.style.strokeDasharray = String(len);
      petal.style.strokeDashoffset = String(len);
      petal.style.fillOpacity = "0";
      petal.style.strokeOpacity = "1";
      petal.style.strokeWidth = "1.1";
    });
  }, [animated, reducedMotion]);

  useEffect(() => {
    if (!animated) return;

    // Clear any lingering timeouts from previous renders
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      petalRefs.current.forEach((petal) => {
        if (!petal) return;
        petal.style.fillOpacity = "1";
        petal.style.strokeOpacity = "0";
        petal.style.strokeDasharray = "";
        petal.style.strokeDashoffset = "";
      });
      return;
    }

    // Re-initialise lengths (in case layout effect ran in a different frame)
    petalRefs.current.forEach((petal) => {
      if (!petal) return;
      const len = petal.getTotalLength();
      petal.style.transition = "";
      petal.style.strokeDasharray = String(len);
      petal.style.strokeDashoffset = String(len);
      petal.style.fillOpacity = "0";
      petal.style.strokeOpacity = "1";
      petal.style.strokeWidth = "1.1";
    });

    DELAYS.forEach((delay, i) => {
      const petal = petalRefs.current[i];
      if (!petal) return;

      // Phase 1 — stroke draws in
      const t1 = setTimeout(() => {
        petal.style.transition = `stroke-dashoffset ${DRAW_DUR}s cubic-bezier(0.35, 0, 0.2, 1)`;
        petal.style.strokeDashoffset = "0";
      }, delay * 1000);

      // Phase 2 — fill floods in, stroke dissolves
      const t2 = setTimeout(() => {
        petal.style.transition =
          "fill-opacity 0.7s ease, stroke-opacity 0.55s ease";
        petal.style.fillOpacity = "1";
        petal.style.strokeOpacity = "0";
      }, (delay + FILL_LAG) * 1000);

      timeoutsRef.current.push(t1, t2);
    });

    // Phase 3 — breathing starts after all petals are revealed
    const breatheDelay = (DELAYS[3] + DRAW_DUR + 0.5) * 1000;
    const t3 = setTimeout(() => {
      if (groupRef.current) {
        groupRef.current.classList.add(breatheClassName);
      }
    }, breatheDelay);
    timeoutsRef.current.push(t3);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [animated, breatheClassName]);

  const cssText = `
    .${groupClassName} { transform-box: fill-box; transform-origin: center; }
    .${breatheClassName} { animation: edcBreathe-${uid} 8s ease-in-out infinite; }
    @keyframes edcBreathe-${uid} {
      0%, 100% { transform: scale(1); }
      50%       { transform: scale(1.038); }
    }
  `;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-4 -4 146 143"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <style>{cssText}</style>

        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1}>
            {animated && !reducedMotion && (
              <animate
                attributeName="stop-opacity"
                values="1;0.8;1"
                dur="5s"
                begin="4s"
                repeatCount="indefinite"
              />
            )}
          </stop>
          <stop
            offset="40%"
            stopColor="hsl(var(--primary))"
            stopOpacity={0.75}
          >
            {animated && !reducedMotion && (
              <animate
                attributeName="stop-opacity"
                values="0.75;1;0.75"
                dur="5s"
                begin="4s"
                repeatCount="indefinite"
              />
            )}
          </stop>
          <stop
            offset="100%"
            stopColor="hsl(var(--primary))"
            stopOpacity={0.55}
          >
            {animated && !reducedMotion && (
              <animate
                attributeName="stop-opacity"
                values="0.55;0.7;0.55"
                dur="5s"
                begin="4s"
                repeatCount="indefinite"
              />
            )}
          </stop>
        </linearGradient>

        <filter id={filterId}>
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        ref={groupRef}
        className={groupClassName}
        filter={`url(#${filterId})`}
      >
        {PETAL_PATHS.map((d, i) => (
          <path
            key={i}
            ref={(el) => {
              petalRefs.current[i] = el;
            }}
            d={d}
            fillRule="evenodd"
            clipRule="evenodd"
            fill={`url(#${gradientId})`}
            style={{
              stroke: "hsl(var(--primary))",
              strokeOpacity: 0.4,
              ...(animated
                ? {}
                : { fillOpacity: 1, strokeOpacity: 0 }),
            }}
          />
        ))}
      </g>
    </svg>
  );
}
