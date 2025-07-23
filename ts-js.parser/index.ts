import * as ts from "typescript";
import * as fs from "fs";
import { randomUUID } from "crypto";

("use strict");

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
 * 新的AST逻辑（概念更新）：
 * 大部分沿用原逻辑，e只针对需求优化了含有关键字的部分，还有少量涉及
 * 如逻辑流（if-elif-else、try-catch-finally、switch-case-default、for、(do)-while等等等）
 * 及其辅助控制逻辑流的continue、break等
 * 如定义（实值/类型，含匿名）（var/let/const、class、function、interface、type）
 * 如特殊功能用的 throw、debugger等
 * 用以一个大纲模式列出
 *
 * 因为这类语句写法上很规整，有鲜明的特征
 * 可以化简语法树末端
 *
 * 注：以下只是部分示例，完全部分请见interfaces
 * export  class  cls {
 * ^访问修饰 ^主词  ^符号
 *
 *    declaration[classDeclaration]  >
 *    |     accessModifier ["export"]
 *    |     name cls
 *    |     statements statement[]
 *    |     elements ... (Array<cls,enum,variable,method,function,...>)
 *    |     prototype: { constructor: string; __proto__?: string };
 *    — — —
 *
 *
 *       @some_rule
 *       @will(n)  ← 修饰器    ↓修饰符  ↓符号index[type:T]
 *       static public function*   DO  (index:T, ...args){ ⇤ 函数体
 *       ^访问修饰  ^修饰词  ^主词    ^符号⇤    参数域     ⇥
 *    cls.statements[1] (functionDeclaration)  >
 *    |     accessModifier ['static','public']
 *    |     name DO
 *    |     functionType ['generic']
 *    |     params [
 *    |             1 param >
 *    |                 name "index"
 *    |                 type T (a symbol also)
 *    |
 *    |             2  param >
 *    |                 name  "args"
 *    |                 type any[] (ts inferred)
 *    |             ]
 *    |     decorators [
 *    |             1  decorator(single) > name "some_rule"
 *    |             2  decorator(call string) >
 *    |                    name will
 *    |                    param x
 *    |                ]
 *    |     functionBody (or statements) [ ↓
 *    ↓ *return & yield case see down*
 *
 *       /** *\/               ← z.jsdoc **cls.statements[1].functionBody[1]**
 *      declare const obj,    ← z：符号obj | {}：宾语(Object)
 *      ^访问修饰  ^主词&修饰词
 *      numb,
 *      {key, v} =
 *      {}, 0, {a:"that",b:"is"}
 *
 *    cls.statements[1].functionBody[2] (variable string)  >
 *    |    modifier ["declare","const"] //有些修饰词的语义是处于灰色部分的，难分，不如放一起
 *    |    objects (strings)[ // 适应解构模式
 *    |             1 object >
 *    |                 name  obj
 *    |                 value  {}
 *    |                 type {} (ts inferred)
 *    |                 statement {name:`obj`,value:`{}`,type:never（因为没写）}
 *    |
 *    |             2 object >
 *    |                 name key
 *    |                 value "that"
 *    |                 type string (inferred)
 *    |                 statement {name:`{key,value}`,value:`{a:"that",b:"is"}`,type:never（因为没写）}
 *    |
 *    |             3 object >
 *    |                 name v
 *    |                 value "is"
 *    |                 type string (inferred)
 *    |                 statement {name:`{key,value}`,value:`{a:"that",b:"is"}`,type:never（因为没写）}
 *    |
 *    — — — —
 *
 *    type Y<@dec<> a,b = Number> = a + b
 *
 *    cls.statements[1].functionBody[3] (TypeAlias Declaration)  >
 *    |    name Y
 *    |    param [
 *    |         1 a >
 *    |             name a
 *    |             type any (ts inferred)
 *    |             decorator [`@dec<>`]
 *    |         2 b >
 *    |             name b
 *    |             type any (ts inferred)
 *    |             default `Int`
 *    |         ]
 *    |    value `a + b`
 *    — — — —
 *
 *            ↓ if_case[1].condition
 *     ⤒   if (approached) { if_case[1].condition                              ——
 *     |      return "YES" ← DO.returnCase[1]                                  ⇕ if_case[2]
 *   if|   } else if(...){ ← if_case[2].condition                              ——
 *state|      yield newErr(...) ← DO.yieldCase[1]                              ⇕ if_case[2]
 *-ment⤓   }
 *          ↑ if_case.last_one.condition: undefined|{...} ——
 *
 *         return ... ← DO.returnCase[2]
 *
 *    cls.statements[1].functionBody[4] (if statement)  >
 *    |    if cases [
 *    |             1 if >
 *    |                 condition  string
 *    |                 body  Statement[] >
 *    |                         1 returnStatement >
 *    |                                       Statement
 *    |             2 else-if >
 *    |                 condition string
 *    |                 body  Statement[] >
 *    |                         1 yieldStatement >
 *    |                                       Statement
 *    |             ]
 *    — — — —
 *
 *    cls.statements[1].functionBody[5] (returnStatement)
 *    | return ...
 *  ————《转世重生之我要当ts之父》
 */

/**
 * @notice
 * 约定俗成，
 * 一些有child（element）属性Declaration，其中的child是大纲，只列文字列表，展示其辖属元素
 * interface们的属性按照语法顺序写
 */
/**
 * 所有语法元素（非标准ast的）的平面id索引
 */
export let idMap: Map<string, BaseStatement> = new Map();

/**
 * 魔改Typescript-ASt的抽象语法树
 * 但是考虑的不用像原版那么多
 * @see index.ts :14-126
 */
export interface SourceFile {
    statements: BaseStatement[];
}

/**
 * 基本语句类型所必需的基础信息
 */
/** 基础语句类型必需的信息 */
interface BaseStatement {
    /** 唯一标识符 */
    id: string;
    /** 路径信息 */
    path: string[];
    /** 代码位置 */
    location: {
        start: number;
        end: number;
    };
}

// 沿用 Declaration和 Statement 两大分类
/** 声明类型的基础接口 */
interface Declaration extends BaseStatement {
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
interface VariableDeclaration extends Declaration {
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
interface FunctionDeclaration extends Declaration {
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
interface SingleParameterDeclaration extends Declaration {
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
interface TypeFunctionDeclaration extends Declaration {
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
interface SingleTypeParameterDeclaration extends Declaration {
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
interface TypeAliasDeclaration extends Declaration {
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 类型名称 */
    typeName: string;
    /** 类型值 */
    typeValue: string;
}

/** 接口声明接口 */
interface InterfaceDeclaration extends Declaration {
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 属性列表 */
    properties: PropertyDeclaration[];
}

/** 枚举声明接口 */
interface EnumDeclaration extends Declaration {
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    /** 成员列表 */
    members: string[];
}

/**
 * 因为内部下一级结构简单，采用大纲式解析
 */
/** 类声明接口 */
interface ClassDeclaration extends Declaration {
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
interface PropertyDeclaration extends Declaration {
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
interface MethodDeclaration extends MakeAny<FunctionDeclaration, "accessModifier", true> {
    /** 访问修饰符 */
    accessModifier?: NonEmptySubArrayOf<["declare", "override", "public", "private", "protected", "static"]>;
    /** 定义修饰符 */
    definingModifier: NonEmptySubArrayOf<["get", "set", "constructor"]>;
}

/** 命名空间声明接口 */
interface NamespaceDeclaration extends Declaration {
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
interface Statement extends BaseStatement {
    /** 语句类型 */
    type: string;
}

/** 循环语句基础接口 */
interface LoopStatement extends Statement {
    /** break语句 */
    breaks: string[];
    /** continue语句 */
    continues: string[];
}

/** 表达式持有者接口 */
interface ExpressionHolder extends Statement {
    /** 表达式 */
    expression: string;
}

/**
 * single statement lead by `if()` \
 * processing `if`statement and `else` or `else if` nextly as a `if`chain \
 * easier processing logic
 */
/** if语句接口 */
interface IfStatement extends Statement {
    /** 语句类型 */
    type: "IfStatement";
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
interface switchStatement extends Statement {
    /** 语句类型 */
    type: "switchStatement";
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
interface tryStatement extends Statement {
    /** 语句类型 */
    type: "tryStatement";
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
interface DebuggerStatement extends Statement {
    /** 语句类型 */
    type: "DebuggerStatement";
}

/** delete语句接口 */
interface DeleteStatement extends ExpressionHolder {
    /** 语句类型 */
    type: "DeleteStatement";
}

/** with语句接口 */
interface WithStatement extends ExpressionHolder {
    /** 语句类型 */
    type: "WithStatement";
    /** 语句体 */
    body: Statement[];
}

/** while语句接口 */
interface WhileStatement extends LoopStatement {
    /** 语句类型 */
    type: "whileStatement" | "doWhileStatement";
    /** 语句体 */
    body: Array<Statement | "break" | "continue">;
    /** 条件表达式 */
    condition: string;
}

interface ForStatement extends LoopStatement {
    /** 循环类型标识 */
    type: "forStatement" | "forInStatement" | "forOfStatement";
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

interface WithStatement extends Statement {
    type: "WithStatement";
    string: string;
    body: Statement[];
}
/** 模块声明接口 */
interface ModuleDeclaration extends Declaration {
    /** 语句类型 */
    type: "ModuleDeclaration";
    /** 模块名称 */
    name: string;
    /** 模块体 */
    body: Statement[];
}

/** using语句接口 */
interface UsingStatement extends Statement {
    /** 语句类型 */
    type: "UsingStatement";
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
interface Expression extends BaseStatement {}

/**
 * debugger throw这些开发用的特殊语句
 */
/** 开发用特殊语句接口 */
interface devTokens extends BaseStatement {}

/** 注释信息接口 */
interface CommentsInfo extends Omit<BaseStatement, "comments"> {
    /** 注释类型 */
    type: "normal" | "jsDoc" | "Compiling";
    /** 注释内容 */
    content: string;
    /** 装饰目标 */
    decorateTo?: string;
}

/*
 *  @WARNING
 *  @AI-STOP-POINT
 */
//
function getDebuggers() {
    return {
        logAST: (node: ts.Node, depth: number = 0) => {
            const indent = " ".repeat(depth * 2);
            console.log(`${indent}${ts.SyntaxKind[node.kind]}`);
            ts.forEachChild(node, (child) => getDebuggers().logAST(child, depth + 1));
        },

        printNodeInfo: (node: ts.Node) => {
            const sourceFile = node.getSourceFile();
            const text = sourceFile?.getFullText() || "";
            const start = node.getStart();
            const end = node.getEnd();

            console.log(`Node kind: ${ts.SyntaxKind[node.kind]}`);
            console.log(`Text: ${text.substring(start, end)}`);
            console.log(`Location: ${start}-${end}`);

            const comments = getComments(node);
            if (comments.leading?.length) {
                console.log("Leading comments:");
                comments.leading.forEach((c) => console.log(`  ${c}`));
            }
            if (comments.trailing?.length) {
                console.log("Trailing comments:");
                comments.trailing.forEach((c) => console.log(`  ${c}`));
            }
            if (comments.jsdoc) {
                console.log("JSDoc:");
                console.log(comments.jsdoc);
            }
        },

        dumpStructure: (structure: SourceFile) => {
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
}

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

function getComments(node: ts.Node) {
    if (!node || !node.getSourceFile) {
        return {
            leading: [],
            trailing: [],
            jsdoc: undefined,
        };
    }

    const sourceFile = node.getSourceFile();
    if (!sourceFile) {
        return {
            leading: [],
            trailing: [],
            jsdoc: undefined,
        };
    }

    const sourceText = sourceFile.getFullText();
    const leadingRanges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) || [];
    const trailingRanges = ts.getTrailingCommentRanges(sourceText, node.getEnd()) || [];
    const jsDoc = ts.getJSDocCommentsAndTags(node);

    return {
        leading: leadingRanges.map((r) => sourceText.substring(r.pos, r.end).trim()),
        trailing: trailingRanges.map((r) => sourceText.substring(r.pos, r.end).trim()),
        jsdoc: jsDoc.length ? jsDoc[0].getFullText().trim() : undefined,
    };
}

function getModifiers(node: ts.Node): string[] {
    if (!("modifiers" in node)) return [];
    const modifiers = (node as any).modifiers as ts.NodeArray<ts.ModifierLike> | undefined;
    if (!modifiers) return [];

    // 添加过滤：只处理真正的修饰符关键字（排除装饰器）
    const keywordModifiers = modifiers.filter((mod) => mod.kind !== ts.SyntaxKind.Decorator);

    return keywordModifiers.map((mod) => {
        return ts.SyntaxKind[mod.kind];
    });
}

// function getDecorators(node: ts.Node): string[] | undefined {
//     if (!"decorators" in node) return undefined;
//     const decorators = (node as any).decorators as ts.NodeArray<ts.Decorator> | undefined;
//     return decorators?.map((d) => d.getText());
// }

///@ts-ignore
function parseFile(filePath: string): SourceFile {
    //     if (!fs.existsSync(filePath)) {
    //         console.error(`文件不存在: ${filePath}`);
    //         process.exit(1);
    //     }
    //     const compilerOptions: ts.CompilerOptions = {
    //         target: ts.ScriptTarget.Latest,
    //         module: ts.ModuleKind.ESNext,
    //         allowJs: true,
    //         strict: false,
    //         skipLibCheck: true,
    //         experimentalDecorators: true,
    //     };
    //     const program = ts.createProgram([filePath], compilerOptions);
    //     const sourceFile = program.getSourceFile(filePath);
    //     const CodeStructure: CodeStructure = {
    //         imports: [],
    //         classes: [],
    //         interfaces: [],
    //         types: [],
    //         enums: [],
    //         functions: [],
    //         variables: [],
    //         namespaces: [],
    //     };
    //     if (!sourceFile) {
    //         console.error(`无法解析文件: ${filePath}`);
    //         process.exit(1);
    //     }
    //     // 定义上下文类型
    //     interface Context {
    //         parent?: string;
    //         path: string[];
    //     }
    //     const contextStack: Context[] = [];
    //     let currentContext: Context = { parent: undefined, path: [] };
    //     const visitNode = (node: ts.Node) => {
    //         if (!node) return;
    //         const id = randomUUID();
    //         const comments = getComments(node);
    //         const commentData = {
    //             leading: comments.leading.length ? comments.leading : undefined,
    //             trailing: comments.trailing.length ? comments.trailing : undefined,
    //             jsdoc: comments.jsdoc,
    //         };
    //         // 获取位置信息
    //         // const start = node.getStart();
    //         // const end = node.getEnd();
    //         // 处理导入语句
    //         if (ts.isImportDeclaration(node)) {
    //             const moduleSpecifier = node.moduleSpecifier.getText();
    //             CodeStructure.imports.push(moduleSpecifier.replace(/['"]/g, ""));
    //         }
    //         // 处理类定义
    //         else if (ts.isClassDeclaration(node) && node.name) {
    //             const heritage = node.heritageClauses || [];
    //             const extendsClause = heritage.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
    //             const implementsClause = heritage.find((h) => h.token === ts.SyntaxKind.ImplementsKeyword);
    //             const className = node?.name.text || `(anonymous class ${id})`;
    //             const classInfo: ClassInfo = {
    //                 name: className,
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, className],
    //                 methods: [],
    //                 properties: [],
    //                 children: [],
    //                 extends: extendsClause?.types.map((t) => t.getText()).join(", "),
    //                 implements: implementsClause?.types.map((t) => t.getText()) || [],
    //                 modifiers: getModifiers(node),
    //                 prototype: {
    //                     constructor: className,
    //                     __proto__: extendsClause?.types.map((t) => t.getText()).join(", ") || "Object.prototype",
    //                 },
    //                 comments: commentData,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 id: id,
    //             };
    //             // 进入类作用域
    //             contextStack.push(currentContext);
    //             currentContext = {
    //                 parent: className,
    //                 path: [...currentContext.path, className],
    //             };
    //             ts.forEachChild(node, visitNode);
    //             // 恢复上下文
    //             currentContext = contextStack.pop()!;
    //             CodeStructure.classes.push(classInfo);
    //         }
    //         // 处理方法定义
    //         else if (ts.isMethodDeclaration(node) && node.name) {
    //             const modifiers = getModifiers(node);
    //             const methodInfo: MethodInfo = {
    //                 name: node.name.getText(),
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, node.name.getText()],
    //                 modifiers,
    //                 parameters: [],
    //                 returnType: node.type?.getText() || "void",
    //                 typeParameters: node.typeParameters?.map((tp) => tp.getText()),
    //                 decorators: undefined,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 comments: commentData,
    //                 // 提取访问修饰符和定义修饰符
    //                 accessModifier: modifiers.filter((m) => ["public", "private", "protected", "readonly"].includes(m)) as any,
    //                 definingModifier: modifiers.filter((m) => ["static", "abstract", "get", "set", "constructor"].includes(m)) as any,
    //                 id: id,
    //             };
    //             node.parameters?.forEach((param) => {
    //                 if (ts.isParameter(param)) {
    //                     methodInfo.parameters.push({
    //                         name: param.name.getText(),
    //                         type: param.type?.getText() || "any",
    //                         modifiers: getModifiers(param),
    //                         decorators: undefined,
    //                     });
    //                 }
    //             });
    //             const parentClass = CodeStructure.classes.find((c) => c.name === currentContext.parent);
    //             if (parentClass) {
    //                 parentClass.methods.push(methodInfo);
    //                 parentClass.children.push(methodInfo);
    //             }
    //         }
    //         // 处理属性定义
    //         else if (ts.isPropertyDeclaration(node) && node.name) {
    //             const modifiers = getModifiers(node);
    //             const propInfo: PropertyInfo = {
    //                 name: node.name.getText(),
    //                 type: node.type?.getText() || "any",
    //                 decorators: undefined,
    //                 accessModifier: modifiers.filter((m) => ["public", "private", "protected", "readonly"].includes(m)) as any,
    //                 definingModifier: modifiers.filter((m) => ["static", "abstract", "accessor"].includes(m)) as any,
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, node.name.getText()],
    //                 comments: commentData,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 id: id,
    //             };
    //             const parentClass = CodeStructure.classes.find((c) => c.name === currentContext.parent);
    //             if (parentClass) {
    //                 parentClass.properties.push(propInfo);
    //                 parentClass.children.push(propInfo as any);
    //             }
    //         }
    //         // 处理接口定义
    //         else if (ts.isInterfaceDeclaration(node)) {
    //             const interfaceName = node?.name.text || `(anonymous interface ${id})`;
    //             const interfaceInfo: InterfaceInfo = {
    //                 name: interfaceName,
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, interfaceName],
    //                 properties: [],
    //                 modifiers: getModifiers(node),
    //                 comments: commentData,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 id: id,
    //             };
    //             // 进入接口作用域
    //             contextStack.push(currentContext);
    //             currentContext = {
    //                 parent: interfaceName,
    //                 path: [...currentContext.path, interfaceName],
    //             };
    //             ts.forEachChild(node, visitNode);
    //             // 恢复上下文
    //             currentContext = contextStack.pop()!;
    //             CodeStructure.interfaces.push(interfaceInfo);
    //         }
    //         // 处理类型别名
    //         else if (ts.isTypeAliasDeclaration(node)) {
    //             const typeAliasName = node?.name.text || `(anonymous type alias ${id})`;
    //             CodeStructure.types.push({
    //                 name: typeAliasName,
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, typeAliasName],
    //                 type: node.type.getText(),
    //                 typeParameters: node.typeParameters?.map((tp) => tp.getText()),
    //                 modifiers: getModifiers(node),
    //                 comments: commentData,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 id: id,
    //             });
    //         }
    //         // 处理枚举
    //         else if (ts.isEnumDeclaration(node)) {
    //             const enumName = node?.name.text || `(anonymous enum ${id})`;
    //             const enumInfo: EnumInfo = {
    //                 name: enumName,
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, enumName],
    //                 members: [],
    //                 modifiers: getModifiers(node),
    //                 comments: commentData,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 id: id,
    //             };
    //             node.members.forEach((member) => {
    //                 if (ts.isEnumMember(member) && member.name) {
    //                     enumInfo.members.push(member.name.getText());
    //                 }
    //             });
    //             CodeStructure.enums.push(enumInfo);
    //         }
    //         // 处理函数
    //         else if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionstring(node)) {
    //             const funcName = node.name?.text || `(anonymous function ${id})`;
    //             const modifiers = getModifiers(node);
    //             const funcInfo: FunctionInfo = {
    //                 name: funcName,
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, funcName],
    //                 modifiers,
    //                 parameters: [],
    //                 returnType: node.type?.getText() || "any",
    //                 typeParameters: node.typeParameters?.map((tp) => tp.getText()),
    //                 decorators: undefined,
    //                 comments: commentData,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 id: id,
    //             };
    //             node.parameters?.forEach((param) => {
    //                 if (ts.isParameter(param)) {
    //                     funcInfo.parameters.push({
    //                         name: param.name.getText(),
    //                         type: param.type?.getText() || "any",
    //                         modifiers: getModifiers(param),
    //                         decorators: undefined,
    //                     });
    //                 }
    //             });
    //             CodeStructure.functions.push(funcInfo);
    //         }
    //         // 处理变量声明
    //         else if (ts.isVariableStatement(node)) {
    //             const modifiers = getModifiers(node);
    //             node.declarationList.declarations.forEach((decl) => {
    //                 if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
    //                     const definingModifier =
    //                         node.declarationList.flags & ts.NodeFlags.Const
    //                             ? "const"
    //                             : node.declarationList.flags & ts.NodeFlags.Let
    //                             ? "let"
    //                             : "var";
    //                     const valueScope = currentContext.parent
    //                         ? "block"
    //                         : node.parent?.kind === ts.SyntaxKind.SourceFile
    //                         ? "global"
    //                         : "function";
    //                     CodeStructure.variables.push({
    //                         name: decl.name.text,
    //                         parent: currentContext.parent,
    //                         path: [...currentContext.path, decl.name.text],
    //                         type: decl.type?.getText() || "any",
    //                         definingModifier,
    //                         modifiers,
    //                         valueScope,
    //                         comments: commentData,
    //                         location: {
    //                             start: decl.getStart(),
    //                             end: decl.getEnd(),
    //                         },
    //                         id: id,
    //                     });
    //                 }
    //             });
    //         }
    //         // 处理命名空间
    //         else if (ts.isModuleDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
    //             const modifiers = getModifiers(node);
    //             const namespaceName = node?.name.text || `(anonymous namespace ${id})`;
    //             const namespaceInfo: NamespaceInfo = {
    //                 name: namespaceName,
    //                 parent: currentContext.parent,
    //                 path: [...currentContext.path, namespaceName],
    //                 children: [],
    //                 modifiers,
    //                 comments: commentData,
    //                 location: {
    //                     start: node.getStart(),
    //                     end: node.getEnd(),
    //                 },
    //                 id: id,
    //             };
    //             // 进入命名空间作用域
    //             contextStack.push(currentContext);
    //             currentContext = {
    //                 parent: namespaceName,
    //                 path: [...currentContext.path, namespaceName],
    //             };
    //             if (node.body && ts.isModuleBlock(node.body)) {
    //                 ts.forEachChild(node.body, visitNode);
    //             }
    //             // 恢复上下文
    //             currentContext = contextStack.pop()!;
    //             CodeStructure.namespaces.push(namespaceInfo);
    //         }
    //         // 递归处理子节点
    //         try {
    //             ts.forEachChild(node, visitNode);
    //         } catch (e) {
    //             const err = e as Error;
    //             console.error(`遍历子节点时出错: ${err.message}`);
    //         }
    //     };
    //     // 开始遍历AST
    //     measurePerformance("parseFile", () => {
    //         ts.forEachChild(sourceFile, visitNode);
    //     });
    //     return CodeStructure;
}

function cli() {
    const filePath = process.argv[2];
    const outDir = process.argv[3] ?? "tmp/analyzed.json";
    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }

    const result = parseFile(filePath);
    fs.writeFileSync(outDir, JSON.stringify(result, null, 2));
    console.log(`分析结果已保存到 ${outDir}`);
}

if (require.main === module) cli();
