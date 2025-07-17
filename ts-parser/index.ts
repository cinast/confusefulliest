import * as ts from "typescript";
import * as fs from "fs";

/**
 * 目前打算支持的
 */
const JSFileType = ["js"];

/**
 * 目前打算支持的
 */
const TSFileType = ["ts"];

/**
 * 这是代码文件的最高大纲 \
 * 首先功能是列出所有全部定义了的东西（包含局域的） \
 * 第二功能是列出里面包含的逻辑树（含逻辑流、函数调用、实值或者类型的运算操作） \
 * 其内所有包含内容的属性全部都是平面结构 \
 *
 */
export interface CodeStructure {
    imports: string[];
    classes: ClassInfo[];
    interfaces: InterfaceInfo[];
    types: TypeAliasInfo[];
    enums: EnumInfo[];
    functions: FunctionInfo[];
    variables: VariableInfo[];
    namespaces: NamespaceInfo[];
}

interface BaseInfo {
    name: string;
    parent?: string; // 父级元素名称
    path: string[]; // 完整访问路径
    location?: {
        start: number;
        end?: number;
    };
    comments?: {
        leading?: string[];
        trailing?: string[];
    };
}

// 以下是所有**定义**作用的关键字的解析模版对象

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
    complexType?: {
        kind: "union" | "intersection" | "constructor" | "conditional";
        types: string[];
    };
}

interface EnumInfo extends BaseInfo {
    members: string[];
}

interface NamespaceInfo extends BaseInfo {
    children: Array<ClassInfo | InterfaceInfo | TypeAliasInfo | EnumInfo | FunctionInfo | VariableInfo>;
}

interface FunctionInfo extends BaseInfo {
    parameters: ParameterInfo[];
    returnType: string;
    typeParameters?: string[]; // 泛型参数
    decorators?: string[]; // 装饰器
    isGeneric?: boolean;
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
    decorators?: string[];
}

interface ParameterInfo {
    name: string;
    type: string;
}

function fileNameTail(filePath: string) {
    return filePath.substring(filePath.lastIndexOf(".") + 1);
}

/**
 * **在命令行调用它**
 * ts/ ~~js~~ 的解析器（js还没有准备好）
 * @param filePath 命令行给的参数,文件实际位置
 * @returns 文件的解析结果
 */
function parseFile(filePath: string, tsconfg?: string): CodeStructure {
    const isTypeScript = TSFileType.includes(fileNameTail(filePath));
    // 选择一个配置
    let compilerOptions;
    try {
        console.log(
            `using ${
                tsconfg && fileNameTail(tsconfg).toLowerCase() == "json" ? tsconfg : "/ts-parser/parser-default-tsconfig.json"
            } as tsconfg`
        );
        /*
         *  指定的配置有没有还是说不符合规定
         *  既然没用那就换默认
         *  至于内容合不合规范，你问报不报错
         */
        compilerOptions = JSON.parse(
            require(tsconfg && fileNameTail(tsconfg).toLowerCase() == "json" ? tsconfg : "") ||
                require("/ts-parser/parser-default-tsconfig.json")
        );
    } catch (error) {
        // 哪个天才把这个默认文件给删了
        console.warn(error);
        console.warn("parser-default-tsconfig.json NOT FUND");
        console.warn("now using built-in tsconfg in ts-parser/index.ts");
        compilerOptions = {
            allowJs: true,
            checkJs: false,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.CommonJS,
        };
    }

    Object.freeze(compilerOptions);

    // 获取注释帮助函数
    const getComments = (node: ts.Node) => {
        const comments: string[] = [];
        const commentRanges = ts.getLeadingCommentRanges(node.getSourceFile().getFullText(), node.getFullStart()) || [];

        for (const range of commentRanges) {
            comments.push(node.getSourceFile().getFullText().substring(range.pos, range.end).trim());
        }
        return comments.length ? comments : undefined;
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
        namespaces: [],
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
                const comments = getComments(node);
                const interfaceInfo: InterfaceInfo = {
                    name: node.name.text,
                    parent: currentParent || undefined,
                    path: [...currentPath, node.name.text],
                    properties: [],
                    location: {
                        start: node.getStart(),
                        end: node.getEnd(),
                    },
                    comments: comments ? { leading: comments } : undefined,
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

                    // 解析参数
                    const parameters: ParameterInfo[] = [];
                    member.parameters?.forEach((param) => {
                        if (ts.isParameter(param)) {
                            parameters.push({
                                name: param.name.getText(),
                                type: param.type?.getText() || "any",
                            });
                        }
                    });

                    const methodInfo: MethodInfo = {
                        name: member.name.getText(),
                        parent: node.name.text,
                        path: [...currentPath, member.name.getText()],
                        parameters,
                        returnType: member.type?.getText() || "void",
                        isStatic: member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) || false,
                        decorators,
                    };
                    classInfo.methods.push(methodInfo);
                    classInfo.children.push(methodInfo);
                } else if (ts.isPropertyDeclaration(member) && member.name && node.name) {
                    // 获取属性装饰器
                    const decorators =
                        (ts.canHaveDecorators(member) && ts.getDecorators(member)?.map((d) => d.getText())) || undefined;

                    const propInfo: PropertyInfo = {
                        name: member.name.getText(),
                        type: member.type?.getText() || "any",
                        decorators,
                    };

                    classInfo.properties.push(propInfo);
                    classInfo.children.push({
                        name: member.name.getText(),
                        parent: node.name.text,
                        path: [...currentPath, member.name.getText()],
                        type: member.type?.getText() || "any",
                        decorators,
                    });
                }
            });

            result.classes.push(classInfo);

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
                isGeneric: !!typeParameters?.length,
                decorators: undefined, // 函数声明不支持装饰器
            };
            result.functions.push(funcInfo);
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

        // 解析命名空间
        else if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            const namespaceInfo: NamespaceInfo = {
                name: node.name.text,
                parent: currentParent || undefined,
                path: [...currentPath, node.name.text],
                children: [],
            };

            // 保存当前上下文
            const prevParent = currentParent;
            const prevPath = [...currentPath];
            currentParent = node.name.text;
            currentPath.push(node.name.text);

            // 递归解析命名空间内容
            if (node.body && ts.isModuleBlock(node.body)) {
                node.body.statements.forEach((statement) => {
                    if (ts.isClassDeclaration(statement)) {
                        namespaceInfo.children.push(...result.classes.filter((c) => c.parent === node.name.text));
                    } else if (ts.isInterfaceDeclaration(statement)) {
                        namespaceInfo.children.push(...result.interfaces.filter((i) => i.parent === node.name.text));
                    } else if (ts.isTypeAliasDeclaration(statement)) {
                        namespaceInfo.children.push(...result.types.filter((t) => t.parent === node.name.text));
                    } else if (ts.isEnumDeclaration(statement)) {
                        namespaceInfo.children.push(...result.enums.filter((e) => e.parent === node.name.text));
                    } else if (ts.isFunctionDeclaration(statement)) {
                        namespaceInfo.children.push(...result.functions.filter((f) => f.parent === node.name.text));
                    } else if (ts.isVariableStatement(statement)) {
                        namespaceInfo.children.push(...result.variables.filter((v) => v.parent === node.name.text));
                    }
                });
            }

            // 恢复上下文
            currentParent = prevParent;
            currentPath = prevPath;

            result.namespaces.push(namespaceInfo);
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
                }
            });
        }
    });

    // 合并TS特有解析结果
    if (isTypeScript) {
        result.interfaces = tsSpecific.interfaces;
        result.types = tsSpecific.types;
        result.enums = tsSpecific.enums;
    }

    return result;
}

/**
 * 命令行接口 \
 * 由`core\parser.py#44`调用
 */
function cli() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }

    const result = parseFile(filePath);
    fs.writeFile("ts-parser/tmp/analyzed.json", JSON.stringify(result, null, 2), (e) => console.error(e));
}

if (require.main === module) cli();
