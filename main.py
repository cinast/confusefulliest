import argparse
import json
import subprocess
import sys
from pathlib import Path

def run_ts_parser(file_path: str) -> dict:
    """调用TS解析器并返回结果"""
    ts_script = str(Path(__file__).parent / 'ts-parser' / 'index.ts')
    # Windows系统使用npx.cmd
    npx_path = str(Path(__file__).parent / 'node_modules' / '.bin' / 'npx.cmd')
    if not Path(npx_path).exists():
        npx_path = 'npx.cmd'  # 如果本地没有，尝试全局安装的npx
        
    cmd = [npx_path, 'ts-node', ts_script, file_path]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"TS解析器错误: {e.stderr}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print("无法解析TS解析器输出", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='TS/JS代码大纲解析工具')
    parser.add_argument('input', help='输入的TS/JS文件路径')
    parser.add_argument('-o', '--output', help='输出文件路径(JSON格式)')
    
    args = parser.parse_args()
    
    # 调用TS解析器
    result = run_ts_parser(args.input)
    
    # 输出结果
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"结果已保存到 {args.output}")
    else:
        print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
