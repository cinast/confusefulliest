import re
from typing import List, Dict
from pathlib import Path

class JSParser:
    """解析JavaScript/TypeScript代码并提取大纲结构"""
    
    def __init__(self):
        self.patterns = {
            'import': re.compile(r'^import\s+(?:.*?\s+from\s+)?[\'"](.+?)[\'"]'),
            'class': re.compile(r'^(export\s+)?(?:abstract\s+)?class\s+(\w+)'),
            'interface': re.compile(r'^(export\s+)?interface\s+(\w+)'),
            'type': re.compile(r'^(export\s+)?type\s+(\w+)'),
            'enum': re.compile(r'^(export\s+)?enum\s+(\w+)'),
            'namespace': re.compile(r'^(export\s+)?namespace\s+(\w+)'),
            'module': re.compile(r'^declare\s+module\s+[\'"](.+?)[\'"]'),
            'function': re.compile(r'^(export\s+)?(?:async\s+)?function\s+(\w+)'),
            'arrow_function': re.compile(r'^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*\(.*\)\s*=>'),
            'method': re.compile(r'^(?:\w+\s+)?(\w+)\s*\(.*\)\s*(?::\s*\w+)?\s*[\{=]'),
            'variable': re.compile(r'^(export\s+)?(const|let|var)\s+(\w+)'),
            'decorator': re.compile(r'^@(\w+)')
        }
    
    def parse_file(self, file_path: str) -> Dict[str, List]:
        """解析单个文件并返回大纲结构"""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")
            
        result = {
            'imports': [],
            'classes': [],
            'interfaces': [],
            'types': [],
            'enums': [],
            'namespaces': [],
            'modules': [],
            'functions': [],
            'arrow_functions': [],
            'variables': [],
            'decorators': []
        }
        
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                self._parse_line(line, result)
                
        return result
    
    def _parse_line(self, line: str, result: Dict):
        """解析单行代码并更新结果"""
        # 检查导入语句
        if match := self.patterns['import'].match(line):
            result['imports'].append(match.group(1))
            
        # 检查类定义
        elif match := self.patterns['class'].match(line):
            result['classes'].append(match.group(2))
            
        # 检查函数定义
        elif match := self.patterns['function'].match(line):
            result['functions'].append(match.group(2))
            
        # 检查接口定义
        elif match := self.patterns['interface'].match(line):
            result['interfaces'].append(match.group(2))
        # 检查类型别名
        elif match := self.patterns['type'].match(line):
            result['types'].append(match.group(2))
        # 检查枚举
        elif match := self.patterns['enum'].match(line):
            result['enums'].append(match.group(2))
        # 检查命名空间
        elif match := self.patterns['namespace'].match(line):
            result['namespaces'].append(match.group(2))
        # 检查模块声明
        elif match := self.patterns['module'].match(line):
            result['modules'].append(match.group(1))
        # 检查箭头函数
        elif match := self.patterns['arrow_function'].match(line):
            result['arrow_functions'].append(match.group(1))
        # 检查变量声明
        elif match := self.patterns['variable'].match(line):
            result['variables'].append(match.group(3))
        # 检查装饰器
        elif match := self.patterns['decorator'].match(line):
            result['decorators'].append(match.group(1))

if __name__ == "__main__":
    parser = JSParser()
    sample_code = """
    import React from 'react';
    const name = 'Test';
    class MyComponent {}
    function myFunc() {}
    """
    
    # 测试解析器
    print(parser.parse_file("sample.js"))
