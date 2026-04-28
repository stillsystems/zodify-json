import { jsonToZod } from './engine';

// Notice this is NOT valid JSON! It has unquoted keys, single quotes, and a trailing comma.
const looseJsonString = `
{
    users: [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob' }, // missing 'active' -> should be optional
        { id: 3, active: false, email: 'carol@test.com' }, // missing 'name', adds 'email'
    ],
}
`;

console.log(jsonToZod(looseJsonString, "DatabaseSchema", { useUnknown: true, generateTypes: true }));
