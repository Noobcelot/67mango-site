import {completeSchedule} from './buffers.js';
import {bufferImpact} from './study.js';
import {days} from './engine.js';

const number = value => days(value).toLocaleString(undefined, {maximumFractionDigits: 4});
const escape = value => String(value).replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);

function chartLayout(work, feeding, projectBuffer, graph, chain) {
  const lanes = [], taskLanes = [];
  for (const [task, parents] of graph.predecessors.entries()) {
    if (parents.length) continue;
    taskLanes[task] = lanes.length;
    lanes.push([]);
  }
  function place(block, preferences) {
    const lane = preferences.find(index => lanes[index]?.every(item =>
      item.end <= block.start || item.start >= block.end)) ?? lanes.length;
    (lanes[lane] ??= []).push(block);
    return lane;
  }
  for (const task of work.order) {
    const upstream = graph.predecessors[task].map(parent => taskLanes[parent]).sort((a, b) => b - a);
    const feeders = feeding.filter(item => item.to === task).map(item => taskLanes[item.from]);
    taskLanes[task] = place({type:'task', task, start:work.lateStart[task], end:work.lateEnd[task]},
      [taskLanes[task], ...feeders, ...upstream]);
  }
  for (const feeder of feeding) place({...feeder, type:'FB'}, [taskLanes[feeder.from], taskLanes[feeder.to]]);
  place({...projectBuffer, type:'PB'}, [taskLanes[chain.at(-1)]]);
  return {lanes, taskLanes};
}

export function renderBufferView(project, graph, plan, chain) {
  const {work, feeding, project: projectBuffer, resource, chainLength} = completeSchedule(graph, plan, chain);
  const {lanes, taskLanes} = chartLayout(work, feeding, projectBuffer, graph, chain);
  const critical = new Set(chain);
  const taskName = task => escape(project.tasks[task].id);
  const department = task => project.departments.find(item => item.id === project.tasks[task].department);

  // Slide 25 reads from days remaining down to the protected finish. Round
  // the axis to a clean tick and show the leading space as scale padding.
  const spacing = projectBuffer.end / 8;
  const magnitude = 10 ** Math.floor(Math.log10(spacing));
  const interval = [1, 2, 5, 10].find(factor => factor * magnitude >= spacing) * magnitude;
  const count = Math.ceil(projectBuffer.end / interval);
  const horizon = count * interval;
  const padding = horizon - projectBuffer.end;
  const position = time => (padding + time) / horizon * 100;
  const ticks = Array.from({length:count + 1}, (_, index) => {
    const remaining = (count - index) * interval;
    return `<span class="buffer-tick" style="left:${index / count * 100}%">${number(remaining)}</span>`;
  }).join('');
  const rows = lanes.map((lane, laneIndex) => {
    const bars = lane.map(block => {
      const isTask = block.type === 'task';
      const label = isTask ? taskName(block.task) : block.type;
      const duration = number(block.end - block.start);
      const description = isTask ? `${label} · ${escape(department(block.task).name)}`
        : block.type === 'FB' ? `Feeding buffer from ${taskName(block.from)} to ${taskName(block.to)}` : 'Project buffer';
      const style = `left:${position(block.start)}%;width:${(block.end - block.start) / horizon * 100}%`;
      const color = isTask ? `;--dept:${department(block.task).color}` : '';
      return `<div class="complete-bar ${isTask ? 'work-bar' : 'allowance-bar'} ${critical.has(block.task) ? 'on-chain' : ''}" style="${style}${color}" title="${description} · ${duration} days · project day ${number(block.start)} to ${number(block.end)}"><strong>${label}</strong><span>${duration} d</span></div>`;
    }).join('');
    const flags = resource.filter(item => taskLanes[item.task] === laneIndex).map(({task, at}) =>
      `<span class="resource-flag" style="left:${position(at)}%;--dept:${department(task).color}" title="Resource buffer for ${taskName(task)} · alert at 7, 3, and 1 days before start">RB</span>`).join('');
    return `<div class="complete-lane">${bars}${flags}</div>`;
  }).join('');
  const feederLinks = new Set(feeding.map(({from, to}) => `${from}:${to}`));
  const connection = (from, to, style = '') => {
    if (taskLanes[from] === taskLanes[to]) return '';
    const x1 = position(work.lateEnd[from]) * 10;
    const x2 = position(work.lateStart[to]) * 10;
    const y1 = taskLanes[from] * 65 + 40.5;
    const y2 = taskLanes[to] * 65 + 40.5;
    return `<path class="${style}" d="M${x1},${y1} L${x2},${y2}" vector-effect="non-scaling-stroke"/>`;
  };
  const connections = graph.predecessors.flatMap((parents, to) => parents
    .filter(from => !feederLinks.has(`${from}:${to}`))
    .map(from => connection(from, to))).join('');
  const resourceConnections = chain.slice(1).map((to, index) => {
    const from = chain[index];
    return work.resourceKeys.has(`${from}:${to}`) ? connection(from, to, 'resource-link') : '';
  }).join('');
  const extension = work.finish - plan.finish;
  const stat = (name, value) => `<div><span>${name}</span><strong>${number(value)} <small>d</small></strong></div>`;
  const impact = bufferImpact(graph, plan, chain, {work, feeding, project:projectBuffer});
  const rowsHtml = impact.feeding.map(({from, to, length, duration, path}) =>
    `<tr><td><span class="buffer-key">FB</span></td><td>${taskName(from)} → ${taskName(to)}</td><td>${number(duration)} d</td><td>${path.map(taskName).join(' → ')} · 50% of ${number(length)} d</td></tr>`).join('');
  const reminders = resource.map(({task, at, leadDays}) => {
    const when = leadDays.map(lead => {
      const day = days(at) - lead;
      return day < 0 ? `${Math.abs(day).toLocaleString(undefined, {maximumFractionDigits:4})} d before day 0`
        : `day ${day.toLocaleString(undefined, {maximumFractionDigits:4})}`;
    }).join(' / ');
    return `<tr><td><span class="buffer-key rb-key">RB</span></td><td>${taskName(task)} · ${escape(department(task).name)}</td><td>0 d</td><td>${when}</td></tr>`;
  }).join('');

  const gaps = impact.gaps.map(({from,to,gap}) => `${taskName(from)} → ${taskName(to)} (${number(gap)} d)`).join(', ');
  const changes = impact.shifts.map(({task,before,after,earlier}) =>
    `<tr><td>${taskName(task)}</td><td>${number(before)}</td><td>${number(after)}</td><td>${number(earlier)} d</td></tr>`).join('');
  return `<div class="buffer-stats">${stat('WORK FINISH', work.finish)}${stat('PROJECT BUFFER', projectBuffer.duration)}${stat('PROTECTED FINISH', projectBuffer.end)}</div>
    <div class="gantt-status"><span>BUFFERED LATE START</span><span>DAYS REMAINING TO PROTECTED FINISH</span></div>
    <div class="scroll"><div class="complete-chart">
      <div class="complete-axis">${ticks}</div>
      <div class="complete-lanes" style="--division:${100 / count}%"><svg class="complete-links" viewBox="0 0 1000 ${lanes.length * 65}" preserveAspectRatio="none" aria-hidden="true">${connections}${resourceConnections}</svg>${rows}</div>
    </div></div>
    <div class="buffer-caption"><span><i class="buffer-key">FB</i> Feeding buffer</span><span><i class="buffer-key">PB</i> Project buffer</span><span><i class="buffer-key rb-key">RB</i> Resource alert</span><span><i class="chain-key"></i> Selected chain</span><span><i class="resource-link-key"></i> Resource handoff</span></div>
    <div class="buffer-detail">
      <p class="result-note">${extension > 0 ? `Feeding protection moves the work finish by ${number(extension)} days for this resource order. ` : ''}Finish values above count from the first scheduled activity. RBs are readiness reminders 7, 3, and 1 days before the marked task.</p>
      <div class="scroll"><table class="buffer-table"><thead><tr><th>Type</th><th>Placement</th><th>Duration</th><th>Sizing or reminder days</th></tr></thead>
      <tbody>${rowsHtml}<tr><td><span class="buffer-key">PB</span></td><td>After all scheduled work</td><td>${number(projectBuffer.duration)} d</td><td>50% of the ${number(chainLength)}-day selected chain</td></tr>${reminders}</tbody></table></div>
      <details class="study-details" open>
        <summary>Buffer impact</summary>
        <p>Work finish ${number(plan.finish)} → ${number(work.finish)} d · Chain gaps ${gaps || 'none'}</p>
        <p>Round each FB and PB up to a whole day to get a ${number(impact.roundedFinish)}-day protected finish (${number(impact.roundedWork)} d work + ${number(impact.roundedProject)} d PB).</p>
        ${changes ? `<div class="scroll"><table class="buffer-table"><thead><tr><th>Activity</th><th>Start before (day)</th><th>Start after (day)</th><th>Moved earlier relative to work finish</th></tr></thead><tbody>${changes}</tbody></table></div>` : '<p>No starts moved relative to the work finish.</p>'}
      </details>
    </div>`;
}
