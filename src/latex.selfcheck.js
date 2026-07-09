// Run: node src/latex.selfcheck.js
import assert from 'node:assert';
import { escapeLatex, fillTemplate } from './latex.js';

assert.strictEqual(
  escapeLatex('R&D 100% #1 _test_ {x} ~a^ $5 \\cmd'),
  'R\\&D 100\\% \\#1 \\_test\\_ \\{x\\} \\textasciitilde{}a\\textasciicircum{} \\$5 \\textbackslash{}cmd'
);
assert.strictEqual(fillTemplate('Hi {{NAME}}!', { NAME: 'Bob' }), 'Hi Bob!');
assert.strictEqual(fillTemplate('{{A}}{{B}}', { A: 'x', B: '' }), 'x');
assert.throws(() => fillTemplate('{{MISSING}}', {}), /Unfilled/);
console.log('latex.js self-check OK');
