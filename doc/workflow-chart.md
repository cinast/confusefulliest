```Mermaid
    graph LR

    A(cmd)  -->|sourceFile| B[main.py]
            -->|sourceFile| C{core\parser.py}
            -->|js/ts| ts-js[ts-parser\index.ts]
    0[选择]
           s[⚪***compile start*** cil entrance]
            -->|Ts/Js sourceFile|ts-js-A[tsc scanner]
            -->|token flow| ts-js-B[special AST analyzer **parseFile**]
            -->|js/ts “AST”| ts-js-C[visual\drawio_generator.py]
            -->|translate into|O(output.drawio)
    e[信息流]
```

## 说明

本图是项目的运作流程图，  
其中 main.py 是入口，调用
