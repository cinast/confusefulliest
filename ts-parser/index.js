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
    if (!node) {
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
function getDecorators(node) {
    if (!("decorators" in node))
        return undefined;
    var decorators = node.decorators;
    return decorators === null || decorators === void 0 ? void 0 : decorators.map(function (d) { return d.getText(); });
}
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
    };
    var program = ts.createProgram([filePath], compilerOptions);
    var sourceFile = program.getSourceFile(filePath);
    var resultGlobalScope = {
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
        try {
            var comments = getComments(node);
            var commentData_1 = {
                leading: comments.leading.length ? comments.leading : undefined,
                trailing: comments.trailing.length ? comments.trailing : undefined,
                jsdoc: comments.jsdoc,
            };
            // 获取位置信息
            var start = node.getStart();
            var end = node.getEnd();
            var startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
            var endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
            // 处理导入语句
            if (ts.isImportDeclaration(node)) {
                var moduleSpecifier = node.moduleSpecifier.getText();
                resultGlobalScope.imports.push(moduleSpecifier.replace(/['"]/g, ""));
            }
            // 处理类定义
            else if (ts.isClassDeclaration(node) && node.name) {
                var heritage = node.heritageClauses || [];
                var extendsClause = heritage.find(function (h) { return h.token === ts.SyntaxKind.ExtendsKeyword; });
                var implementsClause = heritage.find(function (h) { return h.token === ts.SyntaxKind.ImplementsKeyword; });
                var classInfo = {
                    name: node.name.text,
                    parent: currentContext.parent,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                    methods: [],
                    properties: [],
                    children: [],
                    extends: extendsClause === null || extendsClause === void 0 ? void 0 : extendsClause.types.map(function (t) { return t.getText(); }).join(", "),
                    implements: (implementsClause === null || implementsClause === void 0 ? void 0 : implementsClause.types.map(function (t) { return t.getText(); })) || [],
                    modifiers: getModifiers(node),
                    prototype: {
                        constructor: node.name.text,
                        __proto__: (extendsClause === null || extendsClause === void 0 ? void 0 : extendsClause.types.map(function (t) { return t.getText(); }).join(", ")) || "Object.prototype",
                    },
                    comments: commentData_1,
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                };
                // 进入类作用域
                contextStack.push(currentContext);
                currentContext = {
                    parent: node.name.text,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                };
                ts.forEachChild(node, visitNode);
                // 恢复上下文
                currentContext = contextStack.pop();
                resultGlobalScope.classes.push(classInfo);
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
                    decorators: getDecorators(node),
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                    comments: commentData_1,
                    // 提取访问修饰符和定义修饰符
                    accessModifier: modifiers.filter(function (m) { return ["public", "private", "protected", "readonly"].includes(m); }),
                    definingModifier: modifiers.filter(function (m) {
                        return ["static", "abstract", "get", "set", "constructor"].includes(m);
                    }),
                };
                (_c = node.parameters) === null || _c === void 0 ? void 0 : _c.forEach(function (param) {
                    var _a;
                    if (ts.isParameter(param)) {
                        methodInfo_1.parameters.push({
                            name: param.name.getText(),
                            type: ((_a = param.type) === null || _a === void 0 ? void 0 : _a.getText()) || "any",
                            modifiers: getModifiers(param),
                            decorators: getDecorators(param),
                        });
                    }
                });
                var parentClass = resultGlobalScope.classes.find(function (c) { return c.name === currentContext.parent; });
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
                    decorators: getDecorators(node),
                    accessModifier: modifiers.filter(function (m) { return ["public", "private", "protected", "readonly"].includes(m); }),
                    definingModifier: modifiers.filter(function (m) { return ["static", "abstract", "accessor"].includes(m); }),
                    parent: currentContext.parent,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.getText()], false),
                    comments: commentData_1,
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                };
                var parentClass = resultGlobalScope.classes.find(function (c) { return c.name === currentContext.parent; });
                if (parentClass) {
                    parentClass.properties.push(propInfo);
                    parentClass.children.push(propInfo);
                }
            }
            // 处理接口定义
            else if (ts.isInterfaceDeclaration(node)) {
                var interfaceInfo = {
                    name: node.name.text,
                    parent: currentContext.parent,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                    properties: [],
                    modifiers: getModifiers(node),
                    comments: commentData_1,
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                };
                // 进入接口作用域
                contextStack.push(currentContext);
                currentContext = {
                    parent: node.name.text,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                };
                ts.forEachChild(node, visitNode);
                // 恢复上下文
                currentContext = contextStack.pop();
                resultGlobalScope.interfaces.push(interfaceInfo);
            }
            // 处理类型别名
            else if (ts.isTypeAliasDeclaration(node)) {
                resultGlobalScope.types.push({
                    name: node.name.text,
                    parent: currentContext.parent,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                    type: node.type.getText(),
                    typeParameters: (_e = node.typeParameters) === null || _e === void 0 ? void 0 : _e.map(function (tp) { return tp.getText(); }),
                    modifiers: getModifiers(node),
                    comments: commentData_1,
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                });
            }
            // 处理枚举
            else if (ts.isEnumDeclaration(node)) {
                var enumInfo_1 = {
                    name: node.name.text,
                    parent: currentContext.parent,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                    members: [],
                    modifiers: getModifiers(node),
                    comments: commentData_1,
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                };
                node.members.forEach(function (member) {
                    if (ts.isEnumMember(member) && member.name) {
                        enumInfo_1.members.push(member.name.getText());
                    }
                });
                resultGlobalScope.enums.push(enumInfo_1);
            }
            // 处理函数
            else if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
                var funcName = ((_f = node.name) === null || _f === void 0 ? void 0 : _f.text) || "(anonymous)";
                var modifiers = getModifiers(node);
                var funcInfo_1 = {
                    name: funcName,
                    parent: currentContext.parent,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [funcName], false),
                    modifiers: modifiers,
                    parameters: [],
                    returnType: ((_g = node.type) === null || _g === void 0 ? void 0 : _g.getText()) || "any",
                    typeParameters: (_h = node.typeParameters) === null || _h === void 0 ? void 0 : _h.map(function (tp) { return tp.getText(); }),
                    decorators: getDecorators(node),
                    comments: commentData_1,
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                };
                (_j = node.parameters) === null || _j === void 0 ? void 0 : _j.forEach(function (param) {
                    var _a;
                    if (ts.isParameter(param)) {
                        funcInfo_1.parameters.push({
                            name: param.name.getText(),
                            type: ((_a = param.type) === null || _a === void 0 ? void 0 : _a.getText()) || "any",
                            modifiers: getModifiers(param),
                            decorators: getDecorators(param),
                        });
                    }
                });
                resultGlobalScope.functions.push(funcInfo_1);
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
                        resultGlobalScope.variables.push({
                            name: decl.name.text,
                            parent: currentContext.parent,
                            path: __spreadArray(__spreadArray([], currentContext.path, true), [decl.name.text], false),
                            type: ((_b = decl.type) === null || _b === void 0 ? void 0 : _b.getText()) || "any",
                            definingModifier: definingModifier,
                            modifiers: modifiers_1,
                            valueScope: valueScope,
                            comments: commentData_1,
                            location: {
                                start: decl.getStart(),
                                end: decl.getEnd(),
                                lineStart: sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1,
                                lineEnd: sourceFile.getLineAndCharacterOfPosition(decl.getEnd()).line + 1,
                            },
                        });
                    }
                });
            }
            // 处理命名空间
            else if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
                var modifiers = getModifiers(node);
                var namespaceInfo = {
                    name: node.name.text,
                    parent: currentContext.parent,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                    children: [],
                    modifiers: modifiers,
                    comments: commentData_1,
                    location: { start: start, end: end, lineStart: startLine, lineEnd: endLine },
                };
                // 进入命名空间作用域
                contextStack.push(currentContext);
                currentContext = {
                    parent: node.name.text,
                    path: __spreadArray(__spreadArray([], currentContext.path, true), [node.name.text], false),
                };
                if (node.body && ts.isModuleBlock(node.body)) {
                    ts.forEachChild(node.body, visitNode);
                }
                // 恢复上下文
                currentContext = contextStack.pop();
                resultGlobalScope.namespaces.push(namespaceInfo);
            }
        }
        catch (e) {
            var err = e;
            console.error("\u5904\u7406\u8282\u70B9\u65F6\u51FA\u9519: ".concat(err.message));
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
    return resultGlobalScope;
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
