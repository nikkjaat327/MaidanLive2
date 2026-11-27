import { useEffect, useRef, useState } from 'react';

interface PlayerChangeState {
  strikerFlash: boolean;
  nonStrikerFlash: boolean;
  bowlerFlash: boolean;
  strikerAnimKey: number;
  nonStrikerAnimKey: number;
  bowlerAnimKey: number;
}

export function usePlayerChangeFlash(
  striker?: string | null,
  nonStriker?: string | null,
  bowler?: string | null,
  durationMs = 700
): PlayerChangeState {
  const sClean = (striker || '').trim();
  const nsClean = (nonStriker || '').trim();
  const bwClean = (bowler || '').trim();

  const prevRef = useRef<{ s: string; ns: string; bw: string }>({
    s: sClean,
    ns: nsClean,
    bw: bwClean,
  });

  const [state, setState] = useState<PlayerChangeState>({
    strikerFlash: false,
    nonStrikerFlash: false,
    bowlerFlash: false,
    strikerAnimKey: 0,
    nonStrikerAnimKey: 0,
    bowlerAnimKey: 0,
  });

  useEffect(() => {
    const prev = prevRef.current;
    const sChanged = Boolean(sClean && prev.s !== sClean);
    const nsChanged = Boolean(nsClean && prev.ns !== nsClean);
    const bwChanged = Boolean(bwClean && prev.bw !== bwClean);

    prevRef.current = { s: sClean, ns: nsClean, bw: bwClean };

    if (!sChanged && !nsChanged && !bwChanged) return;

    setState((curr) => ({
      strikerFlash: sChanged ? true : curr.strikerFlash,
      nonStrikerFlash: nsChanged ? true : curr.nonStrikerFlash,
      bowlerFlash: bwChanged ? true : curr.bowlerFlash,
      strikerAnimKey: sChanged ? curr.strikerAnimKey + 1 : curr.strikerAnimKey,
      nonStrikerAnimKey: nsChanged ? curr.nonStrikerAnimKey + 1 : curr.nonStrikerAnimKey,
      bowlerAnimKey: bwChanged ? curr.bowlerAnimKey + 1 : curr.bowlerAnimKey,
    }));

    const timer = window.setTimeout(() => {
      setState((curr) => ({
        ...curr,
        strikerFlash: false,
        nonStrikerFlash: false,
        bowlerFlash: false,
      }));
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [sClean, nsClean, bwClean, durationMs]);

  return state;
}
