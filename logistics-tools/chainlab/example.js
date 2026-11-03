export function exampleProject() {
  return {
    version: 1,
    name: 'RGBM Project',
    departments: [
      {id: 'red', name: 'Red', color: '#e35365'},
      {id: 'green', name: 'Green', color: '#73b84d'},
      {id: 'mint', name: 'Mint', color: '#23aa88'},
      {id: 'magenta', name: 'Magenta', color: '#b456b3'}
    ],
    tasks: [
      ['A-2', 15, 'red'], ['C-2', 15, 'mint'], ['E-2', 15, 'mint'], ['G-2', 15, 'red'],
      ['A-4', 10, 'green', 'A-2'], ['C-4', 5, 'green', 'C-2'], ['E-4', 5, 'green', 'E-2'], ['G-4', 15, 'mint', 'G-2'],
      ['B-6', 10, 'magenta', 'A-4', 'C-4'], ['F-6', 5, 'magenta', 'E-4', 'G-4']
    ].map(([id, duration, department, ...predecessors]) => ({id, duration, department, predecessors}))
  };
}
