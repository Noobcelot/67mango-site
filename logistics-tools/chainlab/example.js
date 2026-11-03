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

export function practiceProject() {
  const rows = [
    ['A-1',5,'magenta'], ['A-2',10,'black','A-1'], ['A-3',15,'green','A-2'],
    ['A-4',10,'red','A-3'], ['A-5',10,'magenta','A-4','B-4'], ['A-6',15,'red','A-5'],
    ['B-2',10,'magenta'], ['B-3',10,'blue','B-2'], ['B-4',5,'red','B-3'],
    ['C-3',15,'blue'], ['C-4',10,'green','C-3'], ['C-5',15,'red','C-4','D-4'],
    ['C-6',5,'magenta','C-5'], ['D-3',20,'blue'], ['D-4',5,'green','D-3']
  ];
  return {
    name:'CCM2 Practice Problem 1',
    departments:[
      {id:'red',name:'Red',color:'#ff5050'}, {id:'green',name:'Green',color:'#66bb33'},
      {id:'blue',name:'Blue',color:'#90c9da'}, {id:'magenta',name:'Magenta',color:'#f05aa5'},
      {id:'black',name:'Black',color:'#888888'}
    ],
    tasks:rows.map(([id,duration,department,...predecessors]) => ({id,duration,department,predecessors}))
  };
}
