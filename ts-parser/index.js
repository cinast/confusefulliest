"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var fs = require("fs");
var crypto_1 = require("crypto");
("use strict");
// 支持的扩展名类型
var JSFileType = ["js"];
var TSFileType = ["ts"];
function getDebuggers() {
    return {
        logAST: function (node, depth) {
            if (depth === void 0) { depth = 0; }
            var indent = " ".repeat(depth * 2);
            console.log("".concat(indent).concat(ts.SyntaxKind[node.kind]));
            ts.forEachChild(node, function (child) { return getDebuggers().logAST(child, depth + 1); });
        },
        printNodeInfo: function (node) {
            var _a, _b;
            var sourceFile = node.getSourceFile();
            var text = (sourceFile === null || sourceFile === void 0 ? void 0 : sourceFile.getFullText()) || "";
            var start = node.getStart();
            var end = node.getEnd();
            console.log("Node kind: ".concat(ts.SyntaxKind[node.kind]));
            console.log("Text: ".concat(text.substring(start, end)));
            console.log("Location: ".concat(start, "-").concat(end));
            var comments = getComments(node);
            if ((_a = comments.leading) === null || _a === void 0 ? void 0 : _a.length) {
                console.log("Leading comments:");
                comments.leading.forEach(function (c) { return console.log("  ".concat(c)); });
            }
            if ((_b = comments.trailing) === null || _b === void 0 ? void 0 : _b.length) {
                console.log("Trailing comments:");
                comments.trailing.forEach(function (c) { return console.log("  ".concat(c)); });
            }
            if (comments.jsdoc) {
                console.log("JSDoc:");
                console.log(comments.jsdoc);
            }
        },
        dumpStructure: function (structure) {
            console.log(JSON.stringify(structure, null, 2));
        },
        findNodeByPosition: function (sourceFile, position) {
            var foundNode;
            function findNode(node) {
                if (node.getStart() <= position && node.getEnd() >= position) {
                    foundNode = node;
                    ts.forEachChild(node, findNode);
                }
            }
            ts.forEachChild(sourceFile, findNode);
            return foundNode;
        },
    };
}
function logWithTimestamp(message) {
    var now = new Date();
    console.log("[".concat(now.toISOString(), "] ").concat(message));
}
function measurePerformance(name, fn) {
    var start = process.hrtime.bigint();
    var result = fn();
    var end = process.hrtime.bigint();
    var duration = Number(end - start) / 1e6;
    logWithTimestamp("\u23F1\uFE0F ".concat(name, " took ").concat(duration.toFixed(2), "ms"));
    return result;
}
function getComments(node) {
    if (!node || !node.getSourceFile) {
        return {
            leading: [],
            trailing: [],
            jsdoc: undefined,
        };
    }
    var sourceFile = node.getSourceFile();
    if (!sourceFile) {
        return {
            leading: [],
            trailing: [],
            jsdoc: undefined,
        };
    }
    var sourceText = sourceFile.getFullText();
    var leadingRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) || [];
    var trailingRanges = ts.getTrailingCommentRanges(sourceText, node.getEnd()) || [];
    var jsDoc = ts.getJSDocCommentsAndTags(node);
    return {
        leading: leadingRanges.map(function (r) { return sourceText.substring(r.pos, r.end).trim(); }),
        trailing: trailingRanges.map(function (r) { return sourceText.substring(r.pos, r.end).trim(); }),
        jsdoc: jsDoc.length ? jsDoc[0].getFullText().trim() : undefined,
    };
}
function getModifiers(node) {
    if (!("modifiers" in node))
        return [];
    var modifiers = node.modifiers;
    if (!modifiers)
        return [];
    // 添加过滤：只处理真正的修饰符关键字（排除装饰器）
    var keywordModifiers = modifiers.filter(function (mod) { return mod.kind !== ts.SyntaxKind.Decorator; });
    return keywordModifiers.map(function (mod) {
        return ts.SyntaxKind[mod.kind];
    });
}
// function getDecorators(node: ts.Node): string[] | undefined {
//     if (!"decorators" in node) return undefined;
//     const decorators = (node as any).decorators as ts.NodeArray<ts.Decorator> | undefined;
//     return decorators?.map((d) => d.getText());
// }
function parseFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error("\u6587\u4EF6\u4E0D\u5B58\u5728: ".concat(filePath));
        process.exit(1);
    }
    var compilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        allowJs: true,
        strict: false,
        skipLibCheck: true,
        experimentalDecorators: true,
    };
    var program = ts.createProgram([filePath], compilerOptions);
    var sourceFile = program.getSourceFile(filePath);
    var CodeStructure = {
        imports: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        functions: [],
        variables: [],
        namespaces: [],
    };
    if (!sourceFile) {
        console.error("\u65E0\u6CD5\u89E3\u6790\u6587\u4EF6: ".concat(filePath));
        process.exit(1);
    }
    var contextStack = [];
    var currentContext = { parent: undefined, path: [] };
    var visitNode = function (node) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!node)
            return;
        var id = (0, crypto_1.randomUUID)();
        var comments = getComments(node);
        var commentData = {
            leading: comments.leading.length ? comments.leading : undefined,
            trailing: comments.trailing.length ? comments.trailing : undefined,
            jsdoc: comments.jsdoc,
        };
        // 获取位置信息
        // const start = node.getStart();
        // const end = node.getEnd();
        // 处理导入语句
        if (ts.isImportDeclaration(node)) {
            var moduleSpecifier = node.moduleSpecifier.getText();
            CodeStructure.imports.push(moduleSpecifier.replace(/['"]/g, ""));
        }
        // 处理类定义
        else if (ts.isClassDeclaration(node) && node.name) {
            var heritage = node.heritageClauses || [];
            var extendsClause = heritage.find(function (h) { return h.token === ts.SyntaxKind.ExtendsKeyword; });
            var implementsClause = heritage.find(function (h) { return h.token === ts.SyntaxKind.ImplementsKeyword; });
            var className = (node === null || node === void 0 ? void 0 : node.name.text) || "(anonymous class ".concat(id, ")");
            var classInfo = {
                name: className,
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [className], false),
                methods: [],
                properties: [],
                children: [],
                extends: extendsClause === null || extendsClause === void 0 ? void 0 : extendsClause.types.map(function (t) { return t.getText(); }).join(", "),
                implements: (implementsClause === null || implementsClause === void 0 ? void 0 : implementsClause.types.map(function (t) { return t.getText(); })) || [],
                modifiers: getModifiers(node),
                prototype: {
                    constructor: className,
                    __proto__: (extendsClause === null || extendsClause === void 0 ? void 0 : extendsClause.types.map(function (t) { return t.getText(); }).join(", ")) || "Object.prototype",
                },
                comments: commentData,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                id: id,
            };
            // 进入类作用域
            contextStack.push(currentContext);
            currentContext = {
                parent: className,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [className], false),
            };
            ts.forEachChild(node, visitNode);
            // 恢复上下文
            currentContext = contextStack.pop();
            CodeStructure.classes.push(classInfo);
        }
        // 处理方法定义
        else if (ts.isMethodDeclaration(node) && node.name) {
            var modifiers = getModifiers(node);
            var methodInfo_1 = {
                name: node.name.getText(),
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.getText()], false),
                modifiers: modifiers,
                parameters: [],
                returnType: ((_a = node.type) === null || _a === void 0 ? void 0 : _a.getText()) || "void",
                typeParameters: (_b = node.typeParameters) === null || _b === void 0 ? void 0 : _b.map(function (tp) { return tp.getText(); }),
                decorators: undefined,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                comments: commentData,
                // 提取访问修饰符和定义修饰符
                accessModifier: modifiers.filter(function (m) { return ["public", "private", "protected", "readonly"].includes(m); }),
                definingModifier: modifiers.filter(function (m) { return ["static", "abstract", "get", "set", "constructor"].includes(m); }),
                id: id,
            };
            (_c = node.parameters) === null || _c === void 0 ? void 0 : _c.forEach(function (param) {
                var _a;
                if (ts.isParameter(param)) {
                    methodInfo_1.parameters.push({
                        name: param.name.getText(),
                        type: ((_a = param.type) === null || _a === void 0 ? void 0 : _a.getText()) || "any",
                        modifiers: getModifiers(param),
                        decorators: undefined,
                    });
                }
            });
            var parentClass = CodeStructure.classes.find(function (c) { return c.name === currentContext.parent; });
            if (parentClass) {
                parentClass.methods.push(methodInfo_1);
                parentClass.children.push(methodInfo_1);
            }
        }
        // 处理属性定义
        else if (ts.isPropertyDeclaration(node) && node.name) {
            var modifiers = getModifiers(node);
            var propInfo = {
                name: node.name.getText(),
                type: ((_d = node.type) === null || _d === void 0 ? void 0 : _d.getText()) || "any",
                decorators: undefined,
                accessModifier: modifiers.filter(function (m) { return ["public", "private", "protected", "readonly"].includes(m); }),
                definingModifier: modifiers.filter(function (m) { return ["static", "abstract", "accessor"].includes(m); }),
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.getText()], false),
                comments: commentData,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                id: id,
            };
            var parentClass = CodeStructure.classes.find(function (c) { return c.name === currentContext.parent; });
            if (parentClass) {
                parentClass.properties.push(propInfo);
                parentClass.children.push(propInfo);
            }
        }
        // 处理接口定义
        else if (ts.isInterfaceDeclaration(node)) {
            var interfaceName = (node === null || node === void 0 ? void 0 : node.name.text) || "(anonymous interface ".concat(id, ")");
            var interfaceInfo = {
                name: interfaceName,
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [interfaceName], false),
                properties: [],
                modifiers: getModifiers(node),
                comments: commentData,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                id: id,
            };
            // 进入接口作用域
            contextStack.push(currentContext);
            currentContext = {
                parent: interfaceName,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [interfaceName], false),
            };
            ts.forEachChild(node, visitNode);
            // 恢复上下文
            currentContext = contextStack.pop();
            CodeStructure.interfaces.push(interfaceInfo);
        }
        // 处理类型别名
        else if (ts.isTypeAliasDeclaration(node)) {
            var typeAliasName = (node === null || node === void 0 ? void 0 : node.name.text) || "(anonymous type alias ".concat(id, ")");
            CodeStructure.types.push({
                name: typeAliasName,
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [typeAliasName], false),
                type: node.type.getText(),
                typeParameters: (_e = node.typeParameters) === null || _e === void 0 ? void 0 : _e.map(function (tp) { return tp.getText(); }),
                modifiers: getModifiers(node),
                comments: commentData,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                id: id,
            });
        }
        // 处理枚举
        else if (ts.isEnumDeclaration(node)) {
            var enumName = (node === null || node === void 0 ? void 0 : node.name.text) || "(anonymous enum ".concat(id, ")");
            var enumInfo_1 = {
                name: enumName,
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [enumName], false),
                members: [],
                modifiers: getModifiers(node),
                comments: commentData,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                id: id,
            };
            node.members.forEach(function (member) {
                if (ts.isEnumMember(member) && member.name) {
                    enumInfo_1.members.push(member.name.getText());
                }
            });
            CodeStructure.enums.push(enumInfo_1);
        }
        // 处理函数
        else if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            var funcName = ((_f = node.name) === null || _f === void 0 ? void 0 : _f.text) || "(anonymous function ".concat(id, ")");
            var modifiers = getModifiers(node);
            var funcInfo_1 = {
                name: funcName,
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [funcName], false),
                modifiers: modifiers,
                parameters: [],
                returnType: ((_g = node.type) === null || _g === void 0 ? void 0 : _g.getText()) || "any",
                typeParameters: (_h = node.typeParameters) === null || _h === void 0 ? void 0 : _h.map(function (tp) { return tp.getText(); }),
                decorators: undefined,
                comments: commentData,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                id: id,
            };
            (_j = node.parameters) === null || _j === void 0 ? void 0 : _j.forEach(function (param) {
                var _a;
                if (ts.isParameter(param)) {
                    funcInfo_1.parameters.push({
                        name: param.name.getText(),
                        type: ((_a = param.type) === null || _a === void 0 ? void 0 : _a.getText()) || "any",
                        modifiers: getModifiers(param),
                        decorators: undefined,
                    });
                }
            });
            CodeStructure.functions.push(funcInfo_1);
        }
        // 处理变量声明
        else if (ts.isVariableStatement(node)) {
            var modifiers_1 = getModifiers(node);
            node.declarationList.declarations.forEach(function (decl) {
                var _a, _b;
                if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
                    var definingModifier = node.declarationList.flags & ts.NodeFlags.Const
                        ? "const"
                        : node.declarationList.flags & ts.NodeFlags.Let
                            ? "let"
                            : "var";
                    var valueScope = currentContext.parent
                        ? "block"
                        : ((_a = node.parent) === null || _a === void 0 ? void 0 : _a.kind) === ts.SyntaxKind.SourceFile
                            ? "global"
                            : "function";
                    CodeStructure.variables.push({
                        name: decl.name.text,
                        parent: currentContext.parent,
                        path: __spreadArray(__spreadArray([], currentContext.path, true), [decl.name.text], false),
                        type: ((_b = decl.type) === null || _b === void 0 ? void 0 : _b.getText()) || "any",
                        definingModifier: definingModifier,
                        modifiers: modifiers_1,
                        valueScope: valueScope,
                        comments: commentData,
                        location: {
                            start: decl.getStart(),
                            end: decl.getEnd(),
                        },
                        id: id,
                    });
                }
            });
        }
        // 处理命名空间
        else if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            var modifiers = getModifiers(node);
            var namespaceName = (node === null || node === void 0 ? void 0 : node.name.text) || "(anonymous namespace ".concat(id, ")");
            var namespaceInfo = {
                name: namespaceName,
                parent: currentContext.parent,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [namespaceName], false),
                children: [],
                modifiers: modifiers,
                comments: commentData,
                location: {
                    start: node.getStart(),
                    end: node.getEnd(),
                },
                id: id,
            };
            // 进入命名空间作用域
            contextStack.push(currentContext);
            currentContext = {
                parent: namespaceName,
                path: __spreadArray(__spreadArray([], currentContext.path, true), [namespaceName], false),
            };
            if (node.body && ts.isModuleBlock(node.body)) {
                ts.forEachChild(node.body, visitNode);
            }
            // 恢复上下文
            currentContext = contextStack.pop();
            CodeStructure.namespaces.push(namespaceInfo);
        }
        // 递归处理子节点
        try {
            ts.forEachChild(node, visitNode);
        }
        catch (e) {
            var err = e;
            console.error("\u904D\u5386\u5B50\u8282\u70B9\u65F6\u51FA\u9519: ".concat(err.message));
        }
    };
    // 开始遍历AST
    measurePerformance("parseFile", function () {
        ts.forEachChild(sourceFile, visitNode);
    });
    return CodeStructure;
}
function cli() {
    var filePath = process.argv[2];
    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }
    var result = parseFile(filePath);
    fs.writeFileSync("ts-parser/tmp/analyzed.json", JSON.stringify(result, null, 2));
    console.log("分析结果已保存到 ts-parser/tmp/analyzed.json");
}
if (require.main === module)
    cli();
