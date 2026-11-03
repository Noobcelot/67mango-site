import {analyze, analyzeSchedule, criticalSequences, days, initialSchedule, projectGraph, schedule} from './engine.js';
import {renderBufferView} from './buffer-view.js';
import {exampleProject} from './example.js';

const $ = id => document.getElementById(id);
const storageKey = 'chainlab-project-v1';
const number = value => days(value).toLocaleString(undefined, {maximumFractionDigits: 3});
const escape = value => String(value).replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
const palette = ['#e35365', '#73b84d', '#23aa88', '#b456b3', '#4988d6', '#e69445', '#b29639', '#5aa6bb'];

let project = readProject();
let graph, baseline, methodPlan, leveled, displayed, analysis, selected, worker, editing;
let visibleResults = 12;
let bufferChoices = [];
let bufferPlan;

function readProject() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value) {
      projectGraph(value);
      return value;
    }
  } catch {}
  return exampleProject();
}

function saveProject() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(project));
  } catch {
    notice('Browser storage is unavailable. Export JSON to keep your changes.');
  }
}

function notice(message) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}

function replaceProject(next) {
  const validated = projectGraph(next);
  worker?.terminate();
  worker = null;
  analysis = null;
  selected = null;
  visibleResults = 12;
  project = {...next, version: 1, name: String(next.name ?? '').slice(0, 100) || 'Untitled project'};
  graph = validated;
  baseline = schedule(graph);
  bufferPlan = null;
  methodPlan = initialSchedule(graph);
  leveled = methodPlan;
  $('project-name').value = project.name;
  $('gantt-mode').value = 'level';
  $('filter').value = 'all';
  notice('');
  saveProject();
  renderEditor();
  renderSchedule();
  renderResults();
}

function departmentFor(task) {
  return project.departments.find(department => department.id === task.department);
}

function dot(department) {
  return `<i class="dot" style="--dept:${department.color}"></i>`;
}

function renderEditor() {
  $('departments').innerHTML = project.departments.map((department, index) =>
    `<button class="item" data-index="${index}">${dot(department)}<strong>${escape(department.name)}</strong><small>${project.tasks.filter(task => task.department === department.id).length}</small></button>`
  ).join('') || '<p class="muted">Add your first department.</p>';
  $('tasks').innerHTML = project.tasks.map((task, index) =>
    `<button class="item" data-index="${index}">${dot(departmentFor(task))}<strong>${escape(task.id)}</strong><small>${task.duration} d</small></button>`
  ).join('') || '<p class="muted">Add an activity to begin.</p>';
  $('count').textContent = project.tasks.length;
  $('add-task').disabled = !project.departments.length || project.tasks.length >= 80;
  $('add-department').disabled = project.departments.length >= 80;
  $('legend').innerHTML = project.departments.map(department => `<span>${dot(department)}${escape(department.name)}</span>`).join('');
  $('legend').hidden = !project.departments.length;
}

function activeEdges() {
  const edges = new Set();
  if (selected)
    for (let index = 1; index < selected.path.length; index++)
      edges.add(`${selected.path[index - 1]}:${selected.path[index]}`);
  return edges;
}

function renderFlow() {
  if (!project.tasks.length) {
    $('flow').innerHTML = '<div class="empty">Your activity network will appear here.</div>';
    return;
  }
  const layers = [], depth = [];
  for (const task of baseline.order) {
    depth[task] = 1 + Math.max(-1, ...graph.predecessors[task].map(parent => depth[parent]));
    (layers[depth[task]] ??= []).push(task);
  }
  const height = Math.max(182, Math.max(...layers.map(layer => layer.length)) * 70 + 26);
  const width = Math.max(700, layers.length * 154 + 258);
  const startX = 56, finishX = width - 56, centerY = height / 2;
  const step = (width - 304) / Math.max(1, layers.length - 1);
  const coords = [];
  layers.forEach((layer, level) => {
    const desired = task => {
      const parents = graph.predecessors[task];
      return parents.reduce((total, parent) => total + coords[parent].y, 0) / (parents.length || 1);
    };
    layer.sort((a, b) => desired(a) - desired(b) || a - b);
    layer.forEach((task, row) => {
      coords[task] = {
        x: layers.length === 1 ? width / 2 : 152 + level * step,
        y: centerY + (row - (layer.length - 1) / 2) * 70
      };
    });
  });
  const active = activeEdges();
  const edge = (x1, y1, x2, y2, kind = '') => {
    const mid = (x1 + x2) / 2;
    const curve = kind === 'resource' && x2 - x1 < 18
      ? `M${x1} ${y1} C${x1 + 33} ${y1 + 25} ${x2 - 33} ${y2 + 25} ${x2} ${y2}`
      : `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
    return `<path class="edge ${kind}" d="${curve}" marker-end="url(#arrow-${kind || 'normal'})"/>`;
  };
  const edges = coords.map(({x, y}, task) => {
    const incoming = graph.predecessors[task].map(parent => edge(coords[parent].x + 51, coords[parent].y, x - 51, y,
      active.has(`${parent}:${task}`) ? 'active' : '')).join('');
    return incoming + (graph.predecessors[task].length ? '' : edge(startX + 12, centerY, x - 51, y))
      + (baseline.successors[task].length ? '' : edge(x + 51, y, finishX - 12, centerY));
  }).join('');
  const resource = [...displayed.resourceKeys].filter(key => active.has(key)).map(key => {
    const [from, to] = key.split(':').map(Number);
    const a = coords[from], b = coords[to];
    if (a.x === b.x) {
      const right = a.x + 51;
      const bend = right + 30;
      return `<path class="edge resource" d="M${right} ${a.y} C${bend} ${a.y} ${bend} ${b.y} ${right} ${b.y}" marker-end="url(#arrow-resource)"/>`;
    }
    return edge(a.x + 51, a.y, b.x - 51, b.y, 'resource');
  }).join('');
  const nodes = coords.map(({x, y}, index) => {
    const task = project.tasks[index];
    const department = departmentFor(task);
    const name = task.id.length > 11 ? task.id.slice(0, 10) + '…' : task.id;
    return `<g class="node ${selected?.path.includes(index) ? 'selected' : ''}" transform="translate(${x - 51} ${y - 24})" data-index="${index}" tabindex="0" role="button" aria-label="${escape(`Edit ${task.id}, ${department.name}, ${task.duration} days`)}">
      <title>${escape(task.id)} · ${escape(department.name)} · ${task.duration} days</title>
      <rect class="node-bg" width="102" height="48" rx="7" fill="#fff" stroke="${department.color}"/>
      <rect x="4" y="5" width="5" height="38" rx="2" fill="${department.color}"/>
      <text x="15" y="21" class="node-title">${escape(name)}</text><text x="15" y="36" class="node-note">${task.duration} d</text>
    </g>`;
  }).join('');
  const milestone = (x, label) => `<path d="M${x - 11} ${centerY} l11 -11 11 11 -11 11z" fill="#dceae6" stroke="#6d8d85"/><text x="${x}" y="${centerY + 27}" text-anchor="middle" class="milestone">${label}</text>`;
  const markers = [['normal','#79918e'],['active','#0d705c'],['resource','#0f8b71']].map(([name, color]) =>
    `<marker id="arrow-${name}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L7 3.5 L0 7z" fill="${color}"/></marker>`).join('');
  $('flow').innerHTML = `<svg aria-label="Project dependency network" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs>${markers}</defs>${edges}${resource}${milestone(startX, 'START')}${milestone(finishX, 'FINISH')}${nodes}</svg>`;
}

function renderSchedule() {
  const baselineMode = $('gantt-mode').value === 'baseline';
  displayed = baselineMode ? baseline : leveled;
  const extra = displayed.finish - baseline.finish;
  const metric = (label, value, unit = 'd') => `<div class="metric"><label>${label}</label><strong>${number(value)} <span>${unit}</span></strong></div>`;
  $('metrics').innerHTML = metric('BASELINE', baseline.finish)
    + metric('CURRENT GANTT', displayed.finish) + metric('RESOURCE DELAY', extra);
  $('gantt-label').textContent = baselineMode ? 'LATE START · PRECEDENCE ONLY'
    : leveled === methodPlan ? 'LATE START · SLIDE METHOD' : 'LATE START · ALTERNATIVE ORDER';
  renderFlow();
  $('open-buffers').disabled = !project.tasks.length;
  if (!project.tasks.length) closeBuffers();
  else if (!$('complete-schedule').hidden) refreshBuffers();
  if (!project.tasks.length) {
    $('gantt').innerHTML = '<div class="empty">The Gantt chart updates as you add activities.</div>';
    return;
  }
  const horizon = displayed.finish;
  const percent = time => time / horizon * 100;
  const spacing = horizon / 8;
  const magnitude = 10 ** Math.floor(Math.log10(spacing));
  const tickSize = Math.max(1, [1, 2, 5, 10].find(factor => factor * magnitude >= spacing) * magnitude);
  const ticks = [0];
  for (let i = 1; i * tickSize < horizon - tickSize * .4; i++) ticks.push(i * tickSize);
  ticks.push(horizon);
  const positions = (style, inside) => ticks.map(tick => `<span class="${style}" style="left:${percent(tick)}%">${inside ? number(tick) : ''}</span>`).join('');
  const axis = `<div class="time-row"><div class="time-label"><strong>Activity</strong></div><div class="time-axis">${positions('tick', true)}</div></div>`;
  const grid = positions('gridline', false);
  const rows = project.tasks.map((task, index) => {
    const dept = departmentFor(task);
    const start = displayed.lateStart[index], end = displayed.lateEnd[index];
    const detail = `${task.id} · ${dept.name} · Day ${number(start)} to ${number(end)}`;
    return `<div class="time-row"><div class="time-label" title="${escape(detail)}">${dot(dept)}<strong>${escape(task.id)}</strong><small>${number(start)}–${number(end)}</small></div>
      <div class="time-axis">${grid}<div class="bar ${selected?.path.includes(index) ? 'active' : ''}" style="--dept:${dept.color};left:${percent(start)}%;width:${percent(end - start)}%" title="${escape(detail)}"><span>${task.duration}d</span></div></div></div>`;
  }).join('');
  $('gantt').innerHTML = `<div class="timeline">${axis}${rows}</div>`;
}

function drawBuffers() {
  const choice = bufferChoices[Number($('buffer-chain').value)];
  $('buffer-body').innerHTML = renderBufferView(project, graph, leveled, choice.path);
}

function refreshBuffers() {
  const select = $('buffer-chain');
  if (bufferPlan !== leveled) {
    bufferPlan = leveled;
    bufferChoices = [];
    let truncated = false;
    for (const choice of criticalSequences(leveled)) {
      if (bufferChoices.length === 200) {
        truncated = true;
        break;
      }
      bufferChoices.push(choice);
    }
    bufferChoices.sort((a, b) => a.type.localeCompare(b.type));
    select.innerHTML = bufferChoices.map(({type, path}, index) =>
      `<option value="${index}">${type} · ${path.map(task => escape(project.tasks[task].id)).join(' → ')}</option>`).join('');
    $('buffer-chain-limit').hidden = !truncated;
  }
  if (selected?.type === 'CC') {
    const index = bufferChoices.findIndex(choice => choice.path.join(',') === selected.path.join(','));
    if (index >= 0) select.value = index;
  }
  drawBuffers();
}

function closeBuffers() {
  $('complete-schedule').hidden = true;
  $('open-buffers').setAttribute('aria-expanded', 'false');
}

$('open-buffers').onclick = () => {
  $('complete-schedule').hidden = false;
  $('open-buffers').setAttribute('aria-expanded', 'true');
  refreshBuffers();
  $('complete-schedule').scrollIntoView({block:'start', behavior:'smooth'});
};
$('close-buffers').onclick = () => {
  closeBuffers();
  $('open-buffers').focus();
};
$('buffer-chain').onchange = drawBuffers;

function renderResults() {
  $('analyze').disabled = !project.tasks.length || Boolean(worker);
  $('analyze').textContent = 'Find CP & CC';
  $('filter').hidden = !analysis;
  if (!analysis) {
    $('result-body').innerHTML = `<p class="result-note">${worker
      ? 'Checking feasible department orders for tied and alternative critical sequences…'
      : 'Find the longest precedence paths and the chains that control the current resource-leveled Gantt.'}</p>`;
    return;
  }
  const {candidates, orders, complete, bestFinish} = analysis;
  const alternatives = orders !== undefined;
  const filter = $('filter').value;
  const matches = candidates.filter(candidate => filter === 'all' || candidate.type === filter);
  const cc = candidates.filter(candidate => candidate.type === 'CC').length;
  const list = matches.slice(0, visibleResults).map(candidate => {
    const resource = new Set(candidate.links.map(pair => pair.join(':')));
    const path = candidate.path.map((task, index) => {
      const isResource = index && resource.has(`${candidate.path[index - 1]}:${task}`)
        && !graph.predecessors[task].includes(candidate.path[index - 1]);
      const arrow = index ? (isResource ? ' <span class="chain-edge" title="Shared resource">⇢</span> ' : ' → ') : '';
      return arrow + escape(project.tasks[task].id);
    }).join('');
    return `<button class="result" data-candidate="${candidates.indexOf(candidate)}" aria-pressed="${selected === candidate}"><span class="tag ${candidate.type.toLowerCase()}">${candidate.type}</span><span>${path}</span><span class="duration">${number(candidate.finish)} d</span></button>`;
  }).join('');
  const counts = `${(candidates.length - cc).toLocaleString()} CP · ${cc.toLocaleString()} CC`;
  const summary = alternatives ? `Alternative schedules · ${counts} · ${orders.toLocaleString()} resource orders checked`
    : `${analysis.baselineOnly ? 'Precedence-only Gantt' : 'Current resource-leveled Gantt'} · ${counts}`;
  const detail = alternatives
    ? `${complete ? 'Search complete. Shortest schedule' : 'Partial search. Best schedule found'}: ${number(bestFinish)} days. <button class="small" id="best">Show schedule</button>`
    : `${complete ? '' : 'Result limit reached. This list is partial. '}${analysis.baselineOnly ? 'Switch to Resource-leveled to analyze its critical chains.' : 'CPs come from the precedence baseline. CCs come from the current resource-leveled schedule.'}`;
  const actions = alternatives
    ? '<button class="small" id="restore-method">Show slide-method schedule</button>'
    : '<button class="small" id="alternatives">Explore alternative schedules</button>';
  $('result-body').innerHTML = `<p><strong>${summary}</strong></p><p class="result-note">${detail}</p>
    <p class="result-note">Select a sequence to highlight it. Solid arrows (→) show precedence. Dashed arrows (⇢) show resource order.</p>
    <p>${actions}</p>
    ${list ? `<div class="result-list">${list}</div>` : '<p class="result-note">No matching candidates.</p>'}
    ${matches.length > visibleResults ? `<button id="more">Show more (${matches.length - visibleResults} remaining)</button>` : ''}`;
}

function analyzeCurrent() {
  const baselineOnly = $('gantt-mode').value === 'baseline';
  selected = null;
  visibleResults = 12;
  $('filter').value = 'all';
  analysis = {...analyzeSchedule(baseline, baselineOnly ? baseline : leveled), baselineOnly};
  renderSchedule();
  renderResults();
  $('results').scrollIntoView({block: 'nearest', behavior: 'smooth'});
}

function exploreAlternatives() {
  selected = null;
  analysis = null;
  visibleResults = 12;
  $('filter').value = 'all';
  notice('');
  renderSchedule();
  const finish = (result, error) => {
    worker?.terminate();
    worker = null;
    if (error) notice(error);
    analysis = result ?? null;
    renderResults();
  };
  try {
    worker = new Worker(new URL('./analysis-worker.js', import.meta.url), {type: 'module'});
    worker.onmessage = ({data}) => finish(data.result, data.error);
    worker.onerror = () => {
      try { finish(analyze(graph)); }
      catch (error) { finish(null, error.message); }
    };
    worker.postMessage(graph);
    renderResults();
  } catch {
    try { finish(analyze(graph)); }
    catch (error) { finish(null, error.message); }
  }
  $('results').scrollIntoView({block: 'nearest', behavior: 'smooth'});
}

function edit(kind, index) {
  editing = {kind, index};
  const item = project[kind][index];
  const isTask = kind === 'tasks';
  const options = project.departments.map(dept => `<option value="${escape(dept.id)}" ${dept.id === item?.department ? 'selected' : ''}>${escape(dept.name)}</option>`).join('');
  const predecessors = project.tasks.map((task, i) => i === index ? '' :
    `<label class="checkbox"><input type="checkbox" name="predecessor" value="${escape(task.id)}" ${item?.predecessors?.includes(task.id) ? 'checked' : ''}> ${escape(task.id)}</label>`).join('');
  const title = isTask ? 'activity' : 'department';
  $('dialog-title').textContent = `${item ? 'Edit' : 'Add'} ${title}`;
  $('fields').innerHTML = isTask ? `
    <label>Activity ID or name<input name="id" required maxlength="60" value="${escape(item?.id ?? '')}"></label>
    <label>Duration in days<input name="duration" type="number" min=".001" max="1000000" step=".001" required value="${item?.duration ?? ''}"></label>
    <label>Department<select name="department" required>${options}</select></label>
    <label>Predecessors</label><p class="muted">These activities must finish before this one starts.</p>
    ${predecessors ? `<div class="predecessors">${predecessors}</div>` : '<p class="muted">No other activities yet.</p>'}`
    : `<label>Department name<input name="name" required maxlength="60" value="${escape(item?.name ?? '')}"></label>
    <label>Department color<input name="color" type="color" value="${item?.color ?? palette[project.departments.length % palette.length]}"></label>`;
  $('form-error').hidden = true;
  $('delete-item').hidden = !item;
  $('editor-dialog').showModal();
}

function formError(message) {
  $('form-error').textContent = message;
  $('form-error').hidden = false;
}

$('editor-form').addEventListener('submit', event => {
  event.preventDefault();
  const {kind, index} = editing;
  const values = new FormData(event.target);
  const next = structuredClone(project);
  const old = next[kind][index];
  try {
    const item = kind === 'tasks' ? {
      id: values.get('id').trim(), duration: Number(values.get('duration')),
      department: values.get('department'), predecessors: values.getAll('predecessor')
    } : {id: old?.id ?? crypto.randomUUID(), name: values.get('name').trim(), color: values.get('color')};
    if (old) {
      next[kind][index] = item;
      if (kind === 'tasks' && old.id !== item.id)
        for (const task of next.tasks)
          task.predecessors = task.predecessors.map(id => id === old.id ? item.id : id);
    } else {
      next[kind].push(item);
    }
    replaceProject(next);
    $('editor-dialog').close();
  } catch (error) { formError(error.message); }
});
$('delete-item').onclick = () => {
  const {kind, index} = editing;
  const next = structuredClone(project);
  const [item] = next[kind].splice(index, 1);
  if (kind === 'departments' && next.tasks.some(task => task.department === item.id)) {
    formError('Move its activities to another department before deleting this department.');
    return;
  }
  if (kind === 'tasks')
    for (const task of next.tasks) task.predecessors = task.predecessors.filter(id => id !== item.id);
  replaceProject(next);
  $('editor-dialog').close();
};
$('close-dialog').onclick = $('cancel-dialog').onclick = () => $('editor-dialog').close();
$('add-department').onclick = () => edit('departments', -1);
$('add-task').onclick = () => edit('tasks', -1);
for (const kind of ['departments', 'tasks', 'flow']) {
  $(kind).onclick = event => {
    const target = event.target.closest('[data-index]');
    if (target) edit(kind === 'flow' ? 'tasks' : kind, Number(target.dataset.index));
  };
}
$('flow').onkeydown = event => {
  const target = event.target.closest('[data-index]');
  if (target && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    edit('tasks', Number(target.dataset.index));
  }
};
$('project-name').onchange = event => {
  project.name = event.target.value.trim() || 'Untitled project';
  event.target.value = project.name;
  saveProject();
};
$('gantt-mode').onchange = () => {
  selected = null;
  renderSchedule();
  renderResults();
};
$('analyze').onclick = analyzeCurrent;
$('filter').onchange = () => {
  visibleResults = 12;
  renderResults();
};
$('result-body').onclick = event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'more') {
    visibleResults += 24;
    renderResults();
    return;
  }
  if (button.id === 'alternatives') {
    exploreAlternatives();
    return;
  }
  if (button.id === 'restore-method') {
    leveled = methodPlan;
    $('gantt-mode').value = 'level';
    analyzeCurrent();
    return;
  }
  if (button.id === 'best') {
    leveled = schedule(graph, analysis.bestLinks);
    $('gantt-mode').value = 'level';
    analyzeCurrent();
    return;
  }
  if (button.dataset.candidate === undefined) return;
  selected = analysis.candidates[Number(button.dataset.candidate)];
  if (selected.type === 'CC' && analysis.orders !== undefined) leveled = schedule(graph, selected.links);
  $('gantt-mode').value = selected.type === 'CP' ? 'baseline' : 'level';
  renderSchedule();
  renderResults();
  $('gantt-mode').scrollIntoView({block: 'center', behavior: 'smooth'});
};
$('new-project').onclick = () => {
  if (confirm('Start a blank project? Export the current project first if you want to keep it.'))
    replaceProject({name:'Untitled project', departments:[], tasks:[]});
};
$('load-example').onclick = () => {
  if (confirm('Load the RGBM example from slide 9 and replace the current project?'))
    replaceProject(exampleProject());
};
$('import').onclick = () => $('file').click();
$('file').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const next = JSON.parse(await file.text());
    projectGraph(next);
    if (confirm('Replace the current project with this JSON file?')) replaceProject(next);
  } catch (error) { notice(`Import failed. ${error.message}`); }
};
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chainlab'}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
replaceProject(project);
