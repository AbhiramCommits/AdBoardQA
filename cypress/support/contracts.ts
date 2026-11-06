/**
 * A small, typed, dependency-free schema assertion helper. The contract specs
 * describe each REST payload once here instead of hand-rolling field checks.
 */

export type Schema =
  | { type: 'string'; enum?: readonly string[]; pattern?: RegExp }
  | { type: 'number'; integer?: boolean; min?: number }
  | { type: 'boolean' }
  | { type: 'null' }
  | { type: 'array'; items: Schema; minItems?: number }
  | { type: 'nullable'; of: Schema }
  | {
      type: 'object';
      required?: readonly string[];
      properties: Record<string, Schema>;
    };

function typeName(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function validateValue(
  value: unknown,
  schema: Schema,
  path: string,
  errors: string[],
): void {
  if (value === undefined) {
    errors.push(`${path}: expected ${schema.type}, received undefined`);
    return;
  }

  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push(`${path}: expected string, received ${typeName(value)}`);
        return;
      }
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path}: "${value}" is not one of ${schema.enum.join(', ')}`);
      }
      if (schema.pattern && !schema.pattern.test(value)) {
        errors.push(`${path}: "${value}" does not match ${schema.pattern}`);
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: expected finite number, received ${typeName(value)}`);
        return;
      }
      if (schema.integer && !Number.isInteger(value)) {
        errors.push(`${path}: expected integer, received ${value}`);
      }
      if (schema.min !== undefined && value < schema.min) {
        errors.push(`${path}: expected >= ${schema.min}, received ${value}`);
      }
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${path}: expected boolean, received ${typeName(value)}`);
      }
      return;
    case 'null':
      if (value !== null) {
        errors.push(`${path}: expected null, received ${typeName(value)}`);
      }
      return;
    case 'nullable':
      if (value === null) {
        return;
      }
      validateValue(value, schema.of, path, errors);
      return;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, received ${typeName(value)}`);
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(
          `${path}: expected at least ${schema.minItems} items, received ${value.length}`,
        );
      }
      value.forEach((item, index) => {
        validateValue(item, schema.items, `${path}[${index}]`, errors);
      });
      return;
    case 'object': {
      if (typeName(value) !== 'object') {
        errors.push(`${path}: expected object, received ${typeName(value)}`);
        return;
      }
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in record)) {
          errors.push(`${path}.${key}: required property is missing`);
        }
      }
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (key in record) {
          validateValue(record[key], propertySchema, `${path}.${key}`, errors);
        }
      }
      return;
    }
    default:
      errors.push(`${path}: unsupported schema ${JSON.stringify(schema)}`);
  }
}

/** Throws a readable error listing every schema violation. */
export function assertSchema(value: unknown, schema: Schema, label = 'payload'): void {
  const errors: string[] = [];
  validateValue(value, schema, label, errors);
  if (errors.length > 0) {
    throw new Error(`${label} failed schema validation:\n- ${errors.join('\n- ')}`);
  }
}

const isoDate: Schema = { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/ };
const isoDateTime: Schema = { type: 'string', pattern: /^\d{4}-\d{2}-\d{2}T/ };
const campaignStatus: Schema = {
  type: 'string',
  enum: ['draft', 'pending_approval', 'approved', 'live'],
};

const screen: Schema = {
  type: 'object',
  required: ['id', 'name', 'venue', 'dailyImpressions', 'cpm'],
  properties: {
    id: { type: 'string', pattern: /^scr_/ },
    name: { type: 'string' },
    venue: { type: 'string', enum: ['airport', 'mall', 'gym'] },
    dailyImpressions: { type: 'number', integer: true, min: 1 },
    cpm: { type: 'number', min: 0 },
  },
};

const flight: Schema = {
  type: 'object',
  required: ['id', 'screenId', 'startDate', 'endDate', 'dailyBudgetCents', 'createdAt'],
  properties: {
    id: { type: 'string', pattern: /^flt_/ },
    screenId: { type: 'string', pattern: /^scr_/ },
    startDate: isoDate,
    endDate: isoDate,
    dailyBudgetCents: { type: 'number', integer: true, min: 0 },
    createdAt: isoDateTime,
  },
};

const flightMetrics: Schema = {
  type: 'object',
  required: ['flightId', 'screenId', 'days', 'costCents', 'impressions'],
  properties: {
    flightId: { type: 'string' },
    screenId: { type: 'string' },
    days: { type: 'number', integer: true, min: 1 },
    costCents: { type: 'number', integer: true, min: 0 },
    impressions: { type: 'number', integer: true, min: 0 },
  },
};

const totals: Schema = {
  type: 'object',
  required: [
    'flightCount',
    'bookedBudgetCents',
    'remainingBudgetCents',
    'totalImpressions',
    'averageCpmCents',
    'mediaValueCents',
  ],
  properties: {
    flightCount: { type: 'number', integer: true, min: 0 },
    bookedBudgetCents: { type: 'number', integer: true, min: 0 },
    remainingBudgetCents: { type: 'number', integer: true },
    totalImpressions: { type: 'number', integer: true, min: 0 },
    averageCpmCents: { type: 'number', integer: true, min: 0 },
    mediaValueCents: { type: 'number', integer: true, min: 0 },
  },
};

const historyEntry: Schema = {
  type: 'object',
  required: ['at', 'event', 'from', 'to', 'actor'],
  properties: {
    at: isoDateTime,
    event: { type: 'string' },
    from: { type: 'nullable', of: campaignStatus },
    to: campaignStatus,
    actor: { type: 'string' },
    note: { type: 'string' },
  },
};

const rejection: Schema = {
  type: 'object',
  required: ['reason', 'reviewer', 'at'],
  properties: {
    reason: { type: 'string' },
    reviewer: { type: 'string' },
    at: isoDateTime,
  },
};

const campaignSummary: Schema = {
  type: 'object',
  required: [
    'id',
    'name',
    'advertiser',
    'budgetCents',
    'startDate',
    'endDate',
    'status',
    'flightCount',
    'bookedBudgetCents',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', pattern: /^cmp_/ },
    name: { type: 'string' },
    advertiser: { type: 'string' },
    budgetCents: { type: 'number', integer: true, min: 1 },
    startDate: isoDate,
    endDate: isoDate,
    status: campaignStatus,
    flightCount: { type: 'number', integer: true, min: 0 },
    bookedBudgetCents: { type: 'number', integer: true, min: 0 },
    updatedAt: isoDateTime,
  },
};

const campaignDetail: Schema = {
  type: 'object',
  required: [
    'id',
    'name',
    'advertiser',
    'budgetCents',
    'startDate',
    'endDate',
    'status',
    'createdBy',
    'createdAt',
    'updatedAt',
    'flights',
    'history',
    'totals',
    'flightMetrics',
  ],
  properties: {
    id: { type: 'string', pattern: /^cmp_/ },
    name: { type: 'string' },
    advertiser: { type: 'string' },
    budgetCents: { type: 'number', integer: true, min: 1 },
    startDate: isoDate,
    endDate: isoDate,
    status: campaignStatus,
    createdBy: { type: 'string' },
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    publishedAt: isoDateTime,
    lastRejection: rejection,
    flights: { type: 'array', items: flight },
    history: { type: 'array', items: historyEntry },
    totals,
    flightMetrics: { type: 'array', items: flightMetrics },
  },
};

const errorEnvelope: Schema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        field: { type: 'string' },
      },
    },
  },
};

export const schemas = {
  error: errorEnvelope,
  resetResult: {
    type: 'object',
    required: ['ok', 'screens', 'campaigns'],
    properties: {
      ok: { type: 'boolean' },
      screens: { type: 'number', integer: true, min: 1 },
      campaigns: { type: 'number', integer: true, min: 1 },
    },
  } satisfies Schema,
  screenList: {
    type: 'object',
    required: ['screens'],
    properties: {
      screens: { type: 'array', items: screen, minItems: 6 },
    },
  } satisfies Schema,
  campaignList: {
    type: 'object',
    required: ['campaigns'],
    properties: {
      campaigns: { type: 'array', items: campaignSummary, minItems: 4 },
    },
  } satisfies Schema,
  campaignDetail,
  flightRequest: {
    type: 'object',
    required: ['screenId', 'startDate', 'endDate', 'dailyBudgetCents'],
    properties: {
      screenId: { type: 'string', pattern: /^scr_/ },
      startDate: isoDate,
      endDate: isoDate,
      dailyBudgetCents: { type: 'number', integer: true, min: 0 },
    },
  } satisfies Schema,
  createCampaignRequest: {
    type: 'object',
    required: ['name', 'advertiser', 'budgetCents', 'startDate', 'endDate'],
    properties: {
      name: { type: 'string' },
      advertiser: { type: 'string' },
      budgetCents: { type: 'number', integer: true, min: 1 },
      startDate: isoDate,
      endDate: isoDate,
    },
  } satisfies Schema,
  approveRequest: {
    type: 'object',
    required: ['reviewer'],
    properties: {
      reviewer: { type: 'string' },
    },
  } satisfies Schema,
  rejectRequest: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
      reviewer: { type: 'string' },
    },
  } satisfies Schema,
  deleteResult: {
    type: 'object',
    required: ['deletedFlightId', 'campaign'],
    properties: {
      deletedFlightId: { type: 'string' },
      campaign: campaignDetail,
    },
  } satisfies Schema,
} as const;
