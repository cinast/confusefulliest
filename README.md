# **confusefulliest** <spam style="font-size:10px">`not-well-prepared`</spam>

[**`en`**](./README.en.md) markdown doc at `./README.en.md`

## 万恶之源 —— Why did the project established？

创建这个项目的人是一个十分昏头昏脑的人  
——他因为搞不懂自己的曾经写的石山到底写了什么  
————总是昏头昏脑的在浏览器和 AI 之间转来转去，问了几千遍也没找到答案  
——————他受不了，企图逆天改命

于是就有了这个十分令人疑惑的项目  
And there comes such a project

## 这个项目会是什么样的 —— What it will be like

![alt text](/doc/愚蠢的做法.png)
居然有蠢货花了这么长时间做这玩意浪费生命 ↑

**参考**: [cinast/game[main]/source/core/Environment/world.ts#22](https://github.com/cinast/game/blob/934d6865704e02c909bc43c665e27ea0711398b0/source/core/Environment/world.ts#L22)

漂亮虽然说，但是世界上不会有比他更蠢的想法了  
人脑响应不过来，思路又老弄混，甚至还要改文件结构

还要重新思考到底要用到哪些概念，还有到底要如何怎么用它们，  
想构建这个东西那么得先想另一个东西，想到另一个东西还有其他东西与他牵连  
思路链太长，脑子装不下了  
又不得不把头脑风暴给搬出来，可是搬出来又花时间去写  
又又喂给 AI 生成，既有没有直观有没有逻辑，不如看 vsc 大纲  
想好了逻辑构造之后又要东改西改  
十分折磨人...

## 挖坑与预告片

-   ### 雏形

    一个命令行，一个解析器，一个绘图器

    -   **命令行** 调用主函数  
        `python main.py \<tar> -o \<output>`
    -   **解析器** 简简单单的基础的 JS/TS 文件的分析

        -   十分简单的大纲功能
        -   自定义的 AST  
            （为什么要自定义？因为原版杂物太多，而且后续兼容多语言时某个语言的 AST 又不一定一样，所以统一一个自定义）  
            （那你这个“AST”要是与其他的 AST 冲突怎么办？相信后人的智慧）

    -   **绘图器**

        -   至少有大纲
        -   逻辑流程图稍后做

        别问我为什么最开始考虑的是 drawio，  
        因为要的是可编辑性，  
        虽然说 HTML 也可以，  
        也许但是也许吧也许吧  
        也许吧也许吧好吧稍后添加上

-   ### 能成一个应用的时候

    -   一个客户端
    -   多种绘图模式
    -   解析 js-ts 至少没有麻烦了

\*幻想时刻\*

-   ### 十分成熟的时候

    -   主流语言能够解析完全
    -   甚至可以在绘图界面更改直接代码逻辑而且不报错
    -   多种绘图模式
    -   巴拉巴拉巴拉巴拉巴拉巴拉巴巴巴拉巴拉巴拉巴拉巴巴

-   ### vsc 插件

    你别想了，  
     我只会 js、ts、py

## 参考手册

-   [doc://现状&工程细节介绍](doc\现状.md)
-   [doc://样例 drawio](doc\example.drawio)
-   [彩蛋 0](undefined)
-   [彩蛋 1](about:blank)
-   [彩蛋 2](https://www.bilibili.com/video/av546403908/)

啊然后是什么..稿子...来自
我#￥ G ￥（@#FG（%）
56w<QjoZ%fnG~),n!2P@{e$i"$Zv`NRH|)ros?DsGE$hk,u3qE)#7zVy(qJ|>6&;B*6JirI*&%&

> **报错**:`词崩引发了口吃综合症`  
> **报错**:`意识流 **被创了**`  
> **报错**:`响应丢包严重`  
> **最后通牒**:`焯！ 我缺的乙酰胆碱谁给我补啊！！！`  
> 閹  洟绮︽ 鎴犳瘖缁涘  鍋呮担鐘叉烫屯锟斤拷 ��

宕机，卒  
\*\*brain hooked\*\* ——`the end`

### 引用信息

> `drawpyo-0.2.2` ——`py-drawio`项目的好东西  
> `Palenight Theme` — 一个 颜色主题插件 但我只用了他颜色

\*项目混乱，有待整理...\*  
_ds 有点难掌控..._
