import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMAS_DIR = path.resolve(__dirname, '../schemas');

type AjvConstructor = new (opts: { allErrors: boolean; strict: boolean }) => {
  compile: (schema: unknown) => ValidateFunction;
};

const ajv = new (Ajv as unknown as AjvConstructor)({
  allErrors: true,
  strict: false,
});
(addFormats as unknown as (instance: unknown) => void)(ajv);

const validatorsCache = new Map<string, ValidateFunction>();

function getValidator(schemaName: string): ValidateFunction {
  if (validatorsCache.has(schemaName)) {
    return validatorsCache.get(schemaName)!;
  }

  let schemaPath = path.join(SCHEMAS_DIR, `${schemaName}.schema.json`);
  if (!fs.existsSync(schemaPath)) {
    const srcFallback = path.resolve(__dirname, '../../src/schemas', `${schemaName}.schema.json`);
    if (fs.existsSync(srcFallback)) {
      schemaPath = srcFallback;
    }
  }

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema '${schemaName}' não encontrado em ${schemaPath}`);
  }

  const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const validate = ajv.compile(schemaContent);
  validatorsCache.set(schemaName, validate);
  return validate;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateJsonSchema(schemaName: string, data: unknown): ValidationResult {
  try {
    const validate = getValidator(schemaName);
    const valid = validate(data);
    if (!valid) {
      const errors = (validate.errors || []).map(
        (err) => `${err.instancePath || '/'} ${err.message}`.trim()
      );
      return { valid: false, errors };
    }
    return { valid: true };
  } catch (err: unknown) {
    return { valid: false, errors: [err instanceof Error ? err.message : 'Erro de validação desconhecido'] };
  }
}
