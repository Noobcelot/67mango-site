import {schedule} from './engine.js';

// CCM2 slides 19–25. FBs protect precedence handoffs. Resource links stay in
// the scheduling graph, but only precedence links determine the feeding paths.
export function completeSchedule(graph, plan, chain) {
  const critical = new Set(chain);
  const feedingLength = [];
  for (const task of plan.order) {
    if (critical.has(task)) {
      feedingLength[task] = 0;
      continue;
    }
    feedingLength[task] = graph.duration[task] + Math.max(0,
      ...graph.predecessors[task].map(parent => feedingLength[parent]));
  }

  const feeders = chain.flatMap(to => graph.predecessors[to]
    .filter(from => !critical.has(from))
    .map(from => ({from, to, length: feedingLength[from], duration: feedingLength[from] / 2})));
  const lags = new Map(feeders.map(({from, to, duration}) => [`${from}:${to}`, duration]));
  const work = schedule(graph, plan.resourceLinks, lags);
  const feeding = feeders.map(feeder => {
    const end = work.lateStart[feeder.to];
    return {...feeder, start: end - feeder.duration, end};
  });

  const chainLength = chain.reduce((total, task) => total + graph.duration[task], 0);
  const project = {duration: chainLength / 2, start: work.finish, end: work.finish + chainLength / 2};
  // A contiguous handoff within the same resource on the chain needs no
  // repeat alert. Flag the first assignment and each resource takeover.
  const resource = chain.flatMap((task, index) => {
    const previous = chain[index - 1];
    const at = work.lateStart[task];
    if (graph.group[task] === graph.group[previous] && work.lateEnd[previous] === at) return [];
    return [{task, at, leadDays: [7, 3, 1]}];
  });
  return {work, feeding, project, resource, chainLength};
}
