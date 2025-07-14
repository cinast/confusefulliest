import * as ts from "typescript";

export interface CodeStructure {
    imports: string[];
    classes: ClassInfo[];
    interfaces: InterfaceInfo[];
    types: TypeAliasInfo[];
    enums: EnumInfo[];
    functions: FunctionInfo[];
    variables: VariableInfo[];
    // 平面索引版本保留
    flat: {
        classes: ClassInfo[];
        interfaces: InterfaceInfo[];
        types: TypeAliasInfo[];
        enums: EnumInfo[];
        functions: FunctionInfo[];
        variables: VariableInfo[];
    };
}

interface BaseInfo {
    name: string;
    parent?: string; // 父级元素名称
    path: string[]; // 完整访问路径
}

interface ClassInfo extends BaseInfo {
    methods: MethodInfo[];
    properties: PropertyInfo[];
    children: Array<ClassInfo | InterfaceInfo | TypeAliasInfo | EnumInfo | FunctionInfo | VariableInfo>;
    extends?: string; // 继承的父类
    implements: string[]; // 实现的接口
    prototype: {
        constructor: string;
        __proto__?: string;
    };
}

interface InterfaceInfo extends BaseInfo {
    properties: PropertyInfo[];
}

interface TypeAliasInfo extends BaseInfo {
    type: string;
    typeParameters?: string[]; // 泛型参数
}

interface EnumInfo extends BaseInfo {
    members: string[];
}

interface FunctionInfo extends BaseInfo {
    parameters: ParameterInfo[];
    returnType: string;
    typeParameters?: string[]; // 泛型参数
    decorators?: string[]; // 装饰器
}

interface MethodInfo extends FunctionInfo {
    isStatic: boolean;
}

interface VariableInfo extends BaseInfo {
    type: string;
}

interface PropertyInfo {
    name: string;
    type: string;
}

interface ParameterInfo {
    name: string;
    type: string;
}

function parseFile(filePath: string): CodeStructure {
    const isTypeScript = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
    const compilerOptions = {
        allowJs: true,
        checkJs: false,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
    };

    const program = ts.createProgram([filePath], compilerOptions);
    const sourceFile = program.getSourceFile(filePath);
    const checker = program.getTypeChecker();

    // TS特有解析结果
    const tsSpecific = {
        interfaces: [] as InterfaceInfo[],
        types: [] as TypeAliasInfo[],
        enums: [] as EnumInfo[],
    };

    const result: CodeStructure = {
        imports: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        functions: [],
        variables: [],
        flat: {
            classes: [],
            interfaces: [],
            types: [],
            enums: [],
            functions: [],
            variables: [],
        },
    };

    let currentParent: string | null = null;
    let currentPath: string[] = [];

    if (!sourceFile) {
        return result;
    }

    ts.forEachChild(sourceFile, (node) => {
        // 解析导入语句
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier.getText();
            result.imports.push(moduleSpecifier.replace(/['"]/g, ""));
        }

        // TS特有语法解析
        if (isTypeScript) {
            if (ts.isInterfaceDeclaration(node)) {
                const interfaceInfo: InterfaceInfo = {
                    name: node.name.text,
                    parent: currentParent || undefined,
                    path: [...currentPath, node.name.text],
                    properties: [],
                };

                node.members.forEach((member) => {
                    if (ts.isPropertySignature(member) && member.name) {
                        interfaceInfo.properties.push({
                            name: member.name.getText(),
                            type: member.type?.getText() || "any",
                        });
                    }
                });

                tsSpecific.interfaces.push(interfaceInfo);
            } else if (ts.isTypeAliasDeclaration(node)) {
                tsSpecific.types.push({
                    name: node.name.text,
                    parent: currentParent || undefined,
                    path: [...currentPath, node.name.text],
                    type: node.type.getText(),
                });
            } else if (ts.isEnumDeclaration(node)) {
                const enumInfo: EnumInfo = {
                    name: node.name.text,
                    parent: currentParent || undefined,
                    path: [...currentPath, node.name.text],
                    members: [],
                };

                node.members.forEach((member) => {
                    if (ts.isEnumMember(member) && member.name) {
                        enumInfo.members.push(member.name.getText());
                    }
                });

                tsSpecific.enums.push(enumInfo);
            }
        }

        // 解析类定义(包括JS和TS)
        if (ts.isClassDeclaration(node) && node.name) {
            // 获取继承和实现信息
            const heritageClauses = node.heritageClauses || [];
            const extendsClause = heritageClauses.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
            const implementsClause = heritageClauses.find((h) => h.token === ts.SyntaxKind.ImplementsKeyword);

            const classInfo: ClassInfo = {
                name: node.name.text,
                parent: currentParent || undefined,
                path: [...currentPath, node.name.text],
                methods: [],
                properties: [],
                children: [],
                extends: extendsClause?.types.map((t) => t.getText()).join(", ") || undefined,
                implements: implementsClause?.types.map((t) => t.getText()) || [],
                prototype: {
                    constructor: node.name.text,
                    __proto__: extendsClause?.types.map((t) => t.getText()).join(", ") || "Object.prototype",
                },
            };

            // 保存当前上下文
            const prevParent = currentParent;
            const prevPath = [...currentPath];
            currentParent = node.name.text;
            currentPath.push(node.name.text);

            node.members.forEach((member) => {
                if (ts.isMethodDeclaration(member) && member.name && node.name) {
                    // 获取方法装饰器(兼容方式)
                    const decorators =
                        (ts.canHaveDecorators(member) && ts.getDecorators(member)?.map((d) => d.getText())) || undefined;

                    const methodInfo: MethodInfo = {
                        name: member.name.getText(),
                        parent: node.name.text,
                        path: [...currentPath, member.name.getText()],
                        parameters: [],
                        returnType: member.type?.getText() || "void",
                        isStatic: member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) || false,
                        decorators,
                    };
                    classInfo.methods.push(methodInfo);
                    classInfo.children.push(methodInfo);
                } else if (ts.isPropertyDeclaration(member) && member.name && node.name) {
                    const propInfo: PropertyInfo = {
                        name: member.name.getText(),
                        type: member.type?.getText() || "any",
                    };
                    classInfo.properties.push(propInfo);
                    classInfo.children.push({
                        name: member.name.getText(),
                        parent: node.name.text,
                        path: [...currentPath, member.name.getText()],
                        type: member.type?.getText() || "any",
                    });
                }
            });

            result.classes.push(classInfo);
            result.flat.classes.push(classInfo);

            // 恢复上下文
            currentParent = prevParent;
            currentPath = prevPath;
        }

        // 解析接口定义
        else if (ts.isInterfaceDeclaration(node)) {
            const interfaceInfo: InterfaceInfo = {
                name: node.name.text,
                parent: currentParent || undefined,
                path: [...currentPath, node.name.text],
                properties: [],
            };

            node.members.forEach((member) => {
                if (ts.isPropertySignature(member) && member.name) {
                    interfaceInfo.properties.push({
                        name: member.name.getText(),
                        type: member.type?.getText() || "any",
                    });
                }
            });

            result.interfaces.push(interfaceInfo);
            result.flat.interfaces.push(interfaceInfo);
        }

        // 解析类型别名
        else if (ts.isTypeAliasDeclaration(node)) {
            // 获取泛型参数
            const typeParameters = node.typeParameters?.map((tp) => tp.getText()) || undefined;

            const typeInfo: TypeAliasInfo = {
                name: node.name.text,
                parent: currentParent || undefined,
                path: [...currentPath, node.name.text],
                type: node.type.getText(),
                typeParameters,
            };
            result.types.push(typeInfo);
            result.flat.types.push(typeInfo);
        }

        // 解析枚举
        else if (ts.isEnumDeclaration(node)) {
            const enumInfo: EnumInfo = {
                name: node.name.text,
                parent: currentParent || undefined,
                path: [...currentPath, node.name.text],
                members: [],
            };

            node.members.forEach((member) => {
                if (ts.isEnumMember(member) && member.name) {
                    enumInfo.members.push(member.name.getText());
                }
            });

            result.enums.push(enumInfo);
            result.flat.enums.push(enumInfo);
        }

        // 解析函数(包括函数声明和表达式)
        else if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
            const funcName = node.name?.text || "(anonymous)";
            // 获取泛型参数
            const typeParameters = node.typeParameters?.map((tp) => tp.getText()) || undefined;
            // 函数声明不支持装饰器
            const decorators = undefined;

            const funcInfo: FunctionInfo = {
                name: funcName,
                parent: currentParent || undefined,
                path: [...currentPath, funcName],
                parameters: [],
                returnType: node.type?.getText() || "any",
                typeParameters,
                decorators: undefined, // 函数声明不支持装饰器
            };
            result.functions.push(funcInfo);
            result.flat.functions.push(funcInfo);
        }

        // 解析对象字面量(JS特有)
        else if (ts.isObjectLiteralExpression(node)) {
            node.properties.forEach((prop) => {
                if (ts.isPropertyAssignment(prop) && prop.name) {
                    const propName = prop.name.getText();
                    result.variables.push({
                        name: propName,
                        parent: currentParent || undefined,
                        path: [...currentPath, propName],
                        type: "object",
                    });
                }
            });
        }

        // 解析变量
        else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach((decl) => {
                if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
                    const varInfo: VariableInfo = {
                        name: decl.name.text,
                        parent: currentParent || undefined,
                        path: [...currentPath, decl.name.text],
                        type: decl.type?.getText() || "any",
                    };
                    result.variables.push(varInfo);
                    result.flat.variables.push(varInfo);
                }
            });
        }
    });

    // 合并TS特有解析结果
    if (isTypeScript) {
        result.interfaces = tsSpecific.interfaces;
        result.types = tsSpecific.types;
        result.enums = tsSpecific.enums;

        result.flat.interfaces.push(...tsSpecific.interfaces);
        result.flat.types.push(...tsSpecific.types);
        result.flat.enums.push(...tsSpecific.enums);
    }

    return result;
}

// 命令行接口
if (require.main === module) {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }

    const result = parseFile(filePath);
    console.log(JSON.stringify(result, null, 2));
}
