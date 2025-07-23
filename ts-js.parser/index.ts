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
 *    |             2  decorator(call expression) >
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
 *    cls.statements[1].functionBody[2] (variable expression)  >
 *    |    modifier ["declare","const"] //有些修饰词的语义是处于灰色部分的，难分，不如放一起
 *    |    objects (expressions)[ // 适应解构模式
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
 *    |                 condition  Expression
 *    |                 body  Statement[] >
 *    |                         1 returnStatement >
 *    |                                       Statement
 *    |             2 else-if >
 *    |                 condition Expression
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
interface BaseStatement {
    /**
     * for index-ing & identity use
     * @see idMap
     */
    id: string;
    path: string[];
    location: {
        start: number;
        end: number;
    };
}

// 沿用 Declaration和 Statement 两大分类
interface Declaration extends BaseStatement {
    /**
     * Declaration which declared with anonymity such as `()=>{}` will not have the property
     * Like original AST dose
     */
    name?: string;
    /**
     * @see CommentsInfo
     */
    comments?: CommentsInfo[];
    /** text of lines of decorators,
     *  thats enough
     */
}

interface VariableDeclaration extends Declaration {
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    definingModifier: "const" | "let" | "var";
    /**
     * const [a,b],{c} = [1,2],{id:"00",v:"oh"};
     */
    objects: Array<{
        name: string;
        type?: string;
        typeInferred: string;
        value: string;
    }>;
    valueScope: string;
}

interface FunctionDeclaration extends Declaration {
    decorators?: string[];
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    typeModifier?: "async" | "generic" | "async-generic";
    // name?: string;
    parameters?: SingleParameterDeclaration[];
    typeParameters?: SingleTypeParameterDeclaration[];
    returnType?: string;
    returnTypeInferred: string;
    returnCases?: Statement[];
    yieldCases?: Statement[];
    functionBody: Statement[];
    thisScope?: string;
    prototype: {
        constructor?: string;
        __proto__?: string;
    };
    overloads?: string[];
}

interface SingleParameterDeclaration extends Declaration {
    decorators?: string[];
    // name: string;
    type?: string;
    typeInferred: string;
    modifiers?: NonEmptySubArrayOf<["readonly", ItemIn<["?", "="]>]> | ["..."];
    default?: string;
}

interface TypeFunctionDeclaration extends Declaration {
    decorators: never;
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    // name?: string;
    typeParameters: SingleTypeParameterDeclaration[];
    returnType: string;
    returnTypeInferred: string;
    overloads?: string[];
}

interface SingleTypeParameterDeclaration extends Declaration {
    decorators: never;
    modifiers?: NonEmptySubArrayOf<["="]>;
    // name: string;
    typeExtends?: string;
    typeTypeInferred: string;
    default?: string;
}

/**
 *         ↓keyword ↓typeParameters
 * export type T   <a> = Record<str,a> ←typeValue
 * ^modifier   ^typeName
 */
interface TypeAliasDeclaration extends Declaration {
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    typeName: string;
    typeValue: string;
}

interface InterfaceDeclaration extends Declaration {
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    properties: PropertyDeclaration[];
}

interface EnumDeclaration extends Declaration {
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    members: string[];
}

/**
 * 因为内部下一级结构简单，采用大纲式解析
 */
interface ClassDeclaration extends Declaration {
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    definingModifier: NonEmptySubArrayOf<["abstract"]>;
    extends?: string;
    implements: string[];
    methods: MethodDeclaration[];
    properties: PropertyDeclaration[];
    children: Array<
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration
        | TypeFunctionDeclaration
        | VariableDeclaration
    >;
    prototype: { constructor: string; __proto__?: string };
}

// accessModifier 是有关于这个属性或者方法如何被外部使用的关键字集合
// definingModifier 则是关于这个属性或者方法它的性质的关键字
// static 我觉得他是决定属性在类对象还是实例对象上的关键字，我列入了 accessModifier
// declare 他只是说别的文件能不能直接引用这个属性/对象，并没有改变这个属性/对象是怎么样的，我列入了 accessModifier
// accessor 。。。难绷

interface PropertyDeclaration extends Declaration {
    decorators?: string[];
    accessModifier?: NonEmptySubArrayOf<["declare", "override", "public", "private", "protected", "readonly", "static"]>;
    // definingModifier?: NonEmptySubArrayOf<["accessor"]>;
    // name
    type?: string;
    typeInferred: string;
    value: string;
}

interface MethodDeclaration extends MakeAny<FunctionDeclaration, "accessModifier", true> {
    accessModifier?: NonEmptySubArrayOf<["declare", "override", "public", "private", "protected", "static"]>;
    definingModifier: NonEmptySubArrayOf<["get", "set", "constructor"]>;
}

interface NamespaceDeclaration extends Declaration {
    accessModifier?: NonEmptySubArrayOf<["declare", "export"]>;
    children: Array<
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration
        | TypeFunctionDeclaration
        | VariableDeclaration
    >;
    statements: Statement[];
}

interface Statement extends BaseStatement {
    type: string;
}

/**
 * single statement lead by `if()` \
 * processing `if`statement and `else` or `else if` nextly as a `if`chain \
 * easier processing logic
 */
interface IfStatement extends Statement {
    type: "IfStatement";
    /**
     * 1 if()
     * 2 else if
     * n else or else if
     */
    Chain: Array<{
        index: number;
        /**
         * only when it is else case,
         * there haven't the condition property
         */
        condition?: Expression;
        body: Statement[];
    }>;
}

/**
 * @see-also IfStatement
 * similar logic, but diff properties
 */
interface switchStatement extends Statement {
    type: "switchStatement";
    switch: Expression;
    cases: Array<{
        index: number;
        match: Expression;
        body: Statement[];
    }>;
}

/**
 * @notice `catches` is the `e` of `catch(e)`
 */
interface tryStatement extends Statement {
    type: "tryStatement";
    try: Statement[];
    /**
     * catch(e)
     * ------^
     */
    catches: string;
    /**
     * catch(e){...
     * ----------^
     */
    catch: Statement[];
    finally: Statement[];
}

interface BreakStatement extends Statement {
    type: "BreakStatement";
    label?: string;
}

interface ContinueStatement extends Statement {
    type: "ContinueStatement";
    label?: string;
}

interface DebuggerStatement extends Statement {
    type: "DebuggerStatement";
}

interface DeleteExpression extends Expression {
    type: "DeleteExpression";
    expression: Expression;
}

interface DoWhileStatement extends Statement {
    type: "DoWhileStatement";
    body: Statement[];
    condition: Expression;
}

interface WhileStatement extends Statement {
    type: "WhileStatement";
    condition: Expression;
    body: Statement[];
}

interface ForStatement extends Statement {
    type: "ForStatement";
    initializer?: Statement | Expression;
    condition?: Expression;
    incrementor?: Expression;
    body: Statement[];
}

interface ForInStatement extends Statement {
    type: "ForInStatement";
    initializer: Statement | Expression;
    expression: Expression;
    body: Statement[];
}

interface ForOfStatement extends Statement {
    type: "ForOfStatement";
    initializer: Statement | Expression;
    expression: Expression;
    body: Statement[];
}

interface WithStatement extends Statement {
    type: "WithStatement";
    expression: Expression;
    body: Statement[];
}

interface YieldExpression extends Expression {
    type: "YieldExpression";
    expression?: Expression;
    delegate?: boolean;
}

interface AwaitExpression extends Expression {
    type: "AwaitExpression";
    expression: Expression;
}

interface ModuleDeclaration extends Declaration {
    type: "ModuleDeclaration";
    name: string;
    body: Statement[];
}

interface UsingStatement extends Statement {
    type: "UsingStatement";
    declarations: VariableDeclaration[];
    body: Statement[];
}

interface Expression extends BaseStatement {}

interface devTokens extends BaseStatement {}

interface CommentsInfo extends Omit<BaseStatement, "comments"> {
    /**
     * normal `//` `/*`
     * jsDoc `/**`
     * Compiling `//@ts-xxx` `/// <...>`
     */
    type: "normal" | "jsDoc" | "Compiling";
    content: string;
    /**
     * Usual seen where using jsDoc,
     * linked with what the comment described to.
     */
    decorateTo?: string;
    /**
     * @ComingSoon
     */
    //  jsDocBody: ???
}

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
    //         else if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
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
