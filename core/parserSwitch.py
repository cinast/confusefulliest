# sys
from pathlib import Path
import subprocess
import logging
import os
import json

"".removesuffix
# lib function
from typing import Dict, Optional
from promise import Promise
from enum import Enum


class CodeParser:
    """
    形式接口，真正的parser们在xx.parser/index.xx下（有些可以共用的会合并为a-b.parser，如js、ts）
    在main调用，或者直接调用也行
    """

    parserList: Dict[str, str] = {
        "js": "ts-js.parser/index.ts",
        "ts": "ts-js.parser/index.ts",
    }
    """
    内置路径，以后会移至到`setting/`
    """

    def parsingFile(self, filePath: str, outDir: Optional[str]) -> Promise:
        """
        处理文件
        Args:
            filePath (str): 目标文件的位置
            outDir = "/tmp/xx_analyzed.json" (str, optional): 输出的位置

        Returns:
            Promise：
        """

        def resolver(resolve, reject):
            nonlocal outDir
            try:
                path = Path(filePath)
                # 文件尾缀，过滤后是支持的语言类型之一
                fileType: str = path.suffix.lower().removeprefix(".")

                if not path.exists():
                    self.logger.error(f"File not found: {filePath}")
                    reject(FileNotFoundError(f"File not found: {filePath}"))
                    return

                if not fileType in self.parserList:
                    self.logger.error(f"FileType not supported: {path.suffix.lower()}")
                    self.logger.info(f"*info* Supported: {self.parserList.keys}")
                    reject(ValueError(f"FileType not supported: {path.suffix.lower()}"))
                    return

                base_dir = Path(__file__).parent.parent
                parser_path = base_dir / self.parserList[fileType]
                outDir = (
                    (outDir if outDir else base_dir)
                    / "tmp"
                    / f"{fileType}.analyzed.json"
                )

                try:
                    os.remove(outDir)
                except Exception:
                    pass

                self.logger.info(f"Trying to parse with: {parser_path}")

                if not parser_path.exists():
                    self.logger.error(f"{fileType} parser not found at: {parser_path}")
                    reject(
                        FileNotFoundError(
                            f"{fileType} parser not found at: {parser_path}"
                        )
                    )
                    return

                def handle_js_ts_parsing():
                    # Node.js路径
                    try:
                        node_path = (
                            subprocess.run(
                                ["where", "node"], capture_output=True, text=True
                            )
                            .stdout.splitlines()[0]
                            .strip()
                        )
                        npm_path = str(Path(node_path).parent / "npx.cmd")

                        # 边run边吐日志
                        result = subprocess.run(
                            [
                                npm_path,
                                "ts-node",
                                str(parser_path),
                                str(filePath),
                                str(outDir),
                            ],
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            errors="replace",
                            cwd=str(base_dir),
                        )
                        self.logger.info(result)

                        # 加载JSON
                        with open(outDir, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        return data
                    except Exception as e:
                        self.logger.error(
                            f"Failed to read/parse analyzed.json: {str(e)}"
                        )
                        raise

                result = None
                match fileType:
                    case "ts", "js":
                        result = handle_js_ts_parsing()

                if result:
                    standardized = self._standardize_ast(result)
                    resolve(standardized)
                else:
                    reject(
                        ValueError(
                            "Unsupported file type or parsing failed \nview core/parserSwitch.py 130"
                        )
                    )

            except Exception as e:
                self.logger.error(f"Parsing failed: {str(e)}")
                reject(e)

        return Promise(resolver)


if __name__ == "__main__":
    # Test the parser

    logging.basicConfig(level=logging.INFO)

    parser = CodeParser()
    test_file = "/ts-js.parser/test/sample.ts"
    result = parser.parsingFile(test_file)

    if result:
        print("Parsing successful!")
        print(json.dumps(result, indent=2))
    else:
        print("Parsing failed")
