import * as assert from 'assert';
import { parseLooseJSON, jsonToZod } from '../../engine';

suite('Zodify Engine Test Suite', () => {

	suite('parseLooseJSON', () => {
		test('should parse standard JSON', () => {
			const input = '{"a": 1, "b": "test"}';
			const result = parseLooseJSON(input);
			assert.deepStrictEqual(result, { a: 1, b: "test" });
		});

		test('should handle unquoted keys', () => {
			const input = '{ a: 1, b_c: true }';
			const result = parseLooseJSON(input);
			assert.deepStrictEqual(result, { a: 1, b_c: true });
		});

		test('should handle single quotes', () => {
			const input = "{ 'a': 'test' }";
			const result = parseLooseJSON(input);
			assert.deepStrictEqual(result, { a: "test" });
		});

		test('should strip comments', () => {
			const input = `
			{
				// This is a comment
				"a": 1
			}`;
			const result = parseLooseJSON(input);
			assert.deepStrictEqual(result, { a: 1 });
		});

		test('should handle trailing commas', () => {
			const input = '{ "a": 1, }';
			const result = parseLooseJSON(input);
			assert.deepStrictEqual(result, { a: 1 });
		});

		test('should handle mixed loose formats', () => {
			const input = `
			{
				key: 'value', // line comment
				"list": [1, 2, ],
			}
			`;
			const result = parseLooseJSON(input);
			assert.deepStrictEqual(result, { key: "value", list: [1, 2] });
		});
	});

	suite('jsonToZod', () => {
		test('should generate simple schema', () => {
			const json = '{"name": "Alice"}';
			const result = jsonToZod(json, 'UserSchema');
			assert.ok(result.includes('export const UserSchema = z.object({'));
			assert.ok(result.includes('name: z.string()'));
		});

		test('should infer string formats', () => {
			const json = JSON.stringify({
				email: "test@example.com",
				id: "550e8400-e29b-41d4-a716-446655440000",
				url: "https://stillsystems.io",
				date: "2024-05-01T12:00:00Z"
			});
			const result = jsonToZod(json);
			assert.ok(result.includes('z.string().email()'));
			assert.ok(result.includes('z.string().uuid()'));
			assert.ok(result.includes('z.string().url()'));
			assert.ok(result.includes('z.string().datetime()'));
		});

		test('should merge objects in arrays into union or partials', () => {
			const json = `[
				{ "id": 1, "name": "Alice" },
				{ "id": 2, "email": "bob@test.com" }
			]`;
			const result = jsonToZod(json, 'ListSchema');
			// Since they are objects in an array, it merges them and makes missing fields optional
			assert.ok(result.includes('name: z.string().optional()'));
			assert.ok(result.includes('email: z.string().email().optional()'));
		});

		test('should reuse identical schemas', () => {
			const json = `{
				"author": { "name": "Alice" },
				"editor": { "name": "Bob" }
			}`;
			const result = jsonToZod(json);
			// Should only define one schema type if they are structurally identical
			// In this implementation, it looks for existing schema bodies.
			const occurrences = (result.match(/z\.object\({\n  name: z\.string\(\)\n}\)/g) || []).length;
			assert.strictEqual(occurrences, 1);
		});
	});

});
