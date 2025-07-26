"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.scriptParser = exports.idMap = void 0;
var ts = require("typescript");
var fs = require("fs");
var path = require("path");
var crypto_1 = require("crypto");
("use strict");
var parser_version = "0.0.0";
// 支持的扩展名类型
var JSFileType = ["js"];
var TSFileType = ["ts"];
/**
 * 新的AST逻辑（概念更新2.0）：
 * 重构了interface，概念底朝天大改
 *
 * 1. 逻辑流控制（if-else、try-catch、switch-case、for/while等）
 * 2. 定义声明（变量、函数、类、接口、类型等）
 * 3. 特殊语句（debugger、throw等）
 *
 * 注：以下示例展示部分interface结构，完整定义见下方interfaces
 *
 * export class cls extends BaseClass {
 * ^访问修饰 ^主词 ^符号 ^其他  ^符号
 *
 *    declaration[ClassDeclaration] >
 *    |     accessModifier ["export"]
 *    |     name "cls"
 *    |     definingModifier []
 *    |     extends "BaseClass"
 *    |     implements ["I1", "I2"]
 *    |     methods: MethodDeclaration[] >
 *    |          1 MethodDeclaration >
 *    |          |    name "constructor"
 *    |          |    definingModifier ["constructor"]
 *    |
 *    |          2 MethodDeclaration >
 *    |          |    name "doSomething"
 *    |          |    accessModifier ["public"]
 *    |          |    typeModifier "async"
 *    |
 *    |     properties: PropertyDeclaration[] >
 *    |          1 PropertyDeclaration >
 *    |          |    name "prop1"
 *    |          |    type "string"
 *    |          |    value "'default'"
 *    |
 *    |     children: Declaration[] >
 *    |     |    [1]: VariableDeclaration
 *    |     |    [0]: FunctionDeclaration
 *    |     prototype: { constructor: "cls" }
 *    — — —
 *
 *    @decorator    ↓修饰符
 *    async function* gen<T>(param: T) {
 *    ^修饰符 ^主词    ^符号 ⇤ 参数域 ⇥
 *
 *    declaration[FunctionDeclaration] >
 *    |     name "gen"
 *    |     accessModifier []
 *    |     typeModifier "async-generic"
 *    |     typeParameters: SingleTypeParameterDeclaration[] >
 *    |     |    1 SingleTypeParameterDeclaration >
 *    |     |    |    name "T"
 *    |
 *    |     parameters: SingleParameterDeclaration[] >
 *    |     |    1 SingleParameterDeclaration >
 *    |     |    |    name "param"
 *    |     |    |    type "T"
 *    |
 *    |     returnType "Generator"
 *    |     functionBody: Statement[] >
 *    |     |    [0]: YieldStatement
 *    |     |    [1]: ReturnStatement
 *    |     decorators: ["@decorator"]
 *
 *
 *    const { a, b: renamed } = obj
 *
 *    declaration[VariableDeclaration] >
 *    |     definingModifier "const"
 *    |     objects: Array<{name,type,value}> >
 *    |     |    [0]:
 *    |     |    |    name "a"
 *    |     |    |    typeInferred "any"
 *    |     |    |    value "obj.a"
 *    |     |    |
 *    |     |    [1]:
 *    |     |    |    name "renamed"
 *    |     |    |    typeInferred "any"
 *    |     |    |    value "obj.b"
 *
 *
 *    type T<U extends string = 'default'> = U | number
 *
 *    declaration[TypeAliasDeclaration] >
 *    |     name "T"
 *    |     typeValue "U | number"
 *    |     typeParameters: SingleTypeParameterDeclaration[] >
 *    |          1 Parameter >
 *    |          |    name "U"
 *    |          |    typeExtends "string"
 *    |          |    default "'default'"
 *
 *    《if语句の千层套路》
 *    if (cond1) {
 *       return 1
 *    } else if (cond2) {
 *       yield 2
 *    } else {
 *       throw 3
 *    }
 *
 *    statement[IfStatement] >
 *    |     Chain: Array<{condition?, body}> >
 *    |     |    [1]:
 *    |     |    |    condition "cond1"
 *    |     |    |    body: [ReturnStatement]
 *    |     |    [2]:
 *    |     |    |    condition "cond2"
 *    |     |    |    body: [YieldStatement]
 *    |     |    [3]:
 *    |     |    |    body: [ThrowStatement]
 *
 *   《 REBORN AGAIN:: IM the TypeScript Ruler 》
 *    <code> 💻 ✊ 🔥 </code>
 */
/**
 * @notice
 * 约定俗成，
 * 一些有child属性Declaration，其中的child是大纲，只列文字列表，展示其辖属元素
 * interface们的属性按照语法顺序写
 */
/**
 * 所有语法元素（非标准ast的）的平面id索引
 */
exports.idMap = new Map();
// cli tool
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
// cli debugging
var debugUtils = {
    logAST: function (node, depth) {
        if (depth === void 0) { depth = 0; }
        var indent = "  ".repeat(depth);
        console.log("".concat(indent).concat(ts.SyntaxKind[node.kind]));
        ts.forEachChild(node, function (child) { return debugUtils.logAST(child, depth + 1); });
    },
    printNodeInfo: function (node) {
        var sourceFile = node.getSourceFile();
        var text = (sourceFile === null || sourceFile === void 0 ? void 0 : sourceFile.getFullText()) || "";
        var start = node.getStart();
        var end = node.getEnd();
        console.log("Node kind: ".concat(ts.SyntaxKind[node.kind]));
        console.log("Text: ".concat(text.substring(start, end)));
        console.log("Location: ".concat(start, "-").concat(end));
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
var scriptParser = /** @class */ (function () {
    function scriptParser(tsconfigPath, options) {
        if (options === void 0) { options = {}; }
        this.currentSourceFile = null;
        var _a = options.buildOutline, buildOutline = _a === void 0 ? false : _a, _b = options.skipTypeCheck, skipTypeCheck = _b === void 0 ? true : _b, _c = options.experimentalSyntax, experimentalSyntax = _c === void 0 ? "strict" : _c;
        var configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
        this.compilerOptions = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath)).options;
        var program = ts.createProgram([], this.compilerOptions);
        this.typeChecker = program.getTypeChecker();
        this.shouldBuildOutline = buildOutline;
        this.skipTypeCheck = skipTypeCheck;
    }
    scriptParser.prototype.buildNestedStatements = function (sourceFile) {
        var result = [];
        var stack = [];
        var visit = function (node) {
            var id = (0, crypto_1.randomUUID)();
            var current = [id];
            // 检查当前节点是否应该开启新作用域
            if (ts.isBlock(node) || ts.isFunctionLike(node) || ts.isClassLike(node)) {
                stack.push({ id: id, children: [] });
            }
            // 如果栈中有父节点，添加到父节点的子集
            if (stack.length > 0) {
                var parent_1 = stack[stack.length - 1];
                parent_1.children.push(current);
            }
            else {
                result.push(current);
            }
            // 递归处理子节点
            ts.forEachChild(node, visit);
            // 结束作用域处理
            if ((ts.isBlock(node) || ts.isFunctionLike(node) || ts.isClassLike(node)) && stack.length > 0) {
                var completed = stack.pop();
                // 将子节点添加到当前节点
                if (completed.children.length > 0) {
                    current.push(completed.children);
                }
            }
        };
        ts.forEachChild(sourceFile, visit);
        return result;
    };
    scriptParser.prototype.parse = function (sourceFile) {
        var _this = this;
        this.currentSourceFile = sourceFile;
        var idMap = {};
        var scopeHierarchy = [];
        var currentScope = [];
        var declarations = [];
        var visitor = function (node) {
            var sourceFile = _this.currentSourceFile;
            if (_this.isDeclaration(node)) {
                var declaration = _this.processDeclarationNode(node);
                declarations.push(declaration);
            }
            var id = (0, crypto_1.randomUUID)();
            var nodeInfo = _this.extractNodeInfo(node);
            idMap[id] = __assign(__assign({}, nodeInfo), { loc: {
                    start: node.getStart(sourceFile),
                    end: node.getEnd(),
                } });
            if (ts.isBlock(node) || ts.isFunctionLike(node)) {
                var prevScope = __spreadArray([], currentScope, true);
                currentScope.push(id);
                scopeHierarchy.push(__spreadArray([], currentScope, true));
                ts.forEachChild(node, visitor);
                currentScope = prevScope;
            }
            else {
                ts.forEachChild(node, visitor);
            }
        };
        ts.forEachChild(sourceFile, visitor);
        var analyzedAST = {
            imports: this.extractImports(sourceFile),
            exports: this.extractExports(sourceFile),
            globalScope: this.collectGlobalStatements(sourceFile),
            ScopTree: scopeHierarchy,
            idMap: idMap,
        };
        var compilerMetadata = {
            fileName: sourceFile.fileName,
            tsconfig: __assign(__assign({}, this.getTsConfig()), { compilerVersion: ts.version }),
        };
        var metadata = this.generateMetadata(sourceFile);
        this.currentSourceFile = null;
        var originalSourceFile = delete __assign({}, sourceFile).statements;
        // 转换StandardAST结构
        var standardAST = __assign(__assign({}, originalSourceFile), { syntaxUnits: {}, 
            ///@ts-ignore
            statements: this.buildNestedStatements(sourceFile), __originalTypeInfo: {} });
        // 构建syntaxUnits映射
        var nodeIdMap = new Map();
        ts.forEachChild(sourceFile, function (node) {
            var id = (0, crypto_1.randomUUID)();
            nodeIdMap.set(node, id);
            standardAST.syntaxUnits[id] = {
                node: __assign(__assign({}, node), { id: id }),
                id: id,
                path: _this.getNodePath(node),
            };
        });
        // 补全AnalyzedAST结构
        var fullAnalyzedAST = __assign(__assign({}, analyzedAST), { ScopeHierarchyMap: analyzedAST.ScopTree || [] });
        return {
            AnalyzedAST: fullAnalyzedAST,
            StandardAST: standardAST,
            compilerMetadata: compilerMetadata,
            Metadata: metadata,
        };
    };
    scriptParser.prototype.isDeclaration = function (node) {
        return (ts.isVariableStatement(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node)
        // ts.isDeclarationStatement(node)
        );
    };
    scriptParser.prototype.processDeclarationNode = function (node) {
        var _a, _b, _c;
        var sourceFile = this.currentSourceFile;
        var base = {
            id: (0, crypto_1.randomUUID)(),
            path: this.getNodePath(node),
            location: {
                start: node.getStart(sourceFile),
                end: node.getEnd(),
            },
            statementType: ts.SyntaxKind[node.kind],
        };
        if (ts.isClassDeclaration(node)) {
            var modifiers = ts.getModifiers(node) || [];
            var hasAbstract = modifiers.some(function (m) { return m.kind === ts.SyntaxKind.AbstractKeyword; });
            return __assign(__assign({}, base), { statementType: "ClassDeclaration", name: this.getNodeText(node.name, sourceFile), methods: [], properties: [], children: [], definingModifier: hasAbstract ? ["abstract"] : [], implements: [], prototype: { constructor: base.id || "" } });
        }
        else if (ts.isFunctionDeclaration(node)) {
            var modifiers = ts.getModifiers(node) || [];
            var isAsync = modifiers.some(function (m) { return m.kind === ts.SyntaxKind.AsyncKeyword; });
            var isGenerator = node.asteriskToken !== undefined;
            return __assign(__assign({}, base), { statementType: "FunctionDeclaration", name: this.getNodeText(node.name, sourceFile), parameters: [], returnType: (_a = node.type) === null || _a === void 0 ? void 0 : _a.getText(sourceFile), returnTypeInferred: ((_b = node.type) === null || _b === void 0 ? void 0 : _b.getText(sourceFile)) || "any", functionBody: [], prototype: { constructor: ((_c = node.name) === null || _c === void 0 ? void 0 : _c.escapedText.toString()) || "" }, typeModifier: isAsync && isGenerator ? "async-generic" : isAsync ? "async" : isGenerator ? "generic" : undefined });
        }
        // 其他Declaration类型的处理...
        return base;
    };
    scriptParser.prototype.processDeclaration = function (node, nodeInfo) {
        // 实现具体的Declaration处理逻辑
        if (ts.isClassDeclaration(node)) {
            this.processClassDeclaration(node, nodeInfo);
        }
        else if (ts.isFunctionDeclaration(node)) {
            this.processFunctionDeclaration(node, nodeInfo);
        }
        // 其他Declaration类型的处理...
    };
    scriptParser.prototype.processClassDeclaration = function (node, nodeInfo) {
        var _a;
        var sourceFile = this.currentSourceFile;
        // 处理类声明的具体逻辑
        nodeInfo.statementType = "ClassDeclaration";
        nodeInfo.name = ((_a = node.name) === null || _a === void 0 ? void 0 : _a.getText(sourceFile)) || "";
        nodeInfo.methods = [];
        nodeInfo.properties = [];
        nodeInfo.children = [];
    };
    scriptParser.prototype.processFunctionDeclaration = function (node, nodeInfo) {
        var _a, _b;
        var sourceFile = this.currentSourceFile;
        // 处理函数声明的具体逻辑
        nodeInfo.statementType = "FunctionDeclaration";
        nodeInfo.name = ((_a = node.name) === null || _a === void 0 ? void 0 : _a.getText(sourceFile)) || "";
        nodeInfo.parameters = [];
        nodeInfo.returnType = (_b = node.type) === null || _b === void 0 ? void 0 : _b.getText(sourceFile);
    };
    scriptParser.prototype.buildNodeMap = function (node, idMap, scopeHierarchy, currentScope) {
        var _this = this;
        var id = (0, crypto_1.randomUUID)();
        var nodeInfo = this.extractNodeInfo(node);
        idMap[id] = __assign(__assign({}, nodeInfo), { loc: { start: node.getStart(), end: node.getEnd() } });
        // 处理作用域变化
        if (ts.isBlock(node) || ts.isFunctionDeclaration(node)) {
            var prevScope = __spreadArray([], currentScope, true);
            currentScope.push(id);
            scopeHierarchy.push(__spreadArray([], currentScope, true));
            ts.forEachChild(node, function (child) { return _this.buildNodeMap(child, idMap, scopeHierarchy, currentScope); });
            currentScope = prevScope;
        }
        else {
            ts.forEachChild(node, function (child) { return _this.buildNodeMap(child, idMap, scopeHierarchy, currentScope); });
        }
    };
    scriptParser.prototype.buildMaps = function (sourceFile) {
        var _this = this;
        var idMap = {};
        var scopeHierarchy = [];
        var currentScope = [];
        var visitor = function (node) {
            var id = (0, crypto_1.randomUUID)();
            var nodeInfo = _this.extractNodeInfo(node);
            idMap[id] = __assign(__assign({}, nodeInfo), { loc: { start: node.getStart(), end: node.getEnd() } });
            // 处理作用域变化
            if (ts.isBlock(node) || ts.isFunctionDeclaration(node)) {
                var prevScope = __spreadArray([], currentScope, true);
                currentScope.push(id);
                scopeHierarchy.push(__spreadArray([], currentScope, true));
                ts.forEachChild(node, visitor);
                currentScope = prevScope;
            }
            else {
                ts.forEachChild(node, visitor);
            }
        };
        ts.forEachChild(sourceFile, visitor);
        return { idMap: idMap, scopeHierarchy: scopeHierarchy };
    };
    scriptParser.prototype.extractNodeInfo = function (node) {
        var sourceFile = this.currentSourceFile;
        var start = 0;
        var end = 0;
        try {
            start = node.getStart(sourceFile);
            end = node.getEnd();
        }
        catch (e) {
            start = node.pos;
            end = node.end;
        }
        return {
            path: this.getNodePath(node),
            name: ts.isIdentifier(node) ? node.text : undefined,
            type: ts.SyntaxKind[node.kind],
            object: {
                id: (0, crypto_1.randomUUID)(),
                path: this.getNodePath(node),
                location: { start: start, end: end },
                statementType: ts.SyntaxKind[node.kind],
            },
        };
    };
    scriptParser.prototype.createBaseStatement = function (node) {
        var sourceFile = this.currentSourceFile;
        var start = 0;
        var end = 0;
        try {
            start = node.getStart(sourceFile);
            end = node.getEnd();
        }
        catch (e) {
            var error = e;
            console.warn("Failed to get node position (".concat(ts.SyntaxKind[node.kind], "): ").concat(error.message));
            console.warn("Falling back to node.pos/end for node: ".concat(node.getText(sourceFile).slice(0, 50), "..."));
            start = node.pos;
            end = node.end;
        }
        return {
            id: (0, crypto_1.randomUUID)(),
            path: this.getNodePath(node),
            location: { start: start, end: end },
            statementType: ts.SyntaxKind[node.kind],
        };
    };
    scriptParser.prototype.getNodeText = function (node, sourceFile) {
        var _this = this;
        if (!node)
            return "";
        console.warn("节点类型:", ts.SyntaxKind[node.kind]);
        console.warn("节点内容:", node);
        console.warn("FUCK NODE");
        // throw "FUCK";
        debugger;
        // 优先使用getText方法
        if (ts.isFunctionDeclaration(node)) {
            return node.getText(sourceFile);
        }
        debugger;
        // 处理各种AST节点类型
        if (ts.isIdentifier(node)) {
            return node.escapedText.toString();
        }
        debugger;
        if (ts.isStringLiteral(node)) {
            return node.text;
        }
        debugger;
        if (ts.isNumericLiteral(node)) {
            return node.text;
        }
        debugger;
        if (ts.isTemplateLiteral(node)) {
            return node.getText(sourceFile);
        }
        debugger;
        if (ts.isPropertyAccessExpression(node)) {
            return "".concat(this.getNodeText(node.expression, sourceFile), ".").concat(node.name.text);
        }
        debugger;
        if (ts.isElementAccessExpression(node)) {
            return "".concat(this.getNodeText(node.expression, sourceFile), "[").concat(this.getNodeText(node.argumentExpression, sourceFile), "]");
        }
        debugger;
        if (ts.isCallExpression(node)) {
            return "".concat(this.getNodeText(node.expression, sourceFile), "(").concat(node.arguments
                .map(function (arg) { return _this.getNodeText(arg, sourceFile); })
                .join(", "), ")");
        }
        debugger;
        // 回退到escapedText
        if (node.escapedText) {
            return node.escapedText;
        }
        debugger;
        // 处理其他特殊情况
        if (node.kind === ts.SyntaxKind.ThisKeyword) {
            return "this";
        }
        debugger;
        if (node.kind === ts.SyntaxKind.SuperKeyword) {
            return "super";
        }
        debugger;
        return "";
    };
    scriptParser.prototype.getNodePath = function (node) {
        // 实现获取节点路径的逻辑
        return "";
    };
    scriptParser.prototype.extractImports = function (sourceFile) {
        // 实现提取imports的逻辑
        return [];
    };
    scriptParser.prototype.extractExports = function (sourceFile) {
        // 实现提取exports的逻辑
        return [];
    };
    scriptParser.prototype.collectGlobalStatements = function (sourceFile) {
        var _this = this;
        var prevSourceFile = this.currentSourceFile;
        this.currentSourceFile = sourceFile;
        var statements = [];
        ts.transform(sourceFile, [
            function (context) {
                var visit = function (node) {
                    if (_this.isGlobalStatement(node)) {
                        var baseStatement = _this.createBaseStatement(node);
                        _this.processChildren(node, baseStatement);
                        statements.push(baseStatement);
                    }
                    return ts.visitEachChild(node, visit, context);
                };
                return visit;
            },
        ]);
        this.currentSourceFile = prevSourceFile;
        return statements;
    };
    scriptParser.prototype.processChildren = function (node, parentStatement) {
        var _this = this;
        ts.forEachChild(node, function (child) {
            var childStatement = _this.createBaseStatement(child);
            if (!parentStatement.children) {
                parentStatement.children = [];
            }
            parentStatement.children.push(childStatement);
            _this.processChildren(child, childStatement);
        });
    };
    scriptParser.prototype.isGlobalStatement = function (node) {
        return (ts.isVariableStatement(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node));
    };
    scriptParser.prototype.generateMetadata = function (sourceFile) {
        return {
            parseInfo: {
                parserVersion: parser_version,
                parserPath: __filename,
                timeCost: 0,
                memoryUsage: 0,
                nodeCount: 0,
                identifierCount: 0,
            },
            sourceInfo: {
                targetPath: sourceFile.fileName,
                fileSize: sourceFile.getFullText().length,
                loc: { total: 0, code: 0, comment: 0 },
                hash: "",
                lineEndings: "LF",
            },
            output_logs: "",
        };
    };
    scriptParser.prototype.getTsConfig = function () {
        // 返回当前使用的tsconfig简化信息
        return {
            fileName: "tsconfig.json",
            options: this.compilerOptions,
            compilerVersion: ts.version,
        };
    };
    return scriptParser;
}());
exports.scriptParser = scriptParser;
function cli() {
    var _a;
    var args = require("minimist")(process.argv.slice(2));
    var filePath = args._[0];
    var outDir = (_a = args._[1]) !== null && _a !== void 0 ? _a : "tmp/analyzed.json";
    var buildOutline = args["build-outline"] || false;
    var skipTypeCheck = args["skip-type-check"] !== false;
    var experimentalSyntax = args["experimental-syntax"] || "strict";
    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }
    var parser = new scriptParser("tsconfig.json", {
        buildOutline: buildOutline,
        skipTypeCheck: skipTypeCheck,
        experimentalSyntax: experimentalSyntax,
    });
    var program = ts.createProgram([filePath], {});
    var sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
        console.error("\u65E0\u6CD5\u89E3\u6790\u6587\u4EF6: ".concat(filePath));
        process.exit(1);
    }
    var result = parser.parse(sourceFile);
    console.clear();
    console.log(result);
    fs.writeFileSync(outDir, JSON.stringify(result, null, 2));
    console.log("\u5206\u6790\u7ED3\u679C\u5DF2\u4FDD\u5B58\u5230 ".concat(outDir));
}
if (require.main === module)
    cli();
