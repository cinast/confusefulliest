import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

("use strict");

const parser_version = "0.0.0";

// 支持的扩展名类型
const JSFileType = ["js"];
const TSFileType = ["ts"];

/** 数组子集 */
type SubArrayOf<T extends any[]> = T extends [infer First, ...infer Rest] ? SubArrayOf<Rest> | [First, ...SubArrayOf<Rest>] : [];
/**  数组非空子集 */
type NonEmptySubArrayOf<T extends any[]> = Exclude<SubArrayOf<T>, []>;
/**
 * 我希望有一天能用<...args extends any[][]>
 */
type ItemIn<T extends any[]> = T[number];

type OverRide<T, K extends keyof T, V> = Omit<T, K> & { [P in K]: V };
type MakeAny<T, K extends keyof T, partially = false> = Omit<T, K> & partially extends false
    ? { [P in K]: any }
    : { [P in K]?: any };

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
export let idMap: Map<string, BaseStatement> = new Map();

export type NestedObject<K extends string | number | symbol, V> = {
    [key in K]: V | NestedObject<K, V>;
};
export type NestedList<K extends string | number | symbol, V> = Array<V | NestedList<K, V>>;
/**
 * 魔改Typescript-ASt的抽象语法树
 * 但是考虑的不用像原版那么多
 * @see index.ts :14-126
 */
export interface AnalyzedJSON {
    AnalyzedAST: {
        // imports: {
        //     id: string;
        //     name: string;
        //     alias?: string;
        // }[];
        // exports: {
        //     id: string;
        //     name: string;
        //     alias?: string;
        // }[];
        statements: BaseStatement[];
        structureOutline: NestedList<string, string>;

        // 所有解析的语法元素的平面索引
        idMap: Record<
            string,
            {
                /** 在自定义的ast中的路径 */
                path: string;
                name: string;
                type?: string;
                object: BaseStatement;
                loc: { start: number; end: number };
            }
        >;
    };

    StandardAST: Pick<ts.SourceFile, "statements"> & {
        /** 所有标准语法树的元素 */
        syntaxUnits: Record<string, { node: ts.Node & { id: string }; id: string; path: string }>;
        /** @see structureOutline */
        statements: NestedList<string, string>;
        __originalTypeInfo?: Record<string, ts.Type>;
    };

    compilerMetadata: {
        fileName: string;
        /**
         * 使用的tsconfig
         */
        tsconfig: {
            fileName: string;
            options: ts.CompilerOptions;
            compilerVersion: string;
        };
    };

    Metadata: {
        parseInfo: {
            parserVersion: string;
            parserPath: string;
            timeCost: number;
            memoryUsage: number;
            nodeCount: number;
            identifierCount: number;
        };
        sourceInfo: {
            targetPath: string;
            fileSize: number;
            loc: {
                total: number;
                code: number;
                comment: number;
                empty?: number; // 空行统计
            };
            hash: string;
            encoding?: string; // 文件编码
            lineEndings: "LF" | "CRLF"; // 换行符类型
        };
        output_logs: string;
    };
}

/**
 * 基本语句类型所必需的基础信息
 */
/** 基础语句类型必需的信息 */
export interface BaseStatement {
    /**
     * @see idMap
     */
    id: string;
    /** 路径信息 */
    path: string;
    /** 代码位置 */
    location: {
        start: number;
        end: number;
    };
    statementType: string;
    /** 子节点 */
    children?: BaseStatement[];
}

// 沿用 Declaration和 Statement 两大分类
/** 声明类型的基础接口 */
export interface Declaration extends BaseStatement {
    /** 声明类型标识 */
    statementType: string;
    /** 声明名称 */
    name?: string;
    /** 注释信息 */
    comments?: CommentsInfo[];
    /** 访问控制修饰符 */
    accessControl?: "public" | "private" | "protected";
    /** 定义行为修饰符 */
    behaviors?: NonEmptySubArrayOf<["static", "abstract", "readonly"]>;
    /** 是否为环境声明 */
    isAmbient?: boolean;
    /** 是否为覆盖声明 */
    isOverride?: boolean;
    /** 装饰器文本 */
    decorators?: string[];
}

/** 变量声明接口 */
export interface VariableDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "VariableDeclaration";
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 定义修饰符 */
    definingModifier: "const" | "let" | "var";
    /** 变量对象 */
    objects: Array<{
        name: string;
        type?: string;
        typeInferred: string;
        value: string;
    }>;
    /** 值作用域 */
    valueScope: string;
}

/** 函数声明接口 */
export interface FunctionDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "FunctionDeclaration";
    /** 装饰器 */
    decorators?: string[];
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 类型修饰符 */
    typeModifier?: "async" | "generic" | "async-generic";
    /** 参数列表 */
    parameters?: SingleParameterDeclaration[];
    /** 类型参数列表 */
    typeParameters?: SingleTypeParameterDeclaration[];
    /** 返回类型 */
    returnType?: string;
    /** 推断的返回类型 */
    returnTypeInferred: string;
    /** return语句 */
    returnCases?: Statement[];
    /** yield语句 */
    yieldCases?: Statement[];
    /** 函数体 */
    functionBody: Statement[];
    /** this作用域 */
    thisScope?: string;
    /** 原型信息 */
    prototype: {
        constructor?: string;
        __proto__?: string;
    };
    /** 重载列表 */
    overloads?: string[];
}

/** 单个参数声明接口 */
export interface SingleParameterDeclaration extends Declaration {
    /** 装饰器 */
    decorators?: string[];
    /** 参数类型 */
    type?: string;
    /** 推断的类型 */
    typeInferred: string;
    /** 修饰符 */
    modifiers?: NonEmptySubArrayOf<["readonly", ItemIn<["?", "="]>]> | ["..."];
    /** 默认值 */
    default?: string;
}

/** 类型函数声明接口 */
export interface TypeFunctionDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "TypeFunctionDeclaration";
    /** 无装饰器 */
    decorators: never;
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 类型参数列表 */
    typeParameters: SingleTypeParameterDeclaration[];
    /** 返回类型 */
    returnType: string;
    /** 推断的返回类型 */
    returnTypeInferred: string;
    /** 重载列表 */
    overloads?: string[];
}

/** 单个类型参数声明接口 */
export interface SingleTypeParameterDeclaration extends Declaration {
    /** 无装饰器 */
    decorators: never;
    /** 修饰符 */
    modifiers?: NonEmptySubArrayOf<["="]>;
    /** 类型扩展 */
    typeExtends?: string;
    /** 推断的类型 */
    typeTypeInferred: string;
    /** 默认类型 */
    default?: string;
}

/**
 *         ↓keyword ↓typeParameters
 * export type T   <a> = Record<str,a> ←typeValue
 * ^modifier   ^typeName
 */
/** 类型别名声明接口 */
export interface TypeAliasDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "TypeAliasDeclaration";
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 类型名称 */
    typeName: string;
    /** 类型值 */
    typeValue: string;
}

/** 接口声明接口 */
export interface InterfaceDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "InterfaceDeclaration";
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 属性列表 */
    properties: PropertyDeclaration[];
}

/** 枚举声明接口 */
export interface EnumDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "EnumDeclaration";
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 成员列表 */
    members: string[];
}

/**
 * 因为内部下一级结构简单，采用大纲式解析
 */
/** 类声明接口 */
export interface ClassDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "ClassDeclaration";
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 定义修饰符 */
    definingModifier: NonEmptySubArrayOf<["abstract"]>;
    /** 继承的类 */
    extends?: string;
    /** 实现的接口 */
    implements: string[];
    /** 方法列表 */
    methods: MethodDeclaration[];
    /** 属性列表 */
    properties: PropertyDeclaration[];
    /** 子元素列表 */
    children: Array<
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration
        | TypeFunctionDeclaration
        | VariableDeclaration
    >;
    /** 原型信息 */
    prototype: { constructor: string; __proto__?: string };
}

// accessModifier 是有关于这个属性或者方法如何被外部使用的关键字集合
// definingModifier 则是关于这个属性或者方法它的性质的关键字
// static 我觉得他是决定属性在类对象还是实例对象上的关键字，我列入了 accessModifier
// declare 他只是说别的文件能不能直接引用这个属性/对象，并没有改变这个属性/对象是怎么样的，我列入了 accessModifier
// accessor 。。。难绷

/** 属性声明接口 */
export interface PropertyDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "PropertyDeclaration";
    /** 装饰器 */
    decorators?: string[];
    /** 定义修饰符 */
    definingModifier?: Array<"accessor" | "get" | "set">;
    /** 属性类型 */
    type?: string;
    /** 推断的类型 */
    typeInferred: string;
    /** 属性值 */
    value: string;
}

/** 方法声明接口 */
export interface MethodDeclaration extends MakeAny<FunctionDeclaration, "accessModifier", true> {
    /** 声明类型标识 */
    statementType: "MethodDeclaration";
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "override", "public", "private", "protected", "static"]>;
    /** 定义修饰符 */
    definingModifier: NonEmptySubArrayOf<["get", "set", "constructor"]>;
}

/** 命名空间声明接口 */
export interface NamespaceDeclaration extends Declaration {
    /** 声明类型标识 */
    statementType: "NamespaceDeclaration";
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 子元素列表 */
    children: Array<
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration
        | TypeFunctionDeclaration
        | VariableDeclaration
    >;
    /** 语句列表 */
    statements: Statement[];
}

/** 语句基础接口 */
export interface Statement extends BaseStatement {
    /** 语句类型 */
    type: string;
}

/** 循环语句基础接口 */
export interface LoopStatement extends Statement {
    /** break语句 */
    breaks: string[];
    /** continue语句 */
    continues: string[];
}

/** 表达式持有者接口 */
export interface ExpressionHolder extends Statement {
    /** 表达式 */
    expression: string;
}

/**
 * single statement lead by `if()` \
 * processing `if`statement and `else` or `else if` nextly as a `if`chain \
 * easier processing logic
 */
/** if语句接口 */
export interface IfStatement extends Statement {
    /** 语句类型 */
    statementType: "IfStatement";
    /** if链 */
    Chain: Array<{
        /** 索引 */
        index: number;
        /** 条件表达式 */
        condition?: string;
        /** 语句体 */
        body: Statement[];
    }>;
}

/**
 * @see-also IfStatement
 * similar logic, but diff properties
 */
/** switch语句接口 */
export interface switchStatement extends Statement {
    /** 语句类型 */
    statementType: "switchStatement";
    /** switch表达式 */
    switch: string;
    /** case列表 */
    cases: Array<{
        /** 索引 */
        index: number;
        /** 匹配值 */
        match: string;
        /** 语句体 */
        body: Statement[];
    }>;
}

/**
 * @notice `catches` is the `e` of `catch(e)`
 */
/** try语句接口 */
export interface tryStatement extends Statement {
    /** 语句类型 */
    statementType: "tryStatement";
    /** try块 */
    try: Statement[];
    /** catch参数 */
    catches: string;
    /** catch块 */
    catch: Statement[];
    /** finally块 */
    finally: Statement[];
}

/** debugger语句接口 */
export interface DebuggerStatement extends Statement {
    /** 语句类型 */
    statementType: "DebuggerStatement";
}

/** delete语句接口 */
export interface DeleteStatement extends ExpressionHolder {
    /** 语句类型 */
    statementType: "DeleteStatement";
}

/** with语句接口 */
export interface WithStatement extends ExpressionHolder {
    /** 语句类型 */
    statementType: "WithStatement";
    /** 语句体 */
    body: Statement[];
}

/** while语句接口 */
export interface WhileStatement extends LoopStatement {
    /** 语句类型 */
    statementType: "whileStatement" | "doWhileStatement";
    /** 语句体 */
    body: Array<Statement | "break" | "continue">;
    /** 条件表达式 */
    condition: string;
}

export interface ForStatement extends LoopStatement {
    /** 循环类型标识 */
    statementType: "forStatement" | "forInStatement" | "forOfStatement";
    /** 初始化表达式 */
    initializer?: string;
    /** 循环条件表达式 */
    condition?: string;
    /** 迭代表达式 */
    increment?: string;
    /** 可迭代对象 */
    iterableObject?: string;
    /** 循环体语句数组 */
    body: Array<Statement | "break" | "continue">;
}

export interface WithStatement extends Statement {
    statementType: "WithStatement";
    string: string;
    body: Statement[];
}
/** 模块声明接口 */
export interface ModuleDeclaration extends Declaration {
    /** 语句类型 */
    statementType: "ModuleDeclaration";
    /** 模块名称 */
    name: string;
    /** 模块体 */
    body: Statement[];
}

/** using语句接口 */
export interface UsingStatement extends Statement {
    /** 语句类型 */
    statementType: "UsingStatement";
    /** 声明列表 */
    declarations: VariableDeclaration[];
    /** 语句体 */
    body: Statement[];
}

/**
 * @deprecated
 * 搁置，勿用
 */
/** 表达式接口 */
export interface Expression extends BaseStatement {}

/**
 * debugger throw这些开发用的特殊语句
 */
/** 开发用特殊语句接口 */
export interface devTokens extends BaseStatement {}

/** 注释信息接口 */
export interface CommentsInfo extends BaseStatement {
    /**
     * 注释类型
     * normal `//` `/*`
     * jsDoc `/**`
     * Compile `///`
     */
    type: "normal" | "jsDoc" | "Compile";
    /** 注释内容 */
    content: string;
    /** 装饰目标 */
    decorateTo?: string;
}

// cli tool
function logWithTimestamp(message: string) {
    const now = new Date();
    console.log(`[${now.toISOString()}] ${message}`);
}

function measurePerformance<T>(name: string, fn: () => T): T {
    const start = process.hrtime.bigint();
    const result = fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6;
    logWithTimestamp(`⏱️ ${name} took ${duration.toFixed(2)}ms`);
    return result;
}

// cli debugging
const debugUtils = {
    logAST: (node: ts.Node, depth = 0) => {
        const indent = "  ".repeat(depth);
        console.log(`${indent}${ts.SyntaxKind[node.kind]}`);
        ts.forEachChild(node, (child) => debugUtils.logAST(child, depth + 1));
    },

    printNodeInfo: (node: ts.Node) => {
        const sourceFile = node.getSourceFile();
        const text = sourceFile?.getFullText() || "";
        const start = node.getStart();
        const end = node.getEnd();

        console.log(`Node kind: ${ts.SyntaxKind[node.kind]}`);
        console.log(`Text: ${text.substring(start, end)}`);
        console.log(`Location: ${start}-${end}`);
    },

    dumpStructure: (structure: AnalyzedJSON) => {
        console.log(JSON.stringify(structure, null, 2));
    },

    findNodeByPosition: (sourceFile: ts.SourceFile, position: number) => {
        let foundNode: ts.Node | undefined;

        function findNode(node: ts.Node) {
            if (node.getStart() <= position && node.getEnd() >= position) {
                foundNode = node;
                ts.forEachChild(node, findNode);
            }
        }

        ts.forEachChild(sourceFile, findNode);
        return foundNode;
    },
};

export class scriptParser {
    private readonly compilerOptions: ts.CompilerOptions;
    private readonly typeChecker: ts.TypeChecker;
    private readonly shouldBuildOutline: boolean;
    private readonly skipTypeCheck: boolean;
    private currentSourceFile: ts.SourceFile | null = null;

    constructor(
        tsconfigPath: string,
        options: {
            buildOutline?: boolean;
            skipTypeCheck?: boolean;
            experimentalSyntax?: "strict" | "loose";
        } = {}
    ) {
        const { buildOutline = false, skipTypeCheck = true, experimentalSyntax = "strict" } = options;
        const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
        this.compilerOptions = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath)).options;
        const program = ts.createProgram([], this.compilerOptions);
        this.typeChecker = program.getTypeChecker();
        this.shouldBuildOutline = buildOutline;
        this.skipTypeCheck = skipTypeCheck;
    }

    public parse(sourceFile: ts.SourceFile): AnalyzedJSON {
        this.currentSourceFile = sourceFile;
        const idMap: Record<string, any> = {};
        const scopeHierarchy: NestedList<string, string> = [];
        let currentScope: string[] = [];
        const declarations: Declaration[] = [];

        const visitor = (node: ts.Node) => {
            const sourceFile = this.currentSourceFile!;

            if (this.isDeclaration(node)) {
                const declaration = this.processDeclarationNode(node);
                declarations.push(declaration);
            }

            const id = randomUUID();
            const nodeInfo = this.extractNodeInfo(node);

            idMap[id] = {
                ...nodeInfo,
                loc: {
                    start: node.getStart(sourceFile),
                    end: node.getEnd(),
                },
            };

            if (ts.isBlock(node) || ts.isFunctionLike(node)) {
                const prevScope = [...currentScope];
                currentScope.push(id);
                scopeHierarchy.push([...currentScope]);
                ts.forEachChild(node, visitor);
                currentScope = prevScope;
            } else {
                ts.forEachChild(node, visitor);
            }
        };

        ts.forEachChild(sourceFile, visitor);

        const analyzedAST = {
            statements: this.collectGlobalStatements(sourceFile),
            ScopTree: scopeHierarchy,
            idMap,
        };

        const compilerMetadata = {
            fileName: sourceFile.fileName,
            tsconfig: {
                ...this.getTsConfig(),
                compilerVersion: ts.version,
            },
        };

        const metadata = this.generateMetadata(sourceFile);

        this.currentSourceFile = null;

        const originalSourceFile = delete { ...(sourceFile as any) }.statements as unknown as Pick<ts.SourceFile, "statements">;
        // 转换StandardAST结构
        const standardAST: AnalyzedJSON["StandardAST"] = {
            ...originalSourceFile,
            syntaxUnits: {},
            /**
             * ts 是谁说了算？你觉得他是ts.NodeArray<ts.Statement>就是ts.NodeArray<ts.Statement>？
             * 他分明是NestedList<string, string>！
             */
            ///@ts-ignore
            statements: this.buildNestedStatements(sourceFile),
            __originalTypeInfo: {},
        };

        // 构建syntaxUnits映射
        const nodeIdMap = new Map<ts.Node, string>();
        ts.forEachChild(sourceFile, (node) => {
            const id = randomUUID();
            nodeIdMap.set(node, id);
            standardAST.syntaxUnits[id] = {
                node: {
                    ...node,
                    id,
                },
                id,
                path: this.getNodePath(node),
            };
        });

        // 补全AnalyzedAST结构
        const fullAnalyzedAST = {
            ...analyzedAST,
            structureOutline: analyzedAST.ScopTree || [],
        };

        return {
            AnalyzedAST: fullAnalyzedAST,
            StandardAST: standardAST,
            compilerMetadata: compilerMetadata,
            Metadata: metadata,
        } as AnalyzedJSON;
    }

    private buildNestedStatements(sourceFile: ts.SourceFile): NestedList<string, string> {
        const result: NestedList<string, string> = [];
        const stack: Array<{ id: string; children: NestedList<string, string> }> = [];

        const visit = (node: ts.Node) => {
            const id = randomUUID();
            const current: NestedList<string, string> = [id];

            // 检查当前节点是否应该开启新作用域
            if (ts.isBlock(node) || ts.isFunctionLike(node) || ts.isClassLike(node)) {
                stack.push({ id, children: [] });
            }

            // 如果栈中有父节点，添加到父节点的子集
            if (stack.length > 0) {
                const parent = stack[stack.length - 1];
                parent.children.push(current);
            } else {
                result.push(current);
            }

            // 递归处理子节点
            ts.forEachChild(node, visit);

            // 结束作用域处理
            if ((ts.isBlock(node) || ts.isFunctionLike(node) || ts.isClassLike(node)) && stack.length > 0) {
                const completed = stack.pop()!;
                // 将子节点添加到当前节点
                if (completed.children.length > 0) {
                    current.push(completed.children);
                }
            }
        };
        ts.forEachChild(sourceFile, visit);
        return result;
    }

    private buildNodeMap(
        node: ts.Node,
        idMap: Record<string, any>,
        scopeHierarchy: NestedList<string, string>,
        currentScope: string[]
    ) {
        const id = randomUUID();
        const nodeInfo = this.extractNodeInfo(node);

        idMap[id] = {
            ...nodeInfo,
            loc: { start: node.getStart(), end: node.getEnd() },
        };

        // 处理作用域变化
        if (ts.isBlock(node) || ts.isFunctionDeclaration(node)) {
            const prevScope = [...currentScope];
            currentScope.push(id);
            scopeHierarchy.push([...currentScope]);
            ts.forEachChild(node, (child) => this.buildNodeMap(child, idMap, scopeHierarchy, currentScope));
            currentScope = prevScope;
        } else {
            ts.forEachChild(node, (child) => this.buildNodeMap(child, idMap, scopeHierarchy, currentScope));
        }
    }

    private isDeclaration(node: ts.Node): boolean {
        return (
            ts.isVariableStatement(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node)
            // ts.isDeclarationStatement(node)
        );
    }

    private processDeclarationNode(node: ts.Node): Declaration {
        const sourceFile = this.currentSourceFile!;
        const base: BaseStatement = {
            id: randomUUID(),
            path: this.getNodePath(node),
            location: {
                start: node.getStart(sourceFile),
                end: node.getEnd(),
            },
            statementType: ts.SyntaxKind[node.kind],
        };

        if (ts.isClassDeclaration(node)) {
            const modifiers = ts.getModifiers(node) || [];
            const hasAbstract = modifiers.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword);

            return {
                ...base,
                statementType: "ClassDeclaration",
                name: this.getNodeText(node.name, sourceFile),
                methods: [],
                properties: [],
                children: [],
                definingModifier: hasAbstract ? ["abstract"] : [],
                implements: [],
                prototype: { constructor: base.id || "" },
            } as ClassDeclaration;
        } else if (ts.isFunctionDeclaration(node)) {
            const modifiers = ts.getModifiers(node) || [];
            const isAsync = modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
            const isGenerator = node.asteriskToken !== undefined;

            return {
                ...base,
                statementType: "FunctionDeclaration",
                name: this.getNodeText(node.name, sourceFile),
                parameters: [],
                returnType: node.type?.getText(sourceFile),
                returnTypeInferred: node.type?.getText(sourceFile) || "any",
                functionBody: [],
                prototype: { constructor: node.name?.escapedText.toString() || "" },
                typeModifier: isAsync && isGenerator ? "async-generic" : isAsync ? "async" : isGenerator ? "generic" : undefined,
            } as FunctionDeclaration;
        }
        // 其他Declaration类型的处理...
        return base as Declaration;
    }

    private extractNodeInfo(node: ts.Node) {
        const sourceFile = this.currentSourceFile!;
        let start = 0;
        let end = 0;

        try {
            start = node.getStart(sourceFile);
            end = node.getEnd();
        } catch (e) {
            start = node.pos;
            end = node.end;
        }

        return {
            path: this.getNodePath(node),
            name: ts.isIdentifier(node) ? node.text : undefined,
            type: ts.SyntaxKind[node.kind],
            object: {
                id: randomUUID(),
                path: this.getNodePath(node),
                location: { start, end },
                statementType: ts.SyntaxKind[node.kind],
            },
        };
    }

    private createBaseStatement(node: ts.Node): BaseStatement {
        const sourceFile = this.currentSourceFile!;
        let start = 0;
        let end = 0;

        try {
            start = node.getStart(sourceFile);
            end = node.getEnd();
        } catch (e: unknown) {
            const error = e as Error;
            console.warn(`Failed to get node position (${ts.SyntaxKind[node.kind]}): ${error.message}`);
            console.warn(`Falling back to node.pos/end for node: ${node.getText(sourceFile).slice(0, 50)}...`);
            start = node.pos;
            end = node.end;
        }

        return {
            id: randomUUID(),
            path: this.getNodePath(node),
            location: { start, end },
            statementType: ts.SyntaxKind[node.kind],
        };
    }

    private getNodeText(node: any, sourceFile: ts.SourceFile): string {
        if (!node) return "";

        // 优先使用getText方法
        if (ts.isFunctionDeclaration(node)) {
            return node.getText(sourceFile);
        }
        // 处理各种AST节点类型
        if (ts.isIdentifier(node)) {
            return node.escapedText.toString();
        }
        if (ts.isStringLiteral(node)) {
            return node.text;
        }
        if (ts.isNumericLiteral(node)) {
            return node.text;
        }
        if (ts.isTemplateLiteral(node)) {
            return node.getText(sourceFile);
        }
        if (ts.isPropertyAccessExpression(node)) {
            return `${this.getNodeText(node.expression, sourceFile)}.${node.name.text}`;
        }
        if (ts.isElementAccessExpression(node)) {
            return `${this.getNodeText(node.expression, sourceFile)}[${this.getNodeText(node.argumentExpression, sourceFile)}]`;
        }
        if (ts.isCallExpression(node)) {
            return `${this.getNodeText(node.expression, sourceFile)}(${node.arguments
                .map((arg) => this.getNodeText(arg, sourceFile))
                .join(", ")})`;
        }
        // 回退到escapedText
        if (node.escapedText) {
            return node.escapedText;
        }
        // 处理其他特殊情况
        if (node.kind === ts.SyntaxKind.ThisKeyword) {
            return "this";
        }
        if (node.kind === ts.SyntaxKind.SuperKeyword) {
            return "super";
        }
        return "";
    }

    private getNodePath(node: ts.Node): string {
        // 实现获取节点路径的逻辑
        return "";
    }

    private isGlobalStatement(node: ts.Node): boolean {
        return (
            ts.isVariableStatement(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isModuleDeclaration(node)
        );
    }

    private collectGlobalStatements(sourceFile: ts.SourceFile): BaseStatement[] {
        const prevSourceFile = this.currentSourceFile;
        this.currentSourceFile = sourceFile;

        const statements: BaseStatement[] = [];

        ts.transform(sourceFile, [
            (context) => {
                const visit = (node: ts.Node): ts.Node => {
                    if (this.isGlobalStatement(node)) {
                        const baseStatement = this.createBaseStatement(node);
                        this.processChildren(node, baseStatement);
                        statements.push(baseStatement);
                    }
                    return ts.visitEachChild(node, visit, context);
                };
                return visit;
            },
        ]);

        this.currentSourceFile = prevSourceFile;
        return statements;
    }

    private processChildren(node: ts.Node, parentStatement: BaseStatement) {
        ts.forEachChild(node, (child) => {
            const childStatement = this.createBaseStatement(child);
            if (!parentStatement.children) {
                parentStatement.children = [];
            }
            parentStatement.children.push(childStatement);
            this.processChildren(child, childStatement);
        });
    }

    private generateMetadata(sourceFile: ts.SourceFile) {
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
                lineEndings: "LF" as const,
            },
            output_logs: "",
        };
    }

    private getTsConfig(): {
        fileName: string;
        options: ts.CompilerOptions;
        compilerVersion: string;
    } {
        // 返回当前使用的tsconfig简化信息
        return {
            fileName: "tsconfig.json",
            options: this.compilerOptions,
            compilerVersion: ts.version,
        };
    }
}

function cli() {
    const args = require("minimist")(process.argv.slice(2));
    const filePath = args._[0];
    const outDir = args._[1] ?? "tmp/analyzed.json";
    const buildOutline = args["build-outline"] || false;
    const skipTypeCheck = args["skip-type-check"] !== false;
    const experimentalSyntax = args["experimental-syntax"] || "strict";

    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }

    const parser = new scriptParser("tsconfig.json", {
        buildOutline,
        skipTypeCheck,
        experimentalSyntax,
    });
    const program = ts.createProgram([filePath], {});
    const sourceFile = program.getSourceFile(filePath);

    if (!sourceFile) {
        console.error(`无法解析文件: ${filePath}`);
        process.exit(1);
    }

    const result = measurePerformance("parsing took:", () => parser.parse(sourceFile));
    console.clear();
    console.log(result);

    fs.writeFileSync(outDir, JSON.stringify(result, null, 2));
    console.log(`分析结果已保存到 ${outDir}`);
}

if (require.main === module) cli();
