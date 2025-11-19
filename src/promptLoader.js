const fs = require('fs');
const path = require('path');

class PromptLoader {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.cache = new Map();
  }

  resolve(relPath) {
    return path.resolve(this.baseDir, relPath);
  }

  async load(relPath) {
    const fullPath = this.resolve(relPath);
    if (this.cache.has(fullPath)) {
      return this.cache.get(fullPath);
    }

    const contents = await fs.promises.readFile(fullPath, 'utf8');
    this.cache.set(fullPath, contents);
    return contents;
  }

  invalidate(relPath) {
    const fullPath = this.resolve(relPath);
    this.cache.delete(fullPath);
  }

  clear() {
    this.cache.clear();
  }
}

function renderTemplate(template, data) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, rawKey) => {
    const keyParts = rawKey.split('.');
    let value = data;
    for (const part of keyParts) {
      if (value && Object.prototype.hasOwnProperty.call(value, part)) {
        value = value[part];
      } else {
        value = undefined;
        break;
      }
    }
    return value !== undefined ? String(value) : '';
  });
}

module.exports = {
  PromptLoader,
  renderTemplate
};

