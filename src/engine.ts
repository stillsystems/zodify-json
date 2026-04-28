export interface ZodifyOptions {
    generateTypes?: boolean;
    useUnknown?: boolean;
}

export function parseLooseJSON(str: string): any {
    try {
        return JSON.parse(str);
    } catch (e) {
        // Strip single-line comments
        let cleaned = str.replace(/\/\/.*$/gm, '');
        // Strip trailing commas
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
        // Wrap unquoted keys in quotes
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');
        // Convert single quotes to double quotes (heuristic)
        cleaned = cleaned.replace(/'([^']*)'/g, '"$1"');
        return JSON.parse(cleaned);
    }
}

export function jsonToZod(jsonString: string, rootName: string = 'RootSchema', options: ZodifyOptions = {}): string {
    const parsed = parseLooseJSON(jsonString);
    const schemas: string[] = [];
    const schemaMap = new Map<string, string>();

    const anyType = options.useUnknown ? 'z.unknown()' : 'z.any()';

    function capitalize(str: string) {
        if (!str) {return 'Unknown';}
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function inferStringFormat(str: string): string {
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/i.test(str)) {return 'z.string().datetime()';}
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)) {return 'z.string().uuid()';}
        if (/^https?:\/\/[^\s$.?#].[^\s]*$/i.test(str)) {return 'z.string().url()';}
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {return 'z.string().email()';}
        return 'z.string()';
    }

    function generateObjectSchema(propsStr: string, childNameBase: string): string {
        const schemaBody = `z.object({\n${propsStr}\n})`;
        let childName = childNameBase;
        
        let existingName = null;
        for (const [name, body] of schemaMap.entries()) {
            if (body === schemaBody) {
                existingName = name;
                break;
            }
        }

        if (existingName) {
            return existingName;
        } else {
            if (schemaMap.has(childName)) {
                let i = 1;
                while (schemaMap.has(`${childName}${i}`)) {i++;}
                childName = `${childName}${i}`;
            }
            schemaMap.set(childName, schemaBody);
            schemas.push(`const ${childName} = ${schemaBody};\n`);
            return childName;
        }
    }

    function traverseMergedObjects(objects: any[]): string {
        const allKeys = new Set<string>();
        objects.forEach(o => Object.keys(o).forEach(k => allKeys.add(k)));
        
        const props: string[] = [];
        for (const key of allKeys) {
            const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
            let isOptional = false;
            const types = new Set<string>();
            const baseChildName = capitalize(key.replace(/[^a-zA-Z0-9_$]/g, ''));
            const childName = baseChildName ? `${baseChildName}Schema` : 'ChildSchema';

            for (const obj of objects) {
                if (!(key in obj)) {
                    isOptional = true;
                } else {
                    types.add(traverse(obj[key], childName));
                }
            }
            
            const uniqueTypes = Array.from(types);
            let typeStr = uniqueTypes.length === 1 ? uniqueTypes[0] : (uniqueTypes.length > 1 ? `z.union([${uniqueTypes.join(', ')}])` : anyType);
            if (isOptional) {typeStr += '.optional()';}
            props.push(`  ${safeKey}: ${typeStr}`);
        }
        
        return props.join(',\n');
    }

    function traverse(obj: any, currentName: string): string {
        if (obj === null) {return 'z.null()';}

        if (Array.isArray(obj)) {
            if (obj.length === 0) {return `z.array(${anyType})`;}
            
            const isAllObjects = obj.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
            if (isAllObjects && obj.length > 0) {
                const childName = currentName.endsWith('sSchema') ? currentName.slice(0, -7) + 'Schema' : currentName + 'Item';
                const propsStr = traverseMergedObjects(obj);
                const schemaRef = generateObjectSchema(propsStr, childName);
                return `z.array(${schemaRef})`;
            }

            const types = new Set<string>();
            for (const item of obj) {types.add(traverse(item, `${currentName}Item`));}
            const uniqueTypes = Array.from(types);
            
            if (uniqueTypes.length === 1) {return `z.array(${uniqueTypes[0]})`;}
            return `z.array(z.union([${uniqueTypes.join(', ')}]))`;
        }

        if (typeof obj === 'object') {
            const props: string[] = [];
            for (const [key, value] of Object.entries(obj)) {
                const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
                const baseChildName = capitalize(key.replace(/[^a-zA-Z0-9_$]/g, ''));
                const childName = baseChildName ? `${baseChildName}Schema` : 'ChildSchema';
                
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    const childProps = traverse(value, childName);
                    const schemaRef = generateObjectSchema(childProps, childName);
                    props.push(`  ${safeKey}: ${schemaRef}`);
                } else {
                    const typeStr = traverse(value, childName);
                    props.push(`  ${safeKey}: ${typeStr}`);
                }
            }
            return props.join(',\n');
        }

        if (typeof obj === 'string') {return inferStringFormat(obj);}
        if (typeof obj === 'number') {return 'z.number()';}
        if (typeof obj === 'boolean') {return 'z.boolean()';}

        return anyType;
    }

    let result = `import { z } from "zod";\n\n`;

    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rootProps = traverse(parsed, rootName);
        result += schemas.join('\n');
        result += `export const ${rootName} = z.object({\n${rootProps}\n});\n\n`;
    } else {
        const typeStr = traverse(parsed, rootName);
        result += schemas.join('\n');
        result += `export const ${rootName} = ${typeStr};\n\n`;
    }

    if (options.generateTypes !== false) {
        const typeName = rootName.endsWith('Schema') ? rootName.replace(/Schema$/, '') : `${rootName}Type`;
        result += `export type ${typeName} = z.infer<typeof ${rootName}>;\n`;
    }

    return result;
}
