import {completeSchedule} from './buffers.js';
import {days, schedule} from './engine.js';

export function resourceGroups(graph, plan) {
  const groups = new Map();
  for (const task of [...plan.order].sort((a,b) => plan.lateStart[a] - plan.lateStart[b])) {
    const key = graph.group[task];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  return groups;
}

export function swapResourceTasks(graph, plan, first, second) {
  const groups = resourceGroups(graph, plan);
  const order = groups.get(graph.group[first]);
  const a = order?.indexOf(first), b = order?.indexOf(second);
  if (a === undefined || b === undefined || Math.abs(a - b) !== 1)
    throw new Error('Choose neighboring activities on the same resource.');
  [order[a], order[b]] = [order[b], order[a]];
  const links = [...groups.values()].flatMap(tasks => tasks.slice(1).map((task,i) => [tasks[i],task]));
  try {
    return schedule(graph, links);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw new Error('That swap conflicts with the project’s dependencies or another resource order.');
  }
}

export function resourceConflicts(graph, baseline, early = false) {
  const starts = early ? baseline.start : baseline.lateStart;
  const ends = early ? baseline.end : baseline.lateEnd;
  return graph.group.flatMap((resource, a) => graph.group.slice(a + 1).flatMap((other, offset) => {
    const b = a + 1 + offset;
    const overlap = Math.min(ends[a],ends[b]) - Math.max(starts[a],starts[b]);
    if (resource !== other || overlap <= 0) return [];
    return [{a,b,overlap,shiftA:ends[a]-starts[b],shiftB:ends[b]-starts[a],
      upstreamA:baseline.start[a],upstreamB:baseline.start[b]}];
  }));
}

export function bufferImpact(graph, plan, chain, buffered = completeSchedule(graph, plan, chain)) {
  const onChain = new Set(chain);
  const paths = [];
  for (const task of plan.order) {
    if (onChain.has(task)) continue;
    const upstream = graph.predecessors[task].map(parent => paths[parent]).filter(Boolean)
      .reduce((best, entry) => entry.length > best.length ? entry : best, {length:0,tasks:[]});
    paths[task] = {length:upstream.length + graph.duration[task],tasks:[...upstream.tasks,task]};
  }
  const {work, feeding, project} = buffered;
  const round = ticks => Math.ceil(days(ticks)) * 1000;
  const lags = new Map(feeding.map(({from,to,duration}) => [`${from}:${to}`,round(duration)]));
  const rounded = schedule(graph, plan.resourceLinks, lags);
  return {
    feeding:feeding.map(item => ({...item,path:paths[item.from].tasks})),
    gaps:chain.slice(1).flatMap((to,i) => {
      const from = chain[i], gap = work.lateStart[to] - work.lateEnd[from];
      return gap > 0 ? [{from,to,gap}] : [];
    }),
    shifts:plan.order.flatMap(task => {
      const before = plan.lateStart[task], after = work.lateStart[task];
      const earlier = work.finish - after - (plan.finish - before);
      return earlier ? [{task,before,after,earlier}] : [];
    }),
    roundedWork:rounded.finish,
    roundedProject:round(project.duration),
    roundedFinish:rounded.finish + round(project.duration)
  };
}
