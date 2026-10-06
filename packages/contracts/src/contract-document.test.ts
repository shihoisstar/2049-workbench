import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalJson, contractSnapshot } from './contract-document';
import { buildOpenApiDocument } from './openapi';

test('contract snapshot detects constraints even when fields and endpoint names stay unchanged', () => {
  const document = buildOpenApiDocument();
  const changed = JSON.parse(JSON.stringify(document));
  changed.components.schemas.CreateTaskRequest.properties.durationSec.maximum = 10;
  assert.notEqual(contractSnapshot(changed), contractSnapshot(document));
  changed.components.schemas.CreateTaskRequest.properties.durationSec.maximum = 15;
  changed.components.schemas.CreateTaskRequest.properties.resolution.enum = ['480p'];
  assert.notEqual(contractSnapshot(changed), contractSnapshot(document));
});

test('contract snapshot includes auth, request requirements and responses', () => {
  const document = buildOpenApiDocument();
  for (const change of [
    (doc: typeof document) => { doc.paths['/v1/tasks'].post.security = []; },
    (doc: typeof document) => { doc.paths['/v1/tasks'].post.requestBody.required = false; },
    (doc: typeof document) => { doc.paths['/v1/tasks'].post.responses[202].description = 'changed'; },
  ]) {
    const changed = structuredClone(document);
    change(changed);
    assert.notEqual(contractSnapshot(changed), contractSnapshot(document));
  }
});

test('stable serialization ignores object key order but retains array values', () => {
  assert.equal(canonicalJson({ b: { d: 2, c: 1 }, a: 0 }), canonicalJson({ a: 0, b: { c: 1, d: 2 } }));
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
});

test('every templated operation declares its required path parameters', () => {
  const document = buildOpenApiDocument();
  for (const [path, item] of Object.entries(document.paths)) {
    const names = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
    for (const operation of Object.values(item)) {
      const parameters = ('parameters' in operation ? operation.parameters : []) as typeof document.paths['/v1/tasks/{id}']['get']['parameters'];
      for (const name of names) {
        assert.ok(parameters.some(parameter => parameter.name === name && parameter.in === 'path' && parameter.required), `${path} missing ${name}`);
      }
    }
  }
});
