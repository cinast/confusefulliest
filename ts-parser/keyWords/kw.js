var ts = require("typescript");

const EXCLUDED_KEYWORDS = [
    // 边界标记（非实际关键字）
    "FirstKeyword",
    "LastKeyword",
    "FirstContextualKeyword",
    "LastContextualKeyword",

    // 类型关键字（如 `number`, `string`, `boolean` 等）
    "BigIntKeyword",
    "BooleanKeyword",
    "NumberKeyword",
    "ObjectKeyword",
    "StringKeyword",
    "SymbolKeyword",
    "UndefinedKeyword",
    "UnknownKeyword",
    "AnyKeyword",
    "NeverKeyword",
    "VoidKeyword",

    // 特殊字面量（如 `true`, `false`, `null`）
    "TrueKeyword",
    "FalseKeyword",
    "NullKeyword",

    // 运算符（实值与类型）
    "TypeOfKeyword", // `typeof`
    "InstanceOfKeyword", // `instanceof`
    "InKeyword", // `in`
    "KeyOfKeyword", // `keyof`
    "InferKeyword", // `infer`
    "IsKeyword", // `is`
    "UniqueKeyword", // `unique symbol`
    "SatisfiesKeyword", // `satisfies` (TS 4.9+)
    "AssertsKeyword", // `asserts`
    "IntrinsicKeyword", // `intrinsic` (TS 内部使用)
];
// 获取所有关键字（去掉 "Keyword" 后缀并转小写）
const keywordKinds = Object.keys(ts.SyntaxKind)
    .filter((kind) => kind.endsWith("Keyword") && !EXCLUDED_KEYWORDS.includes(kind))
    .map((kind) => kind.replace(/Keyword$/, "").toLowerCase());

console.log(keywordKinds);
