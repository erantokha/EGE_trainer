// Apply the combined remaining trigonometry pass for №13:
// grouping + homogeneous + other methods.

import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCosPmInProto } from './part2_13_trig_solution_contract.mjs';
import { normalizeProtoTexStyle } from './part2_13_tex_style.mjs';

const ROOT = process.cwd();
const FILES = [
  path.join(ROOT, 'content/tasks/part2/13/13.trig.group.json'),
  path.join(ROOT, 'content/tasks/part2/13/13.trig.homog.json'),
  path.join(ROOT, 'content/tasks/part2/13/13.trig.other.json'),
  path.join(ROOT, 'reports/part2_content_draft/part2_13.json'),
];

const FIXES = {
  '13.trig.other.81.1': {
    groups: [
      group('\\sin x = 0', [], ['x = \\pi n']),
      group('2 \\cos x - 1 = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
    ],
    answer: [
      'x = \\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.other.81.2': {
    groups: [
      group('\\sin x = 0', [], ['x = \\pi n']),
      group('2 \\cos x - \\sqrt{2} = 0', ['\\cos x = \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{\\pi}{4} + 2\\pi n']),
    ],
    answer: [
      'x = \\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.other.81.3': {
    groups: [
      group('\\sin x = 0', [], ['x = \\pi n']),
      group('2 \\cos x + 1 = 0', ['\\cos x = - \\frac{1}{2}'], ['x = \\pm \\frac{2 \\pi}{3} + 2\\pi n']),
    ],
    answer: [
      'x = \\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{2 \\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.other.83.1': {
    groups: [
      group('\\cos x = 0', [], ['x = \\frac{\\pi}{2} + \\pi n']),
      group('2 \\cos x - 1 = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
    ],
    answer: [
      'x = \\frac{\\pi}{2} + \\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.other.83.2': {
    groups: [
      group('\\cos x = 0', [], ['x = \\frac{\\pi}{2} + \\pi n']),
      group('2 \\cos x - \\sqrt{2} = 0', ['\\cos x = \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{\\pi}{4} + 2\\pi n']),
    ],
    answer: [
      'x = \\frac{\\pi}{2} + \\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.other.83.3': {
    groups: [
      group('\\cos x = 0', [], ['x = \\frac{\\pi}{2} + \\pi n']),
      group('2 \\cos x + \\sqrt{2} = 0', ['\\cos x = - \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{3 \\pi}{4} + 2\\pi n']),
    ],
    answer: [
      'x = \\frac{\\pi}{2} + \\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\pm \\frac{3 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.other.85.1': {
    groups: [
      group('2 \\cos x + 1 = 0', ['\\cos x = - \\frac{1}{2}'], ['x = \\pm \\frac{2 \\pi}{3} + 2\\pi n']),
      noRootGroup('\\cos^2 x + 1 = 0'),
    ],
    answer: ['x = \\pm \\frac{2 \\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.85.2': {
    groups: [
      group('2 \\cos x + \\sqrt{2} = 0', ['\\cos x = - \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{3 \\pi}{4} + 2\\pi n']),
      noRootGroup('\\cos^2 x + 1 = 0'),
    ],
    answer: ['x = \\pm \\frac{3 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.85.3': {
    groups: [
      group('2 \\cos x - 1 = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
      noRootGroup('\\cos^2 x + 1 = 0'),
    ],
    answer: ['x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.group.76.1': {
    groups: [
      group('\\cos x - \\frac{1}{2} = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
      group('\\sin x + 1 = 0', ['\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
    ],
    answer: [
      'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{3 \\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.group.76.2': {
    groups: [
      group('\\cos x - \\frac{\\sqrt{2}}{2} = 0', ['\\cos x = \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{\\pi}{4} + 2\\pi n']),
      group('\\sin x + 1 = 0', ['\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
    ],
    answer: [
      'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{3 \\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.group.76.3': {
    groups: [
      group('\\cos x - \\frac{\\sqrt{3}}{2} = 0', ['\\cos x = \\frac{\\sqrt{3}}{2}'], ['x = \\pm \\frac{\\pi}{6} + 2\\pi n']),
      group('\\sin x + 1 = 0', ['\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
    ],
    answer: [
      'x = \\pm \\frac{\\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{3 \\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.group.77.1': {
    groups: [
      group('\\cos x - 1 = 0', ['\\cos x = 1'], ['x = 2\\pi n']),
      group('2 \\sin x + \\sqrt{2} = 0', ['\\sin x = - \\frac{\\sqrt{2}}{2}'], ['x = \\frac{5 \\pi}{4} + 2\\pi n', 'x = \\frac{7 \\pi}{4} + 2\\pi n']),
    ],
  },
  '13.trig.group.77.2': {
    groups: [
      group('\\cos x - 1 = 0', ['\\cos x = 1'], ['x = 2\\pi n']),
      group('2 \\sin x + \\sqrt{3} = 0', ['\\sin x = - \\frac{\\sqrt{3}}{2}'], ['x = \\frac{4 \\pi}{3} + 2\\pi n', 'x = \\frac{5 \\pi}{3} + 2\\pi n']),
    ],
  },
  '13.trig.group.77.3': {
    groups: [
      group('\\cos x - 1 = 0', ['\\cos x = 1'], ['x = 2\\pi n']),
      group('2 \\sin x + 2 = 0', ['\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
    ],
  },
  '13.trig.homog.5.1': {
    steps: [
      '3 \\cos\\bigl(x - \\frac{\\pi}{6}\\bigr) - \\sqrt{3} \\cos x = 0',
      '3 \\bigl(\\frac{\\sqrt{3}}{2} \\cos x + \\frac{1}{2} \\sin x\\bigr) - \\sqrt{3} \\cos x = 0',
      '\\frac{3 \\sqrt{3}}{2} \\cos x + \\frac{3}{2} \\sin x - \\sqrt{3} \\cos x = 0',
      '\\frac{3}{2} \\sin x + \\frac{\\sqrt{3}}{2} \\cos x = 0',
      '\\cos x \\ne 0',
      '\\frac{3}{2}\\operatorname{tg}x + \\frac{\\sqrt{3}}{2} = 0',
      '\\operatorname{tg} x = - \\frac{\\sqrt{3}}{3}',
    ],
    groups: [group('\\operatorname{tg} x = - \\frac{\\sqrt{3}}{3}', [], ['x = - \\frac{\\pi}{6} + \\pi n'])],
  },
  '13.trig.homog.5.2': {
    steps: [
      '\\cos\\bigl(x - \\frac{\\pi}{4}\\bigr) - \\sqrt{2} \\cos x = 0',
      '\\bigl(\\frac{\\sqrt{2}}{2} \\cos x + \\frac{\\sqrt{2}}{2} \\sin x\\bigr) - \\sqrt{2} \\cos x = 0',
      '\\frac{\\sqrt{2}}{2} \\cos x + \\frac{\\sqrt{2}}{2} \\sin x - \\sqrt{2} \\cos x = 0',
      '\\frac{\\sqrt{2}}{2} \\sin x - \\frac{\\sqrt{2}}{2} \\cos x = 0',
      '\\cos x \\ne 0',
      '\\frac{\\sqrt{2}}{2}\\operatorname{tg}x - \\frac{\\sqrt{2}}{2} = 0',
      '\\operatorname{tg} x = 1',
    ],
    groups: [group('\\operatorname{tg} x = 1', [], ['x = \\frac{\\pi}{4} + \\pi n'])],
  },
  '13.trig.homog.5.3': {
    steps: [
      '\\cos\\bigl(x - \\frac{\\pi}{3}\\bigr) - \\cos x = 0',
      '\\bigl(\\frac{1}{2} \\cos x + \\frac{\\sqrt{3}}{2} \\sin x\\bigr) - \\cos x = 0',
      '\\frac{1}{2} \\cos x + \\frac{\\sqrt{3}}{2} \\sin x - \\cos x = 0',
      '\\frac{\\sqrt{3}}{2} \\sin x - \\frac{1}{2} \\cos x = 0',
      '\\cos x \\ne 0',
      '\\frac{\\sqrt{3}}{2}\\operatorname{tg}x - \\frac{1}{2} = 0',
      '\\operatorname{tg} x = \\frac{\\sqrt{3}}{3}',
    ],
    groups: [group('\\operatorname{tg} x = \\frac{\\sqrt{3}}{3}', [], ['x = \\frac{\\pi}{6} + \\pi n'])],
  },
};

Object.assign(FIXES, {
  '13.trig.group.76.1': {
    steps: [
      '2 \\sin x\\bigl(\\cos x - \\frac{1}{2}\\bigr) + 2\\bigl(\\cos x - \\frac{1}{2}\\bigr) = 0',
      '\\bigl(\\cos x - \\frac{1}{2}\\bigr)\\bigl(2\\sin x + 2\\vphantom{\\frac{1}{2}}\\bigr) = 0',
    ],
    groups: [
      group('\\cos x - \\frac{1}{2} = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
      group('2 \\sin x + 2 = 0', ['\\sin x + 1 = 0', '\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
    ],
    answer: [
      'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{3 \\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.group.76.2': {
    steps: [
      '2 \\sin x\\bigl(\\cos x - \\frac{\\sqrt{2}}{2}\\bigr) + 2\\bigl(\\cos x - \\frac{\\sqrt{2}}{2}\\bigr) = 0',
      '\\bigl(\\cos x - \\frac{\\sqrt{2}}{2}\\bigr)\\bigl(2\\sin x + 2\\vphantom{\\frac{\\sqrt{2}}{2}}\\bigr) = 0',
    ],
    groups: [
      group('\\cos x - \\frac{\\sqrt{2}}{2} = 0', ['\\cos x = \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{\\pi}{4} + 2\\pi n']),
      group('2 \\sin x + 2 = 0', ['\\sin x + 1 = 0', '\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
    ],
    answer: [
      'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{3 \\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.group.76.3': {
    steps: [
      '2 \\sin x\\bigl(\\cos x - \\frac{\\sqrt{3}}{2}\\bigr) + 2\\bigl(\\cos x - \\frac{\\sqrt{3}}{2}\\bigr) = 0',
      '\\bigl(\\cos x - \\frac{\\sqrt{3}}{2}\\bigr)\\bigl(2\\sin x + 2\\vphantom{\\frac{\\sqrt{3}}{2}}\\bigr) = 0',
    ],
    groups: [
      group('\\cos x - \\frac{\\sqrt{3}}{2} = 0', ['\\cos x = \\frac{\\sqrt{3}}{2}'], ['x = \\pm \\frac{\\pi}{6} + 2\\pi n']),
      group('2 \\sin x + 2 = 0', ['\\sin x + 1 = 0', '\\sin x = -1'], ['x = \\frac{3 \\pi}{2} + 2\\pi n']),
    ],
    answer: [
      'x = \\pm \\frac{\\pi}{6} + 2\\pi n,\\ n \\in \\mathbb{Z}',
      'x = \\frac{3 \\pi}{2} + 2\\pi n,\\ n \\in \\mathbb{Z}',
    ],
  },
  '13.trig.other.81.1': {
    steps: [
      '4 \\sin x \\cos^2 x - 4 \\sin x \\cos x + \\sin x = 0',
      '\\sin x\\bigl(4 \\cos^2 x - 4 \\cos x + 1\\bigr) = 0',
    ],
    groups: [
      group('\\sin x = 0', [], ['x = \\pi n']),
      quadraticCosGroup('4 \\cos^2 x - 4 \\cos x + 1 = 0', '4t^2 - 4t + 1 = 0', '\\bigl(-4\\bigr)^2 - 4 \\cdot 4 \\cdot 1 = 16 - 16 = 0', '\\frac{-b}{2a} = \\frac{4}{8} = \\frac{1}{2}', '\\cos x = \\frac{1}{2}', 'x = \\pm \\frac{\\pi}{3} + 2\\pi n'),
    ],
    answer: ['x = \\pi n,\\ n \\in \\mathbb{Z}', 'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.81.2': {
    steps: [
      '4 \\sin x \\cos^2 x - 4 \\sqrt{2} \\sin x \\cos x + 2 \\sin x = 0',
      '\\sin x\\bigl(4 \\cos^2 x - 4 \\sqrt{2} \\cos x + 2\\bigr) = 0',
    ],
    groups: [
      group('\\sin x = 0', [], ['x = \\pi n']),
      quadraticCosGroup('4 \\cos^2 x - 4 \\sqrt{2} \\cos x + 2 = 0', '4t^2 - 4\\sqrt{2}t + 2 = 0', '\\bigl(-4\\sqrt{2}\\bigr)^2 - 4 \\cdot 4 \\cdot 2 = 32 - 32 = 0', '\\frac{-b}{2a} = \\frac{4\\sqrt{2}}{8} = \\frac{\\sqrt{2}}{2}', '\\cos x = \\frac{\\sqrt{2}}{2}', 'x = \\pm \\frac{\\pi}{4} + 2\\pi n'),
    ],
    answer: ['x = \\pi n,\\ n \\in \\mathbb{Z}', 'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.81.3': {
    steps: [
      '4 \\sin x \\cos^2 x + 4 \\sin x \\cos x + \\sin x = 0',
      '\\sin x\\bigl(4 \\cos^2 x + 4 \\cos x + 1\\bigr) = 0',
    ],
    groups: [
      group('\\sin x = 0', [], ['x = \\pi n']),
      quadraticCosGroup('4 \\cos^2 x + 4 \\cos x + 1 = 0', '4t^2 + 4t + 1 = 0', '4^2 - 4 \\cdot 4 \\cdot 1 = 16 - 16 = 0', '\\frac{-b}{2a} = -\\frac{4}{8} = -\\frac{1}{2}', '\\cos x = - \\frac{1}{2}', 'x = \\pm \\frac{2 \\pi}{3} + 2\\pi n'),
    ],
    answer: ['x = \\pi n,\\ n \\in \\mathbb{Z}', 'x = \\pm \\frac{2 \\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.83.1': {
    steps: [
      '4 \\cos^3 x - 4 \\cos^2 x + \\cos x = 0',
      '\\cos x\\bigl(4 \\cos^2 x - 4 \\cos x + 1\\bigr) = 0',
    ],
    groups: [
      group('\\cos x = 0', [], ['x = \\frac{\\pi}{2} + \\pi n']),
      quadraticCosGroup('4 \\cos^2 x - 4 \\cos x + 1 = 0', '4t^2 - 4t + 1 = 0', '\\bigl(-4\\bigr)^2 - 4 \\cdot 4 \\cdot 1 = 16 - 16 = 0', '\\frac{-b}{2a} = \\frac{4}{8} = \\frac{1}{2}', '\\cos x = \\frac{1}{2}', 'x = \\pm \\frac{\\pi}{3} + 2\\pi n'),
    ],
    answer: ['x = \\frac{\\pi}{2} + \\pi n,\\ n \\in \\mathbb{Z}', 'x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.83.2': {
    steps: [
      '4 \\cos^3 x - 4 \\sqrt{2} \\cos^2 x + 2 \\cos x = 0',
      '\\cos x\\bigl(4 \\cos^2 x - 4 \\sqrt{2} \\cos x + 2\\bigr) = 0',
    ],
    groups: [
      group('\\cos x = 0', [], ['x = \\frac{\\pi}{2} + \\pi n']),
      quadraticCosGroup('4 \\cos^2 x - 4 \\sqrt{2} \\cos x + 2 = 0', '4t^2 - 4\\sqrt{2}t + 2 = 0', '\\bigl(-4\\sqrt{2}\\bigr)^2 - 4 \\cdot 4 \\cdot 2 = 32 - 32 = 0', '\\frac{-b}{2a} = \\frac{4\\sqrt{2}}{8} = \\frac{\\sqrt{2}}{2}', '\\cos x = \\frac{\\sqrt{2}}{2}', 'x = \\pm \\frac{\\pi}{4} + 2\\pi n'),
    ],
    answer: ['x = \\frac{\\pi}{2} + \\pi n,\\ n \\in \\mathbb{Z}', 'x = \\pm \\frac{\\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.83.3': {
    steps: [
      '4 \\cos^3 x + 4 \\sqrt{2} \\cos^2 x + 2 \\cos x = 0',
      '\\cos x\\bigl(4 \\cos^2 x + 4 \\sqrt{2} \\cos x + 2\\bigr) = 0',
    ],
    groups: [
      group('\\cos x = 0', [], ['x = \\frac{\\pi}{2} + \\pi n']),
      quadraticCosGroup('4 \\cos^2 x + 4 \\sqrt{2} \\cos x + 2 = 0', '4t^2 + 4\\sqrt{2}t + 2 = 0', '\\bigl(4\\sqrt{2}\\bigr)^2 - 4 \\cdot 4 \\cdot 2 = 32 - 32 = 0', '\\frac{-b}{2a} = -\\frac{4\\sqrt{2}}{8} = -\\frac{\\sqrt{2}}{2}', '\\cos x = - \\frac{\\sqrt{2}}{2}', 'x = \\pm \\frac{3 \\pi}{4} + 2\\pi n'),
    ],
    answer: ['x = \\frac{\\pi}{2} + \\pi n,\\ n \\in \\mathbb{Z}', 'x = \\pm \\frac{3 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.85.1': {
    steps: [
      '\\cos^2 x\\bigl(2 \\cos x + 1\\bigr) + \\bigl(2 \\cos x + 1\\bigr) = 0',
      '\\bigl(2 \\cos x + 1\\bigr)\\bigl(\\cos^2 x + 1\\bigr) = 0',
    ],
    groups: [
      group('2 \\cos x + 1 = 0', ['\\cos x = - \\frac{1}{2}'], ['x = \\pm \\frac{2 \\pi}{3} + 2\\pi n']),
      noRootGroup('\\cos^2 x + 1 = 0'),
    ],
    answer: ['x = \\pm \\frac{2 \\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.85.2': {
    steps: [
      '\\cos^2 x\\bigl(2 \\cos x + \\sqrt{2}\\bigr) + \\bigl(2 \\cos x + \\sqrt{2}\\bigr) = 0',
      '\\bigl(2 \\cos x + \\sqrt{2}\\bigr)\\bigl(\\cos^2 x + 1\\bigr) = 0',
    ],
    groups: [
      group('2 \\cos x + \\sqrt{2} = 0', ['\\cos x = - \\frac{\\sqrt{2}}{2}'], ['x = \\pm \\frac{3 \\pi}{4} + 2\\pi n']),
      noRootGroup('\\cos^2 x + 1 = 0'),
    ],
    answer: ['x = \\pm \\frac{3 \\pi}{4} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.85.3': {
    steps: [
      '\\cos^2 x\\bigl(2 \\cos x - 1\\bigr) + \\bigl(2 \\cos x - 1\\bigr) = 0',
      '\\bigl(2 \\cos x - 1\\bigr)\\bigl(\\cos^2 x + 1\\bigr) = 0',
    ],
    groups: [
      group('2 \\cos x - 1 = 0', ['\\cos x = \\frac{1}{2}'], ['x = \\pm \\frac{\\pi}{3} + 2\\pi n']),
      noRootGroup('\\cos^2 x + 1 = 0'),
    ],
    answer: ['x = \\pm \\frac{\\pi}{3} + 2\\pi n,\\ n \\in \\mathbb{Z}'],
  },
  '13.trig.other.101.1': halfAngleFix(
    ['\\cos x - \\cos\\frac{x}{2} + 1 = 0', '2 \\cos^2\\alpha - \\cos\\alpha = 0', '\\cos\\alpha\\bigl(2\\cos\\alpha - 1\\bigr) = 0'],
    '2\\cos\\alpha - 1 = 0',
    '\\cos\\alpha = \\frac{1}{2}',
    '\\alpha = \\pm \\frac{\\pi}{3} + 2\\pi n',
    'x = \\pm \\frac{2 \\pi}{3} + 4\\pi n',
    'x = \\pm \\frac{2 \\pi}{3} + 4\\pi n,\\ n \\in \\mathbb{Z}'
  ),
  '13.trig.other.101.2': halfAngleFix(
    ['\\cos x - \\sqrt{2}\\cos\\frac{x}{2} + 1 = 0', '2 \\cos^2\\alpha - \\sqrt{2}\\cos\\alpha = 0', '\\cos\\alpha\\bigl(2\\cos\\alpha - \\sqrt{2}\\bigr) = 0'],
    '2\\cos\\alpha - \\sqrt{2} = 0',
    '\\cos\\alpha = \\frac{\\sqrt{2}}{2}',
    '\\alpha = \\pm \\frac{\\pi}{4} + 2\\pi n',
    'x = \\pm \\frac{\\pi}{2} + 4\\pi n',
    'x = \\pm \\frac{\\pi}{2} + 4\\pi n,\\ n \\in \\mathbb{Z}'
  ),
  '13.trig.other.101.3': halfAngleFix(
    ['\\cos x - \\sqrt{3}\\cos\\frac{x}{2} + 1 = 0', '2 \\cos^2\\alpha - \\sqrt{3}\\cos\\alpha = 0', '\\cos\\alpha\\bigl(2\\cos\\alpha - \\sqrt{3}\\bigr) = 0'],
    '2\\cos\\alpha - \\sqrt{3} = 0',
    '\\cos\\alpha = \\frac{\\sqrt{3}}{2}',
    '\\alpha = \\pm \\frac{\\pi}{6} + 2\\pi n',
    'x = \\pm \\frac{\\pi}{3} + 4\\pi n',
    'x = \\pm \\frac{\\pi}{3} + 4\\pi n,\\ n \\in \\mathbb{Z}'
  ),
});

function group(head, steps, series) {
  const out = { head };
  if (steps.length) out.steps = steps;
  if (series.length) out.series = series;
  return out;
}

function noRootGroup(head) {
  return group(head, [
    '\\cos^2 x = -1',
    '\\text{корней нет, так как } \\cos^2 x \\ge 0',
  ], []);
}

function quadraticCosGroup(head, equation, discr, root, trigStep, series) {
  return group(head, [
    't = \\cos x',
    equation,
    'D = b^2 - 4ac',
    `D = ${discr}`,
    `t = ${root}`,
    trigStep,
  ], [series]);
}

function halfAngleFix(stepsAfterSubstitution, secondHead, secondTrigStep, secondAlpha, secondSeries, secondAnswer) {
  return {
    steps: [
      '\\text{Пусть } \\alpha = \\frac{x}{2},\\quad x = 2\\alpha',
      ...stepsAfterSubstitution,
    ],
    groups: [
      group('\\cos\\alpha = 0', [
        '\\alpha = \\frac{\\pi}{2} + \\pi n',
        'x = 2\\alpha',
      ], ['x = \\pi + 2\\pi n']),
      group(secondHead, [
        secondTrigStep,
        secondAlpha,
        'x = 2\\alpha',
      ], [secondSeries]),
    ],
    answer: [
      'x = \\pi + 2\\pi n,\\ n \\in \\mathbb{Z}',
      secondAnswer,
    ],
  };
}

function applyFix(proto, fix) {
  if (fix.steps) proto.solution.steps = fix.steps.slice();
  if (fix.groups) proto.solution.gen_groups = fix.groups.map((g) => ({
    ...g,
    steps: g.steps?.slice(),
    series: g.series?.slice(),
  }));
  if (fix.answer) proto.answer.general = fix.answer.slice();
  return true;
}

function visit(value, changedIds) {
  if (!value || typeof value !== 'object') return;
  const fix = FIXES[value.id];
  if (fix) {
    applyFix(value, fix);
    normalizeCosPmInProto(value);
    normalizeProtoTexStyle(value);
    changedIds.add(value.id);
  }
  if (Array.isArray(value)) {
    for (const item of value) visit(item, changedIds);
    return;
  }
  for (const item of Object.values(value)) visit(item, changedIds);
}

for (const file of FILES) {
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  const changedIds = new Set();
  visit(data, changedIds);
  if (changedIds.size) await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`${path.relative(ROOT, file)}: ${changedIds.size} ids changed`);
  for (const id of [...changedIds].sort()) console.log(`  ${id}`);
}
