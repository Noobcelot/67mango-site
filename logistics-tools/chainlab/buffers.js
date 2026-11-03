import {schedule} from './engine.js';

export const defaultBufferRules = {
  method: 'percent', pathPercent: 50, sdPercent: 50, z: 1.64485362695147, leadDays: [7, 3, 1]
};

// FBs protect precedence handoffs. Resource links stay in the schedule,
// but only precedence links determine the feeding paths.
export function completeSchedule(graph, plan, chain, rules = defaultBufferRules) {
  const critical = new Set(chain);
  const confidence = rules.method === 'confidence';
  const taskWeight = task => {
    const duration = graph.duration[task];
    return confidence ? (duration * rules.sdPercent / 100) ** 2 : duration;
  };
  const sizeBuffer = weight => {
    if (!confidence) return {duration: weight * (rules.pathPercent / 100)};
    const sigma = Math.sqrt(weight);
    return {duration: Math.round(rules.z * sigma * 10) / 10, sigma};
  };
  const weights = [], previousFeeder = [];
  for (const task of plan.order) {
    if (critical.has(task)) {
      weights[task] = 0;
      continue;
    }
    let best;
    for (const parent of graph.predecessors[task]) {
      if (critical.has(parent)) continue;
      if (best === undefined || weights[parent] > weights[best]) best = parent;
    }
    previousFeeder[task] = best;
    weights[task] = taskWeight(task) + (best === undefined ? 0 : weights[best]);
  }

  const feeders = chain.flatMap(to => graph.predecessors[to]
    .filter(from => !critical.has(from))
    .map(from => {
      const path = [];
      for (let task = from; task !== undefined; task = previousFeeder[task]) path.push(task);
      path.reverse();
      const length = path.reduce((sum, task) => sum + graph.duration[task], 0);
      return {from, to, path, length, ...sizeBuffer(weights[from])};
    }));
  const lags = new Map(feeders.map(({from, to, duration}) => [`${from}:${to}`, duration]));
  const work = schedule(graph, plan.resourceLinks, lags);
  const feeding = feeders.map(feeder => {
    const end = work.lateStart[feeder.to];
    return {...feeder, start: end - feeder.duration, end};
  });

  const chainLength = chain.reduce((total, task) => total + graph.duration[task], 0);
  const protection = sizeBuffer(chain.reduce((total, task) => total + taskWeight(task), 0));
  const project = {...protection, start: work.finish, end: work.finish + protection.duration};
  // A contiguous handoff within the same resource on the chain needs no
  // repeat alert. Flag the first assignment and each resource takeover.
  const resource = chain.flatMap((task, index) => {
    const previous = chain[index - 1];
    const at = work.lateStart[task];
    if (graph.group[task] === graph.group[previous] && work.lateEnd[previous] === at) return [];
    return [{task, at, leadDays: rules.leadDays}];
  });
  return {work, feeding, project, resource, chainLength};
}
