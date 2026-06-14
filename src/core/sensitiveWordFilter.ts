import { SensitiveWordHit, ContentCheckResult } from '../types';

interface TrieNode {
  children: Map<string, TrieNode>;
  isEnd: boolean;
}

export class SensitiveWordFilter {
  private root: TrieNode;
  private sensitiveWords: Set<string>;
  private replaceChar: string;

  constructor(replaceChar: string = '*') {
    this.root = { children: new Map(), isEnd: false };
    this.sensitiveWords = new Set();
    this.replaceChar = replaceChar;
  }

  addWord(word: string): void {
    if (!word || word.trim() === '') return;
    const lowerWord = word.toLowerCase().trim();
    if (this.sensitiveWords.has(lowerWord)) return;

    this.sensitiveWords.add(lowerWord);
    let node = this.root;
    for (const char of lowerWord) {
      if (!node.children.has(char)) {
        node.children.set(char, { children: new Map(), isEnd: false });
      }
      node = node.children.get(char)!;
    }
    node.isEnd = true;
  }

  addWords(words: string[]): void {
    words.forEach(word => this.addWord(word));
  }

  removeWord(word: string): boolean {
    const lowerWord = word.toLowerCase().trim();
    if (!this.sensitiveWords.has(lowerWord)) return false;
    this.sensitiveWords.delete(lowerWord);
    this.rebuildTrie();
    return true;
  }

  clear(): void {
    this.sensitiveWords.clear();
    this.root = { children: new Map(), isEnd: false };
  }

  private rebuildTrie(): void {
    this.root = { children: new Map(), isEnd: false };
    this.sensitiveWords.forEach(word => {
      let node = this.root;
      for (const char of word) {
        if (!node.children.has(char)) {
          node.children.set(char, { children: new Map(), isEnd: false });
        }
        node = node.children.get(char)!;
      }
      node.isEnd = true;
    });
  }

  check(content: string): ContentCheckResult {
    const hits: SensitiveWordHit[] = [];
    const lowerContent = content.toLowerCase();
    const chars = Array.from(lowerContent);
    const originalChars = Array.from(content);

    let filteredChars = [...originalChars];

    for (let i = 0; i < chars.length; i++) {
      let node = this.root;
      let j = i;
      let foundEnd = -1;

      while (j < chars.length && node.children.has(chars[j])) {
        node = node.children.get(chars[j])!;
        if (node.isEnd) {
          foundEnd = j;
        }
        j++;
      }

      if (foundEnd !== -1) {
        const word = lowerContent.substring(i, foundEnd + 1);
        hits.push({
          word,
          position: i,
          length: foundEnd - i + 1
        });
        for (let k = i; k <= foundEnd; k++) {
          filteredChars[k] = this.replaceChar;
        }
        i = foundEnd;
      }
    }

    return {
      passed: hits.length === 0,
      hits,
      filteredContent: filteredChars.join('')
    };
  }

  hasSensitiveWord(content: string): boolean {
    const result = this.check(content);
    return !result.passed;
  }

  filter(content: string): string {
    const result = this.check(content);
    return result.filteredContent;
  }

  getWordCount(): number {
    return this.sensitiveWords.size;
  }

  getAllWords(): string[] {
    return Array.from(this.sensitiveWords);
  }
}

export const defaultSensitiveWords = [
  '广告',
  '刷单',
  '诈骗',
  '赌博',
  '色情',
  '暴力',
  '毒品',
  '传销',
  '代办',
  '贷款',
  '兼职日结',
  '加微信',
  '加QQ',
  '微信号',
  'qq号',
  '联系方式'
];

export function createDefaultFilter(): SensitiveWordFilter {
  const filter = new SensitiveWordFilter();
  filter.addWords(defaultSensitiveWords);
  return filter;
}
