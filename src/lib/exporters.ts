import { ActivityLog, PriorityLevel, ScheduleBlock, Task, TaskCategory } from '../types/lifeos';

/**
 * Protects against spreadsheet formula injection (CSV Injection) by prefixing cells
 * that begin with '=', '+', '-', '@', '\t', or '\r' with a single quote, and properly quoting CSV values.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const trimmed = raw.trimStart();
  const needsFormulaEscape =
    trimmed.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(trimmed[0]);
  const safeContent = needsFormulaEscape ? `'${raw}` : raw;
  const escapedQuotes = safeContent.replace(/"/g, '""');
  return `"${escapedQuotes}"`;
}

/**
 * Exports ScheduleBlocks as a formula-safe CSV string.
 */
export function exportScheduleBlocksToCsv(blocks: ScheduleBlock[]): string {
  const headers = [
    'ID',
    'Date',
    'Title',
    'Category',
    'BlockType',
    'StartISO',
    'EndISO',
    'DurationMinutes',
    'Priority',
    'Locked',
    'Status',
    'ReasonCode',
  ];

  const rows = blocks.map((b) =>
    [
      b.id,
      b.dateKey,
      b.title,
      b.category,
      b.blockType,
      b.startAt,
      b.endAt,
      b.durationMinutes,
      b.priority,
      b.locked,
      b.status,
      b.reasonCode,
    ]
      .map(sanitizeCsvCell)
      .join(',')
  );

  return [headers.map(sanitizeCsvCell).join(','), ...rows].join('\n');
}

/**
 * Exports Tasks and ActivityLogs as a formatted JSON bundle.
 */
export function exportWorkspaceToJson(data: {
  exportedAt: string;
  timezone: string;
  tasks: Task[];
  scheduleBlocks: ScheduleBlock[];
  activities: ActivityLog[];
}): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Formats an ISO string into RFC 5545 UTC timestamp YYYYMMDDTHHMMSSZ.
 */
function formatIcsUtcTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return '20261030T120000Z';
  }
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Exports ScheduleBlocks to a valid RFC 5545 iCalendar (.ics) file string.
 */
export function exportScheduleBlocksToIcs(blocks: ScheduleBlock[], timezone: string): string {
  const nowStamp = formatIcsUtcTimestamp(new Date().toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LifeOS//Adaptive Personal Operating System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-TIMEZONE:${escapeIcsText(timezone || 'UTC')}`,
  ];

  for (const b of blocks) {
    if (b.blockType === 'break') continue;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(b.id)}@lifeos.app`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${formatIcsUtcTimestamp(b.startAt)}`);
    lines.push(`DTEND:${formatIcsUtcTimestamp(b.endAt)}`);
    lines.push(`SUMMARY:${escapeIcsText(b.title)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(
        `Category: ${b.category} | Priority: ${b.priority} | Reason: ${b.reasonCode}`
      )}`
    );
    lines.push(`STATUS:${b.status === 'completed' ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export interface CsvTaskImportPreviewItem {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  candidate?: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
}

const VALID_CATEGORIES: TaskCategory[] = [
  'academic',
  'coding',
  'work',
  'fitness',
  'hobby',
  'personal',
];
const VALID_PRIORITIES: PriorityLevel[] = ['low', 'medium', 'high', 'critical'];

/**
 * Parses a CSV string of tasks (Columns: Title,Category,Priority,EstimatedMinutes,DueISO,Splittable,Description)
 * and returns a validated preview list.
 */
export function parseAndValidateTasksCsv(
  csvText: string,
  existingTitles: Set<string> = new Set()
): CsvTaskImportPreviewItem[] {
  const lines = (csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const splitCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  // Detect header row if first cell is "title"
  const firstCells = splitCsvLine(lines[0]);
  const startIdx = firstCells[0]?.toLowerCase() === 'title' ? 1 : 0;

  const seenInBatch = new Set<string>();
  const results: CsvTaskImportPreviewItem[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const [
      rawTitle = '',
      rawCategory = 'personal',
      rawPriority = 'medium',
      rawEstimated = '45',
      rawDueAt = '',
      rawSplittable = 'true',
      rawDescription = '',
    ] = cells;

    const errors: string[] = [];
    const title = rawTitle.replace(/^'+/, '').trim();
    if (!title || title.length > 200) {
      errors.push('Title is required and must be under 200 characters.');
    }

    const normalizedTitleKey = title.toLowerCase();
    if (seenInBatch.has(normalizedTitleKey) || existingTitles.has(normalizedTitleKey)) {
      errors.push(`Duplicate task title "${title}".`);
    }
    seenInBatch.add(normalizedTitleKey);

    const catLower = rawCategory.toLowerCase() as TaskCategory;
    const category: TaskCategory = VALID_CATEGORIES.includes(catLower) ? catLower : 'personal';
    if (!VALID_CATEGORIES.includes(catLower)) {
      errors.push(`Invalid category "${rawCategory}". Allowed: ${VALID_CATEGORIES.join(', ')}.`);
    }

    const prioLower = rawPriority.toLowerCase() as PriorityLevel;
    const priority: PriorityLevel = VALID_PRIORITIES.includes(prioLower) ? prioLower : 'medium';
    if (!VALID_PRIORITIES.includes(prioLower)) {
      errors.push(`Invalid priority "${rawPriority}". Allowed: low, medium, high, critical.`);
    }

    const estimatedMinutes = Number(rawEstimated);
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 1440) {
      errors.push(`Invalid duration "${rawEstimated}". Must be between 5 and 1440 minutes.`);
    }

    let dueAt: string | undefined;
    if (rawDueAt) {
      const dMs = Date.parse(rawDueAt);
      if (isNaN(dMs)) {
        errors.push(`Malformed due date "${rawDueAt}". Use ISO format (e.g., 2026-11-05T17:00:00Z).`);
      } else {
        dueAt = new Date(dMs).toISOString();
      }
    }

    const isSplittable = rawSplittable.toLowerCase() !== 'false';

    results.push({
      rowNumber: i + 1,
      valid: errors.length === 0,
      errors,
      candidate:
        errors.length === 0
          ? {
              title,
              description: rawDescription.slice(0, 2000),
              category,
              priority,
              estimatedMinutes: Math.round(estimatedMinutes),
              actualMinutes: 0,
              remainingMinutes: Math.round(estimatedMinutes),
              dueAt,
              isFixed: false,
              isSplittable,
              minSessionMinutes: Math.min(30, Math.round(estimatedMinutes)),
              preferredTimeOfDay: 'any',
              energyLevel: priority === 'critical' || priority === 'high' ? 'high' : 'medium',
              status: 'inbox',
            }
          : undefined,
    });
  }

  return results;
}
