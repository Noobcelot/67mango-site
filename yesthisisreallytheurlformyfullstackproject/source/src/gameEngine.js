class TrieNode {
  constructor(depth, substring) {
    this.depth = depth;
    this.substring = substring;
    this.children = {};
    this.letter = '';
    this.parent = null;
    this.isLeaf = false;
    this.desired = {};
    this.undesired = {};
  }
}

export function buildTrie(words) {
  const root = new TrieNode(0, '');
  const leafNodes = [];

  for (const word of words) {
    let current = root;
    for (const letter of word) {
      if (!(letter in current.children)) {
        const node = new TrieNode(current.depth + 1, current.substring + letter);
        node.parent = current;
        node.letter = letter;
        current.children[letter] = node;
      }
      current = current.children[letter];
    }
    current.isLeaf = true;
    leafNodes.push(current);
  }

  for (const leaf of leafNodes) {
    let current = leaf;
    if (leaf.depth % 2 === 1) {
      while (current.parent !== null) {
        const parent = current.parent;
        parent.desired[current.letter] = current;
        current = parent;
      }
    } else {
      while (current.parent !== null) {
        const parent = current.parent;
        parent.undesired[current.letter] = current;
        current = parent;
      }
    }
  }

  return root;
}

export function getComputerMove(node, hardMode = true) {
  if (hardMode) {
    for (const [letter, child] of Object.entries(node.desired)) {
      if (!(letter in node.undesired)) {
        return letter;
      }
    }
    for (const letter of Object.keys(node.desired)) {
      return letter;
    }
  } else {
    for (const [letter] of Object.entries(node.desired)) {
      if (letter in node.undesired) {
        return letter;
      }
    }
    for (const letter of Object.keys(node.desired)) {
      return letter;
    }
  }
  return Object.keys(node.children)[0];
}
