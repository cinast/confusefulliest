import * as ts from "typescript";
import * as fs from "fs";

// 支持的扩展名类型
const JSFileType = ["js"];
const TSFileType = ["ts"];

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
    parent?: string;
    path: string[];
    location?: { start: number; end?: number };
    comments?: { leading?: string[]; trailing?: string[]; jsdoc?: string };
}

interface ClassInfo extends BaseInfo {
    methods: MethodInfo[];
    properties: PropertyInfo[];
    children: Array<ClassInfo | InterfaceInfo | TypeAliasInfo | EnumInfo | FunctionInfo | VariableInfo>;
    extends?: string;
    implements: string[];
    prototype: { constructor: string; __proto__?: string };
}

interface InterfaceInfo extends BaseInfo {
    properties: PropertyInfo[];
}

interface TypeAliasInfo extends BaseInfo {
    type: string;
    typeParameters?: string[];
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
    typeParameters?: string[];
    decorators?: string[];
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

function getComments(node: ts.Node) {
    const sourceText = node.getSourceFile().getFullText();
    const leadingRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) || [];
    const trailingRanges = ts.getTrailingCommentRanges(sourceText, node.getEnd()) || [];
    const jsDoc = ts.getJSDocCommentsAndTags(node);

    return {
        leading: leadingRanges.map((r) => sourceText.substring(r.pos, r.end).trim()),
        trailing: trailingRanges.map((r) => sourceText.substring(r.pos, r.end).trim()),
        jsdoc: jsDoc.length ? jsDoc[0].getFullText().trim() : undefined,
    };
}

function parseFile(filePath: string): CodeStructure {
    const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
    };

    const program = ts.createProgram([filePath], compilerOptions);
    const sourceFile = program.getSourceFile(filePath);
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

    if (!sourceFile) return result;

    // 定义上下文类型
    interface Context {
        parent?: string;
        path: string[];
    }

    const contextStack: Context[] = [];
    let currentContext: Context = { parent: undefined, path: [] };

    const visitNode = (node: ts.Node) => {
        const comments = getComments(node);
        const commentData = {
            leading: comments.leading.length ? comments.leading : undefined,
            trailing: comments.trailing.length ? comments.trailing : undefined,
            jsdoc: comments.jsdoc,
        };

        // 处理导入语句
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier.getText();
            result.imports.push(moduleSpecifier.replace(/['"]/g, ""));
        }

        // 处理类定义
        else if (ts.isClassDeclaration(node) && node.name) {
            const heritage = node.heritageClauses || [];
            const extendsClause = heritage.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
            const implementsClause = heritage.find((h) => h.token === ts.SyntaxKind.ImplementsKeyword);

            const classInfo: ClassInfo = {
                name: node.name.text,
                parent: currentContext.parent,
                path: [...currentContext.path, node.name.text],
                methods: [],
                properties: [],
                children: [],
                extends: extendsClause?.types.map((t) => t.getText()).join(", "),
                implements: implementsClause?.types.map((t) => t.getText()) || [],
                prototype: {
                    constructor: node.name.text,
                    __proto__: extendsClause?.types.map((t) => t.getText()).join(", ") || "Object.prototype",
                },
                comments: commentData,
                location: { start: node.getStart() },
            };

            // 进入类作用域
            contextStack.push(currentContext);
            currentContext = {
                parent: node.name.text,
                path: [...currentContext.path, node.name.text],
            };

            ts.forEachChild(node, visitNode);

            // 恢复上下文
            currentContext = contextStack.pop()!;

            result.classes.push(classInfo);
        }

        // 处理方法定义
        else if (ts.isMethodDeclaration(node) && node.name) {
            const methodInfo: MethodInfo = {
                name: node.name.getText(),
                parent: currentContext.parent,
                path: [...currentContext.path, node.name.getText()],
                parameters: [],
                returnType: node.type?.getText() || "void",
                isStatic: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) || false,
                isGeneric: !!node.typeParameters?.length,
                comments: commentData,
                location: { start: node.getStart() },
            };

            node.parameters?.forEach((param) => {
                if (ts.isParameter(param)) {
                    methodInfo.parameters.push({
                        name: param.name.getText(),
                        type: param.type?.getText() || "any",
                    });
                }
            });

            const parentClass = result.classes.find((c) => c.name === currentContext.parent);
            parentClass?.methods.push(methodInfo);
            parentClass?.children.push(methodInfo);
        }

        // 处理属性定义
        else if (ts.isPropertyDeclaration(node) && node.name) {
            const propInfo: PropertyInfo & VariableInfo = {
                name: node.name.getText(),
                type: node.type?.getText() || "any",
                parent: currentContext.parent,
                path: [...currentContext.path, node.name.getText()],
                comments: commentData,
                location: { start: node.getStart() },
            };

            const parentClass = result.classes.find((c) => c.name === currentContext.parent);
            if (parentClass) {
                parentClass.properties.push(propInfo);
                parentClass.children.push(propInfo);
            }
        }

        // 处理接口定义
        else if (ts.isInterfaceDeclaration(node)) {
            const interfaceInfo: InterfaceInfo = {
                name: node.name.text,
                parent: currentContext.parent,
                path: [...currentContext.path, node.name.text],
                properties: [],
                comments: commentData,
                location: { start: node.getStart() },
            };

            // 进入接口作用域
            contextStack.push(currentContext);
            currentContext = {
                parent: node.name.text,
                path: [...currentContext.path, node.name.text],
            };

            ts.forEachChild(node, visitNode);

            // 恢复上下文
            currentContext = contextStack.pop()!;

            result.interfaces.push(interfaceInfo);
        }

        // 处理类型别名
        else if (ts.isTypeAliasDeclaration(node)) {
            result.types.push({
                name: node.name.text,
                parent: currentContext.parent,
                path: [...currentContext.path, node.name.text],
                type: node.type.getText(),
                typeParameters: node.typeParameters?.map((tp) => tp.getText()),
                comments: commentData,
                location: { start: node.getStart() },
            });
        }

        // 处理枚举
        else if (ts.isEnumDeclaration(node)) {
            const enumInfo: EnumInfo = {
                name: node.name.text,
                parent: currentContext.parent,
                path: [...currentContext.path, node.name.text],
                members: [],
                comments: commentData,
                location: { start: node.getStart() },
            };

            node.members.forEach((member) => {
                if (ts.isEnumMember(member) && member.name) {
                    enumInfo.members.push(member.name.getText());
                }
            });

            result.enums.push(enumInfo);
        }

        // 处理函数
        else if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            const funcName = node.name?.text || "(anonymous)";
            const funcInfo: FunctionInfo = {
                name: funcName,
                parent: currentContext.parent,
                path: [...currentContext.path, funcName],
                parameters: [],
                returnType: node.type?.getText() || "any",
                typeParameters: node.typeParameters?.map((tp) => tp.getText()),
                isGeneric: !!node.typeParameters?.length,
                comments: commentData,
                location: { start: node.getStart() },
            };

            node.parameters?.forEach((param) => {
                if (ts.isParameter(param)) {
                    funcInfo.parameters.push({
                        name: param.name.getText(),
                        type: param.type?.getText() || "any",
                    });
                }
            });

            result.functions.push(funcInfo);
        }

        // 处理变量声明
        else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach((decl) => {
                if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
                    result.variables.push({
                        name: decl.name.text,
                        parent: currentContext.parent,
                        path: [...currentContext.path, decl.name.text],
                        type: decl.type?.getText() || "any",
                        comments: commentData,
                        location: { start: decl.getStart() },
                    });
                }
            });
        }

        // 处理命名空间
        else if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            const namespaceInfo: NamespaceInfo = {
                name: node.name.text,
                parent: currentContext.parent,
                path: [...currentContext.path, node.name.text],
                children: [],
                comments: commentData,
                location: { start: node.getStart() },
            };

            // 进入命名空间作用域
            contextStack.push(currentContext);
            currentContext = {
                parent: node.name.text,
                path: [...currentContext.path, node.name.text],
            };

            if (node.body && ts.isModuleBlock(node.body)) {
                ts.forEachChild(node.body, visitNode);
            }

            // 恢复上下文
            currentContext = contextStack.pop()!;

            result.namespaces.push(namespaceInfo);
        }

        // 递归处理子节点
        ts.forEachChild(node, visitNode);
    };

    // 开始遍历AST
    ts.forEachChild(sourceFile, visitNode);
    return result;
}

function cli() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }

    const result = parseFile(filePath);
    fs.writeFileSync("analyzed.json", JSON.stringify(result, null, 2));
}

if (require.main === module) cli();
