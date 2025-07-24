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
        var _a = options.buildOutline, buildOutline = _a === void 0 ? false : _a, _b = options.skipTypeCheck, skipTypeCheck = _b === void 0 ? true : _b, _c = options.experimentalSyntax, experimentalSyntax = _c === void 0 ? "strict" : _c;
        var configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
        this.compilerOptions = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath)).options;
        var program = ts.createProgram([], this.compilerOptions);
        this.typeChecker = program.getTypeChecker();
        this.shouldBuildOutline = buildOutline;
        this.skipTypeCheck = skipTypeCheck;
    }
    scriptParser.prototype.parse = function (sourceFile) {
        var _this = this;
        var idMap = {};
        var scopeHierarchy = [];
        var currentScope = [];
        var declarations = [];
        var visitor = function (node) {
            // 处理Declaration节点
            if (_this.isDeclaration(node)) {
                var declaration = _this.processDeclarationNode(node);
                declarations.push(declaration);
            }
            // 实时构建映射
            if (_this.shouldBuildOutline) {
                _this.buildNodeMap(node, idMap, scopeHierarchy, currentScope);
            }
            var id = _this.generateNodeId(node);
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
            // 在解析时直接处理Declaration
            if (_this.shouldBuildOutline && _this.isDeclaration(node)) {
                _this.processDeclaration(node, idMap[id]);
            }
        };
        ts.forEachChild(sourceFile, visitor);
        return {
            AnalyzedAST: {
                imports: this.extractImports(sourceFile),
                exports: this.extractExports(sourceFile),
                globalScope: this.collectGlobalStatements(sourceFile),
                ScopeHierarchyMap: scopeHierarchy,
                idMap: idMap,
            },
            StandardAST: sourceFile,
            compilerMetadata: {
                fileName: sourceFile.fileName,
                tsconfig: __assign(__assign({}, this.getTsConfig()), { compilerVersion: ts.version }),
            },
            Metadata: this.generateMetadata(sourceFile),
        };
    };
    scriptParser.prototype.isDeclaration = function (node) {
        return (ts.isVariableStatement(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node));
    };
    scriptParser.prototype.processDeclarationNode = function (node) {
        var _a, _b, _c, _d, _e, _f;
        var base = {
            id: this.generateNodeId(node),
            path: this.getNodePath(node),
            location: { start: node.getStart(), end: node.getEnd() },
            statementType: ts.SyntaxKind[node.kind],
        };
        if (ts.isClassDeclaration(node)) {
            var modifiers = ts.getModifiers(node) || [];
            var hasAbstract = modifiers.some(function (m) { return m.kind === ts.SyntaxKind.AbstractKeyword; });
            return __assign(__assign({}, base), { statementType: "ClassDeclaration", name: (_a = node.name) === null || _a === void 0 ? void 0 : _a.getText(), methods: [], properties: [], children: [], definingModifier: hasAbstract ? ["abstract"] : [], implements: [], prototype: { constructor: ((_b = node.name) === null || _b === void 0 ? void 0 : _b.getText()) || "" } });
        }
        else if (ts.isFunctionDeclaration(node)) {
            var modifiers = ts.getModifiers(node) || [];
            var isAsync = modifiers.some(function (m) { return m.kind === ts.SyntaxKind.AsyncKeyword; });
            var isGenerator = node.asteriskToken !== undefined;
            return __assign(__assign({}, base), { statementType: "FunctionDeclaration", name: (_c = node.name) === null || _c === void 0 ? void 0 : _c.getText(), parameters: [], returnType: (_d = node.type) === null || _d === void 0 ? void 0 : _d.getText(), returnTypeInferred: ((_e = node.type) === null || _e === void 0 ? void 0 : _e.getText()) || "any", functionBody: [], prototype: { constructor: ((_f = node.name) === null || _f === void 0 ? void 0 : _f.getText()) || "" }, typeModifier: isAsync && isGenerator ? "async-generic" : isAsync ? "async" : isGenerator ? "generic" : undefined });
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
        // 处理类声明的具体逻辑
        nodeInfo.statementType = "ClassDeclaration";
        nodeInfo.name = (_a = node.name) === null || _a === void 0 ? void 0 : _a.getText();
        nodeInfo.methods = [];
        nodeInfo.properties = [];
        nodeInfo.children = [];
    };
    scriptParser.prototype.processFunctionDeclaration = function (node, nodeInfo) {
        var _a, _b;
        // 处理函数声明的具体逻辑
        nodeInfo.statementType = "FunctionDeclaration";
        nodeInfo.name = (_a = node.name) === null || _a === void 0 ? void 0 : _a.getText();
        nodeInfo.parameters = [];
        nodeInfo.returnType = (_b = node.type) === null || _b === void 0 ? void 0 : _b.getText();
    };
    scriptParser.prototype.buildNodeMap = function (node, idMap, scopeHierarchy, currentScope) {
        var _this = this;
        var id = this.generateNodeId(node);
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
            var id = _this.generateNodeId(node);
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
        return {
            path: this.getNodePath(node),
            name: ts.isIdentifier(node) ? node.text : undefined,
            type: ts.SyntaxKind[node.kind],
            object: this.createBaseStatement(node),
        };
    };
    scriptParser.prototype.createBaseStatement = function (node) {
        return {
            id: this.generateNodeId(node),
            path: this.getNodePath(node),
            location: { start: node.getStart(), end: node.getEnd() },
            statementType: ts.SyntaxKind[node.kind],
        };
    };
    scriptParser.prototype.generateNodeId = function (node) {
        return "".concat(node.pos, "-").concat(node.end);
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
    fs.writeFileSync(outDir, JSON.stringify(result, null, 2));
    console.log("\u5206\u6790\u7ED3\u679C\u5DF2\u4FDD\u5B58\u5230 ".concat(outDir));
}
if (require.main === module)
    cli();
