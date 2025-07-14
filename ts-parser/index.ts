import * as ts from "typescript";

export interface CodeStructure {
    imports: string[];
    classes: ClassInfo[];
    interfaces: InterfaceInfo[];
    types: TypeAliasInfo[];
    enums: EnumInfo[];
    functions: FunctionInfo[];
    variables: VariableInfo[];
}

interface ClassInfo {
    name: string;
    methods: MethodInfo[];
    properties: PropertyInfo[];
}

interface InterfaceInfo {
    name: string;
    properties: PropertyInfo[];
}

interface TypeAliasInfo {
    name: string;
    type: string;
}

interface EnumInfo {
    name: string;
    members: string[];
}

interface FunctionInfo {
    name: string;
    parameters: ParameterInfo[];
    returnType: string;
}

interface MethodInfo extends FunctionInfo {
    isStatic: boolean;
}

interface VariableInfo {
    name: string;
    type: string;
}

interface PropertyInfo {
    name: string;
    type: string;
}

interface ParameterInfo {
    name: string;
    type: string;
}

function parseFile(filePath: string): CodeStructure {
    const program = ts.createProgram([filePath], {});
    const sourceFile = program.getSourceFile(filePath);
    const checker = program.getTypeChecker();

    const result: CodeStructure = {
        imports: [],
        classes: [],
        interfaces: [],
        types: [],
        enums: [],
        functions: [],
        variables: [],
    };

    if (!sourceFile) {
        return result;
    }

    ts.forEachChild(sourceFile, (node) => {
        // 解析导入语句
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier.getText();
            result.imports.push(moduleSpecifier.replace(/['"]/g, ""));
        }

        // 解析类定义
        else if (ts.isClassDeclaration(node) && node.name) {
            const classInfo: ClassInfo = {
                name: node.name.text,
                methods: [],
                properties: [],
            };

            node.members.forEach((member) => {
                if (ts.isMethodDeclaration(member) && member.name) {
                    classInfo.methods.push({
                        name: member.name.getText(),
                        parameters: [],
                        returnType: member.type?.getText() || "void",
                        isStatic: member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) || false,
                    });
                } else if (ts.isPropertyDeclaration(member) && member.name) {
                    classInfo.properties.push({
                        name: member.name.getText(),
                        type: member.type?.getText() || "any",
                    });
                }
            });

            result.classes.push(classInfo);
        }

        // 解析接口定义
        else if (ts.isInterfaceDeclaration(node)) {
            const interfaceInfo: InterfaceInfo = {
                name: node.name.text,
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
            result.types.push({
                name: node.name.text,
                type: node.type.getText(),
            });
        }

        // 解析枚举
        else if (ts.isEnumDeclaration(node)) {
            const enumInfo: EnumInfo = {
                name: node.name.text,
                members: [],
            };

            node.members.forEach((member) => {
                if (ts.isEnumMember(member) && member.name) {
                    enumInfo.members.push(member.name.getText());
                }
            });

            result.enums.push(enumInfo);
        }

        // 解析函数
        else if (ts.isFunctionDeclaration(node) && node.name) {
            result.functions.push({
                name: node.name.text,
                parameters: [],
                returnType: node.type?.getText() || "void",
            });
        }

        // 解析变量
        else if (ts.isVariableStatement(node)) {
            node.declarationList.declarations.forEach((decl) => {
                if (ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
                    result.variables.push({
                        name: decl.name.text,
                        type: decl.type?.getText() || "any",
                    });
                }
            });
        }
    });

    return result;
}

// 命令行接口
if (require.main === module) {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error("请提供要解析的文件路径");
        process.exit(1);
    }

    const result = parseFile(filePath);
    console.log(JSON.stringify(result, null, 2));
}
