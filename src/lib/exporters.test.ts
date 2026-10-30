import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportScheduleBlocksToCsv,
  exportScheduleBlocksToIcs,
  parseAndValidateTasksCsv,
  sanitizeCsvCell,
} from './exporters';
import { ScheduleBlock } from '../types/lifeos';

test('1. CSV export sanitizes spreadsheet formula injection prefixes (=, +, -, @)', () => {
  assert.equal(sanitizeCsvCell('=cmd|" /C calc"!A0'), '"\'=cmd|"" /C calc""!A0"');
  assert.equal(sanitizeCsvCell('+SUM(A1:A10)'), '"\'+SUM(A1:A10)"');
  assert.equal(sanitizeCsvCell('-2+3'), '"\'-2+3"');
  assert.equal(sanitizeCsvCell('@IMPORTXML()'), '"\'@IMPORTXML()"');
  assert.equal(sanitizeCsvCell('Normal Task Title'), '"Normal Task Title"');
});

test('2. ICS export generates valid RFC 5545 VCALENDAR with VEVENT entries', () => {
  const blocks: ScheduleBlock[] = [
    {
      id: 'blk_1',
      userId: 'u1',
      planId: 'p1',
      scheduleVersion: 1,
      dateKey: '2026-10-30',
      startAt: '2026-10-30T14:00:00.000Z',
      endAt: '2026-10-30T15:30:00.000Z',
      durationMinutes: 90,
      title: 'CS 401 Lecture',
      category: 'academic',
      blockType: 'fixed',
      locked: true,
      status: 'planned',
      priority: 'critical',
      reasonCode: 'FIXED_COMMITMENT',
      source: 'scheduler',
      createdAt: '2026-10-30T10:00:00.000Z',
      updatedAt: '2026-10-30T10:00:00.000Z',
    },
  ];
  const ics = exportScheduleBlocksToIcs(blocks, 'America/New_York');
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('SUMMARY:CS 401 Lecture'));
  assert.ok(ics.includes('DTSTART:20261030T140000Z'));
  assert.ok(ics.includes('DTEND:20261030T153000Z'));
  assert.ok(ics.includes('END:VCALENDAR'));

  const csv = exportScheduleBlocksToCsv(blocks);
  assert.ok(csv.includes('"CS 401 Lecture"'));
});

test('3. CSV task import validates durations, malformed dates, and duplicate titles', () => {
  const csv = [
    'Title,Category,Priority,EstimatedMinutes,DueISO,Splittable,Description',
    'Write Systems Paper,academic,high,90,2026-11-05T17:00:00Z,true,Draft intro',
    'Write Systems Paper,academic,high,60,2026-11-05T17:00:00Z,true,Duplicate title',
    'Bad Duration Task,coding,medium,-15,not-a-date,false,Invalid row',
  ].join('\n');

  const results = parseAndValidateTasksCsv(csv);
  assert.equal(results.length, 3);
  assert.equal(results[0].valid, true);
  assert.equal(results[0].candidate?.estimatedMinutes, 90);
  assert.equal(results[1].valid, false);
  assert.ok(results[1].errors.some((e) => e.includes('Duplicate task title')));
  assert.equal(results[2].valid, false);
  assert.ok(results[2].errors.some((e) => e.includes('Invalid duration')));
  assert.ok(results[2].errors.some((e) => e.includes('Malformed due date')));
});
