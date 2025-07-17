import drawpyo
from typing import Dict

class DrawIOGenerator:
    def __init__(self):
        """Initialize with enhanced Palenight Theme styles"""
        # colors from Palenight
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
        """Sort elements by type weight and complexity"""
        type_weights = {
            'class': 100,
            'function': 80,
            'property': 60,
            'method': 70
        }
        return sorted(elements,
            key=lambda x: (
                -type_weights.get(x['type'], 50),
                -len(x.get('children', [])),
                x.get('name', '')
            ),
            reverse=True
        )

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

