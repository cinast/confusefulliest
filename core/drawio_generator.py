import drawpyo
from typing import Dict, TypedDict
import math

class DrawIOGenerator:
    def __init__(self,display_aspect_ratio = 3/2,height:float = None):
        """Initialize with enhanced Palenight Theme styles"""
        # colors from Palenight

        self.display_aspect_ratio = display_aspect_ratio

        self.theme = {
            "background": "#292D3E",
            "primary": "#7EA6E0",
            "secondary": "#82AAFF",
            "text": "#EEFFFF",
            "highlight": "#FFCB6B",
            "border": "#676E95",
            "code_bg": "#292D3E",
            "code_text": "#EEFFFF",
            "type": "#FFCB6B",
            "keyword": "#C792EA",
            "string": "#C3E88D",
            "number": "#F78C6C",
            "comment": "#676E95",
            "operator": "#89DDFF",
            "function": "#82AAFF",
            "variable": "#EEFFFF"
        }
        
        # Enhanced shape styles with more variations
        self.style_map = {
            "class": "rounded=1;whiteSpace=wrap;html=1;fillColor=#292D3E;strokeColor=#7EA6E0;fontColor=#EEFFFF;strokeWidth=3;shadow=0;glass=0;",
            "function": "rounded=1;whiteSpace=wrap;html=1;fillColor=#3f4668;strokeColor=#82AAFF;fontColor=#EEFFFF;strokeWidth=3;dashed=0;",
            "variable": "shape=ellipse;whiteSpace=wrap;html=1;fillColor=#434758;strokeColor=#676E95;fontColor=#EEFFFF;strokeWidth=2;",
            "interface": "rounded=1;whiteSpace=wrap;html=1;fillColor=#3f4668;strokeColor=#82AAFF;fontColor=#EEFFFF;dashed=1;strokeWidth=3;",
            "enum": "shape=ellipse;whiteSpace=wrap;html=1;fillColor=#434758;strokeColor=#676E95;fontColor=#EEFFFF;strokeWidth=2;",
            "property": "rounded=0;whiteSpace=wrap;html=1;fillColor=#292D3E;strokeColor=none;fontColor=#EEFFFF;strokeWidth=0;",
            "method": "rounded=0;whiteSpace=wrap;html=1;fillColor=#3f4668;strokeColor=none;fontColor=#82AAFF;strokeWidth=0;",
            "default": "rounded=1;whiteSpace=wrap;html=1;fillColor=#434758;strokeColor=#676E95;fontColor=#EEFFFF;strokeWidth=2;"
        }

    def generate_drawio(self, ast_data: Dict, output_path: str):
        """Generate hierarchical diagram with nested containers"""
        doc = drawpyo.File(file_name=output_path)
        page = drawpyo.Page(file=doc, title="Main")
        
        # Main diagram container
        main_container = drawpyo.diagram.Object(
            page=page,
            value="",
            position=(30, 75),
            width=1580,
            height=1075
        )
        main_container.apply_style_string(
            "swimlane;whiteSpace=wrap;html=1;movable=1;resizable=1;"
            "fillColor=none;swimlaneFillColor=none;"
        )
        
        # Starting position for top-level elements
        x_pos, y_pos = 50, 100
        
        # Process all top-level nodes
        for node in ast_data.get("nodes", []):
            # Create container for this node
            container = self._create_node_container(
                page=page,
                node=node,
                x=x_pos,
                y=y_pos,
                parent=main_container,
                is_top_level=True
            )
            
            # Update position for next node
            x_pos += container.width + 50
            if x_pos > 1400:  # Move to next row
                x_pos = 50
                y_pos += container.height + 50
        
        # Handle file writing with proper path handling
        import os
        abs_path = os.path.abspath(output_path)
        output_dir = os.path.dirname(abs_path)
        
        if output_dir:  # Only create dir if path contains directory
            os.makedirs(output_dir, exist_ok=True)
        
        # Write file with absolute path
        doc.write(file_path=abs_path, overwrite=True)
        
        print(f"Successfully generated diagram at: {abs_path}")
        
    def _calculate_container_size(self, node):
        """Recursively calculate container size based on content"""
        if node.get('children'):
            child_width, child_height = 0, 0
            for child in node['children']:
                cw, ch = self._calculate_container_size(child)
                child_width += cw + 20  # Add spacing
                child_height = max(child_height, ch)
            
            # Add padding
            width = max(node.get('min_width', 200), child_width + 40)
            height = max(node.get('min_height', 100), child_height + 60)
        else:
            # Leaf node default sizes
            width = node.get('width', 180)
            height = node.get('height', 40)
        return width, height

    def _sort_elements(self, elements):

        class RectObject(TypedDict):
            w: float  # 横长
            h: float  # 竖长
            no: int   # 编号
            con: Dict[int, float]  # 连系度序列

        def rectangle_packing(rects: list[RectObject], ratio: float, tolerance: float = 1e-5):
            """
            矩形包装算法
            :param rects: 小矩形列表
            :param ratio: 大矩形长宽比 A/B
            :param tolerance: 二分搜索精度
            :return: (min_area, A, B, positions)
            """
            if not rects:
                return 0.0, 0.0, 0.0, []

            n = len(rects)
            # 1. 计算B的搜索范围
            total_area = sum(rect['w'] * rect['h'] for rect in rects)
            max_height = max(rect['h'] for rect in rects)
            # B的下界
            B_low = max(max_height, math.sqrt(total_area / ratio))
            # B的上界初始估计
            B_high = B_low * 2.0

            # 2. 天际线放置算法
            def try_place(B: float):
                A = ratio * B
                skyline = [(0.0, A, 0.0)]  # (x_start, x_end, y)
                positions = [None] * n

                # 按高度降序排序矩形
                sorted_rects = sorted(rects, key=lambda r: -r['h'])

                for rect in sorted_rects:
                    w, h = rect['w'], rect['h']
                    best_y = float('inf')
                    best_x = None
                    best_seg_idx = None

                    for seg_idx, seg in enumerate(skyline):
                        x_start, x_end, y_current = seg
                        seg_length = x_end - x_start

                        if seg_length >= w and y_current + h <= B:
                            if y_current < best_y or (y_current == best_y and x_start < best_x):
                                best_y = y_current
                                best_x = x_start
                                best_seg_idx = seg_idx

                    if best_seg_idx is None:
                        return None

                    positions[rect['no']] = (best_x, best_y)
                    seg = skyline.pop(best_seg_idx)
                    x_start, x_end, y_current = seg

                    new_segments = []
                    if x_start < best_x:
                        new_segments.append((x_start, best_x, y_current))
                    new_segments.append((best_x, best_x + w, y_current + h))
                    if best_x + w < x_end:
                        new_segments.append((best_x + w, x_end, y_current))

                    skyline[best_seg_idx:best_seg_idx] = new_segments
                    merge_skyline(skyline)

                return positions

            def merge_skyline(skyline):
                skyline.sort(key=lambda s: s[0])
                i = 0
                while i < len(skyline) - 1:
                    s1 = skyline[i]
                    s2 = skyline[i+1]
                    if s1[2] == s2[2] and abs(s1[1] - s2[0]) < 1e-6:
                        skyline[i] = (s1[0], s2[1], s1[2])
                        skyline.pop(i+1)
                    else:
                        i += 1

            # 3. 二分搜索最小B值
            min_B = None
            while B_high - B_low > tolerance:
                B_mid = (B_low + B_high) / 2.0
                if try_place(B_mid) is not None:
                    min_B = B_mid
                    B_high = B_mid
                else:
                    B_low = B_mid

            # 4. 最终放置
            if min_B is None:
                # 线性扩大上界直到找到解
                while True:
                    positions = try_place(B_high)
                    if positions is not None:
                        min_B = B_high
                        break
                    B_high *= 1.5
                    if B_high > 100 * B_low:  # 防止无限循环
                        raise ValueError("无法找到可行解，请检查输入")
            else:
                positions = try_place(min_B)

            A = ratio * min_B
            min_area = A * min_B
            return min_area, A, min_B, positions
        
        # 转换elements为RectObject列表
        rects = []
        for i, elem in enumerate(elements):
            w, h = self._calculate_container_size(elem)
            rects.append({
                'w': w,
                'h': h,
                'no': i,
                'con': {}  # 留空供后续填充
            })
        
        _, A, B, positions = rectangle_packing(rects,self.display_aspect_ratio)
        
        # 根据位置排序元素
        sorted_elements = [None] * len(elements)
        for i, pos in enumerate(positions):
            sorted_elements[i] = elements[i]
            
        return sorted_elements

    def _create_node_container(self, page, node, x, y, parent, is_top_level=False):
        """Create a container with calculated size and layout"""
        # Calculate size based on content
        width, height = self._calculate_container_size(node)
        
        # Create main container with conditional border
        border_style = "strokeColor=none;" if not node.get('show_border') else f"strokeColor={self.theme['primary']};"
        bg_color = self.theme['background']
        
        container = drawpyo.diagram.Object(
            page=page,
            value="",
            position=(x, y),
            width=width,
            height=height,
            parent=parent
        )
        container.apply_style_string(
            f"rounded=1;whiteSpace=wrap;html=1;"
            f"fillColor={bg_color};"
            f"{border_style}"
            "strokeWidth=3;"
        )
        
        # Add title bar with name and type
        title = f"{node.get('name', 'unnamed')}"
        if node.get('kind') and len(node['kind']) < 20:  # Only show short types
            title += f" : {node['kind']}"
            
        title_obj = drawpyo.diagram.Object(
            page=page,
            value=f"<b>{title}</b>",
            position=(x+5, y+5),
            width=width-10,
            height=30,
            parent=container
        )
        title_obj.apply_style_string(
            f"fillColor=none;fontFamily=Verdana;fontSize=14;"
            f"fontColor={self.theme['highlight']};html=1;"
        )
        
        # Add sorted and positioned content
        content_y = y + 60  # Extra space for title
        sorted_children = self._sort_elements(node.get('children', []))
        
        for child in sorted_children:
            child_width, child_height = self._calculate_container_size(child)
            
            if self._is_complex(child):
                child_container = self._create_node_container(
                    page=page,
                    node=child,
                    x=x + 20,  # Indent children
                    y=content_y,
                    parent=container
                )
                content_y += child_height + 15  # Vertical spacing
            else:  # Simple child shows as code
                code_obj = drawpyo.diagram.Object(
                    page=page,
                    value=self._format_code_snippet(child),
                    position=(x+10, content_y),
                    width=width-20,
                    height=40,
                    parent=container
                )
                code_obj.apply_style_string(
                    f"fillColor={self.theme['code_bg']};"
                    f"fontColor={self.theme['code_text']};"
                    "fontFamily=Consolas;fontSize=12;"
                    "html=1;whiteSpace=wrap;"
                )
                content_y += 50
        
        # Add return value and parameters sections for functions
        if node.get('type') == 'function':
            if node.get('returns'):
                self._add_return_section(
                    page=page,
                    node=node,
                    container=container,
                    x=x,
                    y=y,
                    width=width
                )
            if node.get('parameters'):
                self._add_parameters_section(
                    page=page,
                    node=node,
                    container=container,
                    x=x,
                    y=y,
                    width=width
                )
            
        # Update container height based on content
        container.height = content_y - y + 20
        return container
        
    def _is_complex(self, node: Dict) -> bool:
        """Check if node should be rendered as complex container"""
        return (node.get('children') or 
                len(node.get('name', '')) > 20 or
                len(node.get('kind', '')) > 30)
                
    def _format_code_snippet(self, node: Dict) -> str:
        """Format node with syntax highlighting"""
        parts = []
        if node.get('type'):
            parts.append(f'<span style="color:{self.theme["keyword"]}">{node["type"]}</span>')
        if node.get('name'):
            parts.append(f'<span style="color:{self.theme["text"]}">{node["name"]}</span>')
        if node.get('kind'):
            parts.append(f'<span style="color:{self.theme["operator"]}">:</span> '
                        f'<span style="color:{self.theme["type"]}">{node["kind"]}</span>')
        if node.get('value'):
            parts.append(f'<span style="color:{self.theme["operator"]}">=</span> '
                        f'<span style="color:{self.theme["string"]}">{node["value"]}</span>')
        
        return '<div style="font-family:Consolas;font-size:12px">' + ' '.join(parts) + '</div>'
               
    def _add_return_section(self, page, node, container, x, y, width):
        """Add return value section to function container (left side)"""
        returns = node['returns']
        if isinstance(returns, dict) and returns.get('complex'):
            # Complex return type - use dots
            for i, ret in enumerate(returns['items']):
                dot = drawpyo.diagram.Object(
                    page=page,
                    value="•",
                    position=(x+10, y + container.height - 30 - i*20),
                    width=10,
                    height=10,
                    parent=container
                )
                text = drawpyo.diagram.Object(
                    page=page,
                    value=ret,
                    position=(x+25, y + container.height - 30 - i*20),
                    width=width-35,
                    height=15,
                    parent=container
                )
                text.apply_style_string(
                    f"fontColor={self.theme['text']};"
                    "fontFamily=Consolas;fontSize=12;"
                )
        else:
            # Simple return type
            return_obj = drawpyo.diagram.Object(
                page=page,
                value=f"→ {returns}",
                position=(x+10, y + container.height - 30),
                width=width-20,
                height=20,
                parent=container
            )
            return_obj.apply_style_string(
                f"fontColor={self.theme['type']};"
                "fontFamily=Consolas;fontSize=12;"
            )

    def _add_parameters_section(self, page, node, container, x, y, width):
        """Add parameters section to function container (right side)"""
        params = node['parameters']
        if isinstance(params, dict) and params.get('complex'):
            # Complex parameters - use dots
            for i, param in enumerate(params['items']):
                dot = drawpyo.diagram.Object(
                    page=page,
                    value="•",
                    position=(x + width - 20, y + container.height - 30 - i*20),
                    width=10,
                    height=10,
                    parent=container
                )
                text = drawpyo.diagram.Object(
                    page=page,
                    value=param,
                    position=(x + width - 35, y + container.height - 30 - i*20),
                    width=width-35,
                    height=15,
                    align="right",
                    parent=container
                )
                text.apply_style_string(
                    f"fontColor={self.theme['text']};"
                    "fontFamily=Consolas;fontSize=12;"
                )
        else:
            # Simple parameters
            param_obj = drawpyo.diagram.Object(
                page=page,
                value=f"{params} ←",
                position=(x + width - 20, y + container.height - 30),
                width=width-20,
                height=20,
                align="right",
                parent=container
            )
            param_obj.apply_style_string(
                f"fontColor={self.theme['type']};"
                "fontFamily=Consolas;fontSize=12;"
            )

if __name__ == "__main__":
    # Example usage
    generator = DrawIOGenerator()
    sample_ast = {
        "filename": "sample.ts",
        "nodes": [
            {
                "type": "class",
                "name": "MyClass",
                "children": [
                    {"type": "function", "name": "constructor"},
                    {"type": "function", "name": "render"}
                ]
            }
        ]
    }
    generator.generate_drawio(sample_ast, "output.drawio")
