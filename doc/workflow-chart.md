```Mermaid
    graph LR

    A(cmd)  -->|sourceFile| B[main.py]
            -->|sourceFile| C{core/parserSwitch.py}
            -->|js/ts| ts-js[ts-parser\index.ts]
    0[选择]
           s[⚪***compile start*** cil entrance]
            -->|Ts/Js sourceFile|ts-js-A[tsc scanner]
            -->|token flow| ts-js-B[special AST analyzer **parseFile**]
            -->|js/ts “AST”| ts-js-C[core/drawio_generator.py]
            -->|translate into|O(output.drawio)
    e[信息流]
```

## 说明

本图是项目的运作流程图，  
其中 main.py 是入口，  
调用 [`parserSwitch.py`](../core/parserSwitch.py)[`.CodeParser(filePath,outDir?)`](https://github.com/cinast/confusefulliest/blob/3d560d22e0690b67de2e2bbcc938942139671eb1/core/parserSwitch.py#L15)类创建一个处理器，  
再调用[`.parsingFile()`](https://github.com/cinast/confusefulliest/blob/3d560d22e0690b67de2e2bbcc938942139671eb1/core/parserSwitch.py#L29)**选择**一个**处理器**生成一个 JSON（customized AST） `1`  
输出位置默认是 tmp。`2`  
处理完成后 main.py 再调用
[`drawio_generator.py`](../core/drawio_generator.py)[`.DrawIOGenerator()`](https://github.com/cinast/confusefulliest/blob/3d560d22e0690b67de2e2bbcc938942139671eb1/core/drawio_generator.py#L6)
[`.generate_drawio()`](https://github.com/cinast/confusefulliest/blob/3d560d22e0690b67de2e2bbcc938942139671eb1/core/drawio_generator.py#L44)  
输出 drawio 于 output.drawio 或者是`-o <output>` `3`

## 疑问回答

-   为什么要自定义抽象代码树？：

    -   在最开始我做的时候原来是先设计一个大纲  
        扔给 ds 做完之后，他做了一堆正则  
        愚蠢的做法，很浪费算算力  
        我想着用 AST 解析器会不会好  
        他在原来解析的 AST 上面给它变换成了另外一个结构  
        功能上很像 vsc 的大纲  
        本来到这里就差不多满足了  
        但是后来考虑到又要有逻辑流的绘制  
        我要跟他说在这个大纲结构里面加入这种设计  
        结果概念混乱的不成样子，痛失经费 2RMB  
        又回到原来的起点继续做大纲，但好巧不巧报错报到 ts 库里面了  
        又去翻资料  
        我那时一直在矛盾，使用原来的大纲结构还是用它的 AST  
        学习到[typescript-book](https://github.com/basarat/typescript-book)的时候，[`a`](#注脚)  
        翻资料的时候又在看[_ts-ast-viewer.com_](ts-ast-viewer.com)，
        我又觉得里面的东西可以拆一点出来再重构一下
        以至于感觉之前所有的一切甚至不如自己建一个 AST
        主意就这么来的

-   为什么项目为什么是多语言模式
    1.  python 他不是天，有些语言的语法特点的 py 里面不能体现，  
        也没有那么多的库能解析这么多语言
    2.  配合`1`问题
    3.  因为我对 Ts 和 Js 最熟悉，也是最开始也是最低的目标
    4.  我讨厌缩进语言，我讨厌没有静态提示的语言（我才不想控制台上给你纠来纠去）
    5.  语言对语言专业对口，逻辑处理才容易
    6.  我讨厌 Python
    7.  我讨厌 Python
    8.  我讨厌 Python
    9.  我讨厌 Python 为什么类型写起来这么奇怪
    10. 我讨厌 Python
    11. 我讨厌 Python
    12. 我讨厌 Python
    13. 我讨厌 Python
    14. 我讨厌 Python  
        但是 Python 项目打包开销小啊（哭笑）

#### 注脚

`a.`或见[`typescript-book-chinese`](https://jkchao.github.io/typescript-book-chinese/)
