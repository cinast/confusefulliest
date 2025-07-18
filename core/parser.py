import json
import os
import subprocess
from pathlib import Path
from typing import Dict, Optional
import logging

class CodeParser:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
    def parse_file(self, file_path: str) -> Optional[Dict]:
        """Parse a code file and return data"""
        path = Path(file_path)
        if not path.exists():
            self.logger.error(f"File not found: {file_path}")
            return None
            
        if path.suffix.lower() in ('.ts', '.js'):
            return self._parse_with_ts_parser(file_path)
        else:
            self.logger.error(f"Unsupported file type: {path.suffix}")
            return None
        
            
    def _parse_with_ts_parser(self, file_path: str) -> Optional[Dict]:
        """Call the TypeScript parser and process results"""
        

        try:
            # 使用绝对路径确保能找到文件
            base_dir = Path(__file__).parent.parent
            ts_parser_path = base_dir / "ts-parser" / "index.ts"
            analyzed_path = base_dir / "ts-parser" / "tmp" / "analyzed.json"

            # try : 
            #     os.remove(analyzed_path)
            # except Exception as e:
                
            
            self.logger.info(f"Trying to parse with: {ts_parser_path}")
            
            if not ts_parser_path.exists():
                self.logger.error(f"TS parser not found at: {ts_parser_path}")
                return None
                
            # 获取Node.js安装路径
            node_path = subprocess.run(
                ["where", "node"],
                capture_output=True,
                text=True
            ).stdout.splitlines()[0].strip()
            npm_path = str(Path(node_path).parent / "npx.cmd")
            
            subprocess.run(
                [npm_path, "ts-node", str(ts_parser_path), file_path],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                cwd=str(base_dir)
            )
            

            try:
                with open(analyzed_path, "r", encoding='utf-8') as f:
                    ast_data = json.load(f)
                return self._standardize_ast(ast_data)
            except Exception as e:
                self.logger.error(f"Failed to read/parse analyzed.json: {str(e)}")
                return None
            
        except Exception as e:
            self.logger.error(f"Parsing failed: {str(e)}")
            return None
        

            
    def _standardize_ast(self, ast_data: Dict) -> Dict:
        """Convert parser-specific AST to standard format with full details"""
        standardized = {
            "filename": ast_data.get("filename", ""),
            "language": ast_data.get("language", "unknown"),
            "nodes": []
        }
        
        # Process classes, interfaces, functions etc.
        for category in ["classes", "interfaces", "functions", "variables", "types", "enums"]:
            for node in ast_data.get(category, []):
                std_node = {
                    "type": category[:-1],  # Remove 's' (class, interface etc)
                    "name": node.get("name", ""),
                    "kind": node.get("kind", ""),
                    "value": node.get("value", ""),
                    "children": []
                }
                
                # Process class members
                if category == "classes":
                    for prop in node.get("properties", []):
                        std_node["children"].append({
                            "type": "property",
                            "name": prop.get("name", ""),
                            "kind": prop.get("type", ""),
                            "relationship": "has"
                        })
                    
                    for method in node.get("methods", []):
                        std_node["children"].append({
                            "type": "method", 
                            "name": method.get("name", ""),
                            "kind": method.get("returnType", ""),
                            "relationship": "has"
                        })
                
                # Process interface members
                elif category == "interfaces":
                    for prop in node.get("properties", []):
                        std_node["children"].append({
                            "type": "property",
                            "name": prop.get("name", ""),
                            "kind": prop.get("type", ""),
                            "relationship": "requires"
                        })
                
                standardized["nodes"].append(std_node)
        
        return standardized

if __name__ == "__main__":
    # Test the parser
    import logging
    logging.basicConfig(level=logging.INFO)
    
    parser = CodeParser()
    test_file = "ts-parser/test/sample.ts"
    result = parser.parse_file(test_file)
    
    if result:
        print("Parsing successful!")
        print(json.dumps(result, indent=2))
    else:
        print("Parsing failed")