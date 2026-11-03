// Pure scheduling functions. The UI and worker consume the same model.
const MAX_ACTIVITIES = 80;
const SCALE = 1000;
export const days = ticks => ticks / SCALE;

export function projectGraph(project) {
  if (!project || !Array.isArray(project.tasks) || !Array.isArray(project.departments))
    throw new Error('Choose a ChainLab project JSON file.');
  if (project.tasks.length > MAX_ACTIVITIES || project.departments.length > MAX_ACTIVITIES)
    throw new Error('Projects support up to 80 activities and 80 departments.');
  const departments = new Set();
  for (const department of project.departments) {
    if (!department || typeof department.id !== 'string' || !department.id || departments.has(department.id)
      || typeof department.name !== 'string' || !department.name.trim() || !/^#[0-9a-f]{6}$/i.test(department.color))
      throw new Error('Each department needs a unique ID, a name, and a valid color.');
    departments.add(department.id);
  }
  const ids = new Map();
  const duration = project.tasks.map((task, index) => {
    if (!task || typeof task.id !== 'string' || !task.id.trim() || ids.has(task.id))
      throw new Error('Each activity needs a unique ID.');
    if (!departments.has(task.department)) throw new Error(`${task.id} needs a valid department.`);
    const ticks = Math.round(task.duration * SCALE);
    if (typeof task.duration !== 'number' || !Number.isFinite(ticks) || ticks <= 0 || ticks > 1e9
      || ticks / SCALE !== task.duration)
      throw new Error(`${task.id} needs a duration from 0.001 to 1,000,000 days (up to three decimals).`);
    if (!Array.isArray(task.predecessors) || new Set(task.predecessors).size !== task.predecessors.length)
      throw new Error(`${task.id} has an invalid predecessor list.`);
    ids.set(task.id, index);
    return ticks;
  });
  const predecessors = project.tasks.map(task => task.predecessors.map(id => {
    if (!ids.has(id)) throw new Error(`${task.id} references unknown activity ${id}.`);
    return ids.get(id);
  }));
  const group = project.tasks.map(task => task.department);
  const graph = {predecessors, group, duration};
  if (!topology(predecessors)) throw new Error('These dependencies form a loop. Each activity must eventually lead forward.');
  return graph;
}

function topology(predecessors) {
  const successors = predecessors.map(() => []);
  const indegree = predecessors.map((parents, task) => {
    for (const parent of parents) successors[parent].push(task);
    return parents.length;
  });
  const order = indegree.flatMap((count, index) => count === 0 ? [index] : []);
  for (const parent of order)
    for (const task of successors[parent])
      if (--indegree[task] === 0) order.push(task);
  return order.length === predecessors.length ? {order, successors} : null;
}

export function schedule(graph, resourceLinks = [], lags = new Map()) {
  const parents = graph.predecessors.map(list => [...list]);
  const resourceKeys = new Set();
  for (const [from, to] of resourceLinks) {
    if (parents[to].includes(from)) continue;
    parents[to].push(from);
    resourceKeys.add(`${from}:${to}`);
  }
  const {order, successors} = topology(parents);
  const lag = (from, to) => lags.get(`${from}:${to}`) ?? 0;
  const start = [], end = [];
  for (const task of order) {
    start[task] = parents[task].reduce((latest, parent) => Math.max(latest, end[parent] + lag(parent, task)), 0);
    end[task] = start[task] + graph.duration[task];
  }
  const finish = Math.max(0, ...end);
  const lateStart = [], lateEnd = [];
  for (const task of [...order].reverse()) {
    lateEnd[task] = Math.min(finish, ...successors[task].map(next => lateStart[next] - lag(task, next)));
    lateStart[task] = lateEnd[task] - graph.duration[task];
  }
  return {parents, successors, order, start, end, lateStart, lateEnd, finish, resourceLinks, resourceKeys};
}

function departmentLinks(graph, order) {
  const last = new Map(), links = [];
  for (const task of order) {
    const department = graph.group[task];
    if (last.has(department)) links.push([last.get(department), task]);
    last.set(department, task);
  }
  return links;
}

// CCM2 slides 4 and 10–17. Work backward by precedence layer from
// the finish, resolving overlaps in the late-start chart as tasks enter it.
export function initialSchedule(graph) {
  let plan = schedule(graph);
  const rank = [];
  for (const task of [...plan.order].reverse())
    rank[task] = 1 + Math.max(-1, ...plan.successors[task].map(next => rank[next]));

  const pairs = [];
  for (let a = 0; a < rank.length; a++)
    for (let b = a + 1; b < rank.length; b++)
      if (graph.group[a] === graph.group[b]) pairs.push([a, b]);

  while (true) {
    let conflict, conflictRank = Infinity, rightmost = -Infinity;
    for (const pair of pairs) {
      const [a, b] = pair;
      const layer = Math.max(rank[a], rank[b]);
      if (layer > conflictRank) continue;
      const overlapStart = Math.max(plan.lateStart[a], plan.lateStart[b]);
      const overlapEnd = Math.min(plan.lateEnd[a], plan.lateEnd[b]);
      if (overlapStart >= overlapEnd) continue;
      if (layer < conflictRank || overlapEnd > rightmost) {
        conflict = pair;
        conflictRank = layer;
        rightmost = overlapEnd;
      }
    }
    if (!conflict) {
      const byLateStart = [...plan.order].sort((a, b) => plan.lateStart[a] - plan.lateStart[b]);
      return schedule(graph, departmentLinks(graph, byLateStart));
    }

    // An overlap means there is no existing order between the pair. Compare
    // both shifts. Prefer less project extension, then less upstream work,
    // including the shifted task to break ties, then less displacement.
    const [a, b] = conflict;
    const directions = [[a, b], [b, a]].map(([earlier, later]) => ({
      plan: schedule(graph, [...plan.resourceLinks, [earlier, later]]),
      upstream: plan.start[earlier],
      including: plan.end[earlier],
      shift: plan.lateEnd[earlier] - plan.lateStart[later]
    }));
    directions.sort((x, y) => x.plan.finish - y.plan.finish || x.upstream - y.upstream
      || x.including - y.including || x.shift - y.shift);
    plan = directions[0].plan;
  }
}

export function* criticalSequences(plan) {
  function* trace(task, trail, usesResource) {
    const path = [task, ...trail];
    if (plan.start[task] === 0) {
      yield {path, type: usesResource ? 'CC' : 'CP'};
      return;
    }
    for (const parent of plan.parents[task])
      if (plan.lateEnd[parent] === plan.lateStart[task] && plan.start[parent] === plan.lateStart[parent])
        yield* trace(parent, path, usesResource || plan.resourceKeys.has(`${parent}:${task}`));
  }
  for (const task of plan.order)
    if (plan.end[task] === plan.finish) yield* trace(task, [], false);
}

export function analyzeSchedule(baseline, plan, maxPaths = 20000) {
  const candidates = [];
  let examined = 0;
  const inputs = baseline === plan ? [[baseline, 'CP']] : [[baseline, 'CP'], [plan, 'CC']];
  for (const [source, type] of inputs)
    for (const result of criticalSequences(source)) {
      if (++examined > maxPaths) return {candidates, complete: false};
      if (result.type !== type) continue;
      candidates.push({...result, finish: source.finish, links: source.resourceLinks});
    }
  return {candidates, complete: true};
}

export function* resourceOrders(graph) {
  const size = graph.duration.length;
  const pairs = [];
  for (let a = 0; a < size; a++)
    for (let b = a + 1; b < size; b++)
      if (graph.group[a] === graph.group[b]) pairs.push([a, b]);
  const base = topology(graph.predecessors);
  const reach = Array(size).fill(0n);
  const bit = reach.map((_, i) => 1n << BigInt(i));
  for (const task of [...base.order].reverse())
    for (const next of base.successors[task]) reach[task] |= bit[next] | reach[next];

  // Each branch fixes one unresolved same-department pair. The transitive
  // closure skips forced decisions and excludes cyclic resource orders.
  const stack = [{reach, links: [], cursor: 0}];
  while (stack.length) {
    const state = stack.pop();
    const index = pairs.findIndex(([a, b], i) => i >= state.cursor
      && !(state.reach[a] & bit[b]) && !(state.reach[b] & bit[a]));
    if (index < 0) {
      yield departmentLinks(graph, schedule(graph, state.links).order);
      continue;
    }
    const [a, b] = pairs[index];
    for (const [from, to] of [[b, a], [a, b]]) {
      const tail = state.reach[to] | bit[to];
      const updated = state.reach.map((row, task) => task === from || (row & bit[from]) ? row | tail : row);
      stack.push({reach: updated, links: [...state.links, [from, to]], cursor: index + 1});
    }
  }
}

export function analyze(graph, limits = {}) {
  const {maxOrders = 20000, maxTraces = 200000, maxMs = 4500} = limits;
  const deadline = performance.now() + maxMs;
  const candidates = new Map();
  let orders = 0, traces = 0, complete = true;
  let best = initialSchedule(graph);
  const baseline = schedule(graph);
  function record(plan, mode) {
    for (const result of criticalSequences(plan)) {
      if (++traces > maxTraces || performance.now() > deadline) return false;
      if (mode === 'resource' && result.type === 'CP') continue;
      const key = `${result.type}:${result.path.join(',')}`;
      const existing = candidates.get(key);
      if (existing) {
        existing.count++;
      } else {
        candidates.set(key, {...result, finish: plan.finish, links: plan.resourceLinks, count: 1});
      }
    }
    return true;
  }
  if (!record(baseline, 'baseline')) complete = false;
  if (complete && !record(best, 'resource')) complete = false;
  // Seed with the displayed schedule, then count it only once in the search.
  const seed = best.resourceLinks;
  const signature = links => links.map(pair => pair.join(':')).sort().join(',');
  const seedKey = signature(seed);
  if (complete) {
    for (const links of resourceOrders(graph)) {
      if (orders >= maxOrders || performance.now() > deadline) {
        complete = false;
        break;
      }
      orders++;
      if (signature(links) === seedKey) continue;
      const plan = schedule(graph, links);
      if (plan.finish < best.finish) best = plan;
      if (!record(plan, 'resource')) {
        complete = false;
        break;
      }
    }
  }
  return {candidates: [...candidates.values()].sort((a, b) => b.type.localeCompare(a.type)
    || a.finish - b.finish || a.path.join(',').localeCompare(b.path.join(','))),
  orders, complete, bestLinks: best.resourceLinks, bestFinish: best.finish};
}
