/**
 * Reparte en carriles los eventos que se pisan en horario: cada grupo de
 * eventos solapados se divide el ancho en partes iguales; los que no se pisan
 * con nadie ocupan todo el ancho.
 */
export interface Span {
  start: number;
  end: number;
}

export interface Placed<T> {
  item: T;
  lane: number;
  lanes: number;
}

export function layoutLanes<T extends Span>(items: readonly T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    const lanes = laneEnds.length;
    for (const p of group) p.lanes = lanes;
    group = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    groupEnd = group.length ? Math.max(groupEnd, item.end) : item.end;
    const placed = { item, lane, lanes: 1 };
    group.push(placed);
    out.push(placed);
  }
  closeGroup();
  return out;
}
